use crate::types::*;
use anyhow::{anyhow, Result};
use chrono::Utc;
use log::{debug, error, info};
use serialport::{SerialPort, SerialPortType};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::thread;
use std::time::{Duration, Instant};

pub struct SerialManager {
    current_port: Option<Box<dyn SerialPort>>,
    config: Option<SerialConfig>,
    is_connected: bool,
    port_name: Option<String>,
    logs: Arc<Mutex<VecDeque<LogEntry>>>,
    stats: Arc<Mutex<SerialStats>>,
    shutdown_flag: Arc<AtomicBool>,
    max_log_entries: Arc<Mutex<usize>>,
    frame_segmentation_config: Arc<Mutex<FrameSegmentationConfig>>,
}

#[derive(Debug, Default)]
struct SerialStats {
    bytes_sent: u64,
    bytes_received: u64,
    connection_time: Option<chrono::DateTime<Utc>>,
}

impl SerialManager {
    pub fn new() -> Self {
        Self {
            current_port: None,
            config: None,
            is_connected: false,
            port_name: None,
            logs: Arc::new(Mutex::new(VecDeque::new())),
            stats: Arc::new(Mutex::new(SerialStats::default())),
            shutdown_flag: Arc::new(AtomicBool::new(false)),
            max_log_entries: Arc::new(Mutex::new(1000)),
            frame_segmentation_config: Arc::new(Mutex::new(FrameSegmentationConfig::default())),
        }
    }

    pub fn list_available_ports() -> Result<Vec<SerialPortInfo>> {
        let ports = serialport::available_ports()?;
        let mut port_infos = Vec::new();

        for port in ports {
            let port_info = SerialPortInfo {
                port_name: port.port_name.clone(),
                port_type: match &port.port_type {
                    SerialPortType::UsbPort(_) => "USB".to_string(),
                    SerialPortType::BluetoothPort => "Bluetooth".to_string(),
                    SerialPortType::PciPort => "PCI".to_string(),
                    SerialPortType::Unknown => "Unknown".to_string(),
                },
                description: match &port.port_type {
                    SerialPortType::UsbPort(usb) => usb.product.clone(),
                    _ => None,
                },
                manufacturer: match &port.port_type {
                    SerialPortType::UsbPort(usb) => usb.manufacturer.clone(),
                    _ => None,
                },
                product: match &port.port_type {
                    SerialPortType::UsbPort(usb) => usb.product.clone(),
                    _ => None,
                },
                serial_number: match &port.port_type {
                    SerialPortType::UsbPort(usb) => usb.serial_number.clone(),
                    _ => None,
                },
                vid: match &port.port_type {
                    SerialPortType::UsbPort(usb) => Some(usb.vid),
                    _ => None,
                },
                pid: match &port.port_type {
                    SerialPortType::UsbPort(usb) => Some(usb.pid),
                    _ => None,
                },
            };
            port_infos.push(port_info);
        }

        Ok(port_infos)
    }

    pub fn connect(&mut self, port_name: &str, config: SerialConfig) -> Result<()> {
        if self.is_connected {
            self.disconnect()?;
        }

        let builder = serialport::new(port_name, config.baud_rate)
            .data_bits(match config.data_bits {
                DataBits::Five => serialport::DataBits::Five,
                DataBits::Six => serialport::DataBits::Six,
                DataBits::Seven => serialport::DataBits::Seven,
                DataBits::Eight => serialport::DataBits::Eight,
            })
            .parity(match config.parity {
                Parity::None => serialport::Parity::None,
                Parity::Odd => serialport::Parity::Odd,
                Parity::Even => serialport::Parity::Even,
                Parity::Mark => serialport::Parity::None,
                Parity::Space => serialport::Parity::None,
            })
            .stop_bits(match config.stop_bits {
                StopBits::One => serialport::StopBits::One,
                StopBits::OnePointFive => serialport::StopBits::One,
                StopBits::Two => serialport::StopBits::Two,
            })
            .flow_control(match config.flow_control {
                FlowControl::None => serialport::FlowControl::None,
                FlowControl::Software => serialport::FlowControl::Software,
                FlowControl::Hardware => serialport::FlowControl::Hardware,
            })
            .timeout(Duration::from_millis(50)); // Short timeout for responsive reading

        let port = builder.open()?;
        info!("Successfully opened serial port: {}", port_name);

        // Reset and start reading thread
        self.shutdown_flag.store(false, Ordering::Relaxed);
        let logs = Arc::clone(&self.logs);
        let stats = Arc::clone(&self.stats);
        let max_log_entries = Arc::clone(&self.max_log_entries);
        let frame_segmentation_config = Arc::clone(&self.frame_segmentation_config);
        let port_name_clone = port_name.to_string();
        let shutdown_flag = Arc::clone(&self.shutdown_flag);
        let mut read_port = port.try_clone()?;

        thread::spawn(move || {
            let mut buffer = [0; 1024];
            let mut accumulated_data = Vec::new();
            let mut last_data_time = Instant::now();

            loop {
                // Check shutdown flag
                if shutdown_flag.load(Ordering::Relaxed) {
                    debug!("Reading thread shutting down for port: {}", port_name_clone);
                    break;
                }

                // Get current segmentation config
                let seg_config = frame_segmentation_config.lock()
                    .map(|guard| guard.clone())
                    .unwrap_or_default();
                let timeout_duration = Duration::from_millis(seg_config.timeout_ms);

                match read_port.read(&mut buffer) {
                    Ok(bytes_read) if bytes_read > 0 => {
                        accumulated_data.extend_from_slice(&buffer[..bytes_read]);
                        last_data_time = Instant::now();

                        // Check for delimiter-based segmentation
                        if seg_config.mode == FrameSegmentationMode::Delimiter ||
                           seg_config.mode == FrameSegmentationMode::Combined {

                            // Handle AnyNewline specially - it matches \r, \n, or \r\n as single delimiter
                            if seg_config.delimiter.is_any_newline() {
                                while let Some((pos, len)) = find_any_newline(&accumulated_data) {
                                    let frame_end = pos + len;
                                    let frame_data: Vec<u8> = accumulated_data.drain(..frame_end).collect();
                                    let data_len = frame_data.len();

                                    let log_entry = LogEntry {
                                        id: None,
                                        timestamp: Utc::now(),
                                        direction: Direction::Received,
                                        data: frame_data,
                                        format: DataFormat::Text,
                                        port_name: port_name_clone.clone(),
                                    };

                                    if let Ok(mut logs_guard) = logs.lock() {
                                        logs_guard.push_back(log_entry);
                                        let max_entries = *max_log_entries.lock().unwrap_or_else(|e| e.into_inner());
                                        while logs_guard.len() > max_entries {
                                            logs_guard.pop_front();
                                        }
                                    }

                                    if let Ok(mut stats_guard) = stats.lock() {
                                        stats_guard.bytes_received += data_len as u64;
                                    }
                                }
                            } else {
                                // Standard delimiter matching
                                let delimiter_bytes = seg_config.delimiter.to_bytes();

                                // Process all complete frames in accumulated data
                                while let Some(pos) = find_delimiter(&accumulated_data, &delimiter_bytes) {
                                    let frame_end = pos + delimiter_bytes.len();
                                    let frame_data: Vec<u8> = accumulated_data.drain(..frame_end).collect();
                                    let data_len = frame_data.len();

                                    let log_entry = LogEntry {
                                        id: None,
                                        timestamp: Utc::now(),
                                        direction: Direction::Received,
                                        data: frame_data,
                                        format: DataFormat::Text,
                                        port_name: port_name_clone.clone(),
                                    };

                                    if let Ok(mut logs_guard) = logs.lock() {
                                        logs_guard.push_back(log_entry);
                                        let max_entries = *max_log_entries.lock().unwrap_or_else(|e| e.into_inner());
                                        while logs_guard.len() > max_entries {
                                            logs_guard.pop_front();
                                        }
                                    }

                                    if let Ok(mut stats_guard) = stats.lock() {
                                        stats_guard.bytes_received += data_len as u64;
                                    }
                                }
                            }
                        }
                    }
                    Ok(_) => {
                        // Check if we should flush accumulated data based on timeout
                        let should_flush_timeout =
                            (seg_config.mode == FrameSegmentationMode::Timeout ||
                             seg_config.mode == FrameSegmentationMode::Combined) &&
                            !accumulated_data.is_empty() &&
                            last_data_time.elapsed() > timeout_duration;

                        if should_flush_timeout {
                            let data_len = accumulated_data.len();
                            let log_entry = LogEntry {
                                id: None,
                                timestamp: Utc::now(),
                                direction: Direction::Received,
                                data: accumulated_data.clone(),
                                format: DataFormat::Text,
                                port_name: port_name_clone.clone(),
                            };

                            if let Ok(mut logs_guard) = logs.lock() {
                                logs_guard.push_back(log_entry);
                                let max_entries = *max_log_entries.lock().unwrap_or_else(|e| e.into_inner());
                                while logs_guard.len() > max_entries {
                                    logs_guard.pop_front();
                                }
                            }

                            // Update received bytes statistics
                            if let Ok(mut stats_guard) = stats.lock() {
                                stats_guard.bytes_received += data_len as u64;
                            }

                            accumulated_data.clear();
                        }
                        thread::sleep(Duration::from_millis(1));
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                        // Check if we should flush accumulated data on timeout
                        let should_flush_timeout =
                            (seg_config.mode == FrameSegmentationMode::Timeout ||
                             seg_config.mode == FrameSegmentationMode::Combined) &&
                            !accumulated_data.is_empty() &&
                            last_data_time.elapsed() > timeout_duration;

                        if should_flush_timeout {
                            let data_len = accumulated_data.len();
                            let log_entry = LogEntry {
                                id: None,
                                timestamp: Utc::now(),
                                direction: Direction::Received,
                                data: accumulated_data.clone(),
                                format: DataFormat::Text,
                                port_name: port_name_clone.clone(),
                            };

                            if let Ok(mut logs_guard) = logs.lock() {
                                logs_guard.push_back(log_entry);
                                let max_entries = *max_log_entries.lock().unwrap_or_else(|e| e.into_inner());
                                while logs_guard.len() > max_entries {
                                    logs_guard.pop_front();
                                }
                            }

                            // Update received bytes statistics
                            if let Ok(mut stats_guard) = stats.lock() {
                                stats_guard.bytes_received += data_len as u64;
                            }

                            accumulated_data.clear();
                        }
                        thread::sleep(Duration::from_millis(1));
                    }
                    Err(e) => {
                        error!("Error reading from serial port: {}", e);
                        break;
                    }
                }
            }
        });

        self.current_port = Some(port);
        self.config = Some(config);
        self.is_connected = true;
        self.port_name = Some(port_name.to_string());
        
        // Set connection time in stats
        if let Ok(mut stats_guard) = self.stats.lock() {
            stats_guard.connection_time = Some(Utc::now());
        }

        // Don't add connection log to reduce clutter
        info!("Connected to {} at {} baud", port_name, self.config.as_ref().unwrap().baud_rate);

        Ok(())
    }

    pub fn disconnect(&mut self) -> Result<()> {
        if self.is_connected {
            // Signal reading thread to stop
            self.shutdown_flag.store(true, Ordering::Relaxed);
            
            // Close the port first to force the reading thread to exit
            self.current_port = None;
            
            // Wait longer for thread to properly clean up
            thread::sleep(Duration::from_millis(200));
            
            self.is_connected = false;
            
            if let Some(port_name) = &self.port_name {
                // Don't add disconnection log to reduce clutter
                info!("Disconnected from {}", port_name);
            }
            
            self.port_name = None;
            self.config = None;
            
            // Reset stats
            if let Ok(mut stats_guard) = self.stats.lock() {
                *stats_guard = SerialStats::default();
            }
            
            info!("Serial port disconnected");
        }
        Ok(())
    }

    pub fn send_data(&mut self, data: Vec<u8>) -> Result<()> {
        if !self.is_connected {
            return Err(anyhow!("No port is currently open"));
        }

        if let Some(ref mut port) = self.current_port {
            port.write_all(&data)?;
            
            // Update sent bytes statistics
            if let Ok(mut stats_guard) = self.stats.lock() {
                stats_guard.bytes_sent += data.len() as u64;
            }

            // Add to logs
            self.add_log(LogEntry {
                id: None,
                timestamp: Utc::now(),
                direction: Direction::Sent,
                data,
                format: DataFormat::Text,
                port_name: self.port_name.clone().unwrap_or_default(),
            });

            Ok(())
        } else {
            Err(anyhow!("No port available"))
        }
    }

    pub fn get_status(&self) -> ConnectionStatus {
        let (bytes_sent, bytes_received, connection_time) = if let Ok(stats_guard) = self.stats.lock() {
            (stats_guard.bytes_sent, stats_guard.bytes_received, stats_guard.connection_time)
        } else {
            (0, 0, None)
        };
        
        ConnectionStatus {
            is_connected: self.is_connected,
            port_name: self.port_name.clone(),
            config: self.config.clone(),
            bytes_sent,
            bytes_received,
            connection_time,
        }
    }

    pub fn get_logs(&self) -> Vec<LogEntry> {
        if let Ok(logs) = self.logs.lock() {
            logs.iter().cloned().collect()
        } else {
            Vec::new()
        }
    }

    pub fn clear_logs(&mut self) {
        if let Ok(mut logs) = self.logs.lock() {
            logs.clear();
        }
    }

    pub fn export_logs(&self, file_path: &str, format: ExportFormat) -> Result<()> {
        use std::fs::File;
        use std::io::Write;

        let logs = self.get_logs();
        let mut file = File::create(file_path)?;

        match format {
            ExportFormat::Txt => {
                writeln!(file, "RSerial Debug Assistant - Log Export")?;
                writeln!(file, "Generated: {}", Utc::now().format("%Y-%m-%d %H:%M:%S UTC"))?;
                writeln!(file, "{}", "=".repeat(60))?;
                writeln!(file)?;

                for log in logs {
                    writeln!(
                        file,
                        "[{}] {}: {}",
                        log.timestamp.format("%H:%M:%S%.3f"),
                        match log.direction {
                            Direction::Sent => "TX",
                            Direction::Received => "RX",
                        },
                        String::from_utf8_lossy(&log.data)
                    )?;
                }
            }
            ExportFormat::Csv => {
                writeln!(file, "timestamp,direction,port,data")?;
                for log in logs {
                    writeln!(
                        file,
                        "{},{:?},{},\"{}\"",
                        log.timestamp.format("%Y-%m-%d %H:%M:%S%.3f"),
                        log.direction,
                        log.port_name,
                        String::from_utf8_lossy(&log.data).replace("\"", "\"\"")
                    )?;
                }
            }
            ExportFormat::Json => {
                let json_data = serde_json::to_string_pretty(&logs)?;
                file.write_all(json_data.as_bytes())?;
            }
        }

        Ok(())
    }

    fn add_log(&mut self, log_entry: LogEntry) {
        if let Ok(mut logs) = self.logs.lock() {
            logs.push_back(log_entry);
            let max_entries = *self.max_log_entries.lock().unwrap_or_else(|e| e.into_inner());
            while logs.len() > max_entries {
                logs.pop_front();
            }
        }
    }

    pub fn set_max_log_entries(&self, max_entries: usize) {
        let max_entries = max_entries.clamp(100, 10000);
        if let Ok(mut limit) = self.max_log_entries.lock() {
            *limit = max_entries;
        }
        // Trim existing logs if necessary
        if let Ok(mut logs) = self.logs.lock() {
            while logs.len() > max_entries {
                logs.pop_front();
            }
        }
    }

    pub fn get_max_log_entries(&self) -> usize {
        *self.max_log_entries.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn set_frame_segmentation_config(&self, config: FrameSegmentationConfig) {
        let config = FrameSegmentationConfig {
            timeout_ms: config.timeout_ms.clamp(10, 1000),
            ..config
        };
        if let Ok(mut guard) = self.frame_segmentation_config.lock() {
            *guard = config;
        }
    }

    pub fn get_frame_segmentation_config(&self) -> FrameSegmentationConfig {
        self.frame_segmentation_config
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }
}

/// Find the position of a delimiter in the data buffer
fn find_delimiter(data: &[u8], delimiter: &[u8]) -> Option<usize> {
    if delimiter.is_empty() || data.len() < delimiter.len() {
        return None;
    }

    data.windows(delimiter.len())
        .position(|window| window == delimiter)
}

/// Find any newline sequence (\r, \n, or \r\n) in the data buffer.
/// Returns (position, length) where length is 1 for \r or \n alone, and 2 for \r\n.
/// This correctly handles \r\n as a single line ending (not two separate ones).
fn find_any_newline(data: &[u8]) -> Option<(usize, usize)> {
    for i in 0..data.len() {
        match data[i] {
            0x0D => { // CR
                // Check if followed by LF (CRLF sequence)
                if i + 1 < data.len() && data[i + 1] == 0x0A {
                    return Some((i, 2)); // CRLF
                }
                return Some((i, 1)); // CR alone
            }
            0x0A => { // LF alone (not preceded by CR, as CRLF would have been caught above)
                return Some((i, 1));
            }
            _ => continue,
        }
    }
    None
}