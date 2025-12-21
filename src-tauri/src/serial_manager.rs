use crate::types::*;
use anyhow::{anyhow, Result};
use chrono::Utc;
use log::{debug, error, info, warn};
use serialport::{SerialPort, SerialPortType};
use std::collections::VecDeque;
use std::fs::{File, OpenOptions, create_dir_all};
use std::io::Write;
use std::path::PathBuf;
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
    // Recording file handles
    text_file: Arc<Mutex<Option<File>>>,
    raw_file: Arc<Mutex<Option<File>>>,
    text_file_path: Arc<Mutex<Option<String>>>,
    raw_file_path: Arc<Mutex<Option<String>>>,
    log_directory: Arc<Mutex<String>>,
    // Timezone offset in minutes for recording timestamps
    timezone_offset_minutes: Arc<Mutex<i32>>,
    // Display settings for pre-formatted log rendering
    display_settings: Arc<Mutex<DisplaySettings>>,
}

#[derive(Debug, Default)]
struct SerialStats {
    bytes_sent: u64,
    bytes_received: u64,
    connection_time: Option<chrono::DateTime<Utc>>,
}

impl SerialManager {
    pub fn new() -> Self {
        // Default log directory - will be overridden by frontend settings
        let default_log_dir = dirs::document_dir()
            .map(|p| p.join("SerialLogs"))
            .unwrap_or_else(|| PathBuf::from("./SerialLogs"))
            .to_string_lossy()
            .to_string();

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
            text_file: Arc::new(Mutex::new(None)),
            raw_file: Arc::new(Mutex::new(None)),
            text_file_path: Arc::new(Mutex::new(None)),
            raw_file_path: Arc::new(Mutex::new(None)),
            log_directory: Arc::new(Mutex::new(default_log_dir)),
            timezone_offset_minutes: Arc::new(Mutex::new(0)),
            display_settings: Arc::new(Mutex::new(DisplaySettings::default())),
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
        let text_file = Arc::clone(&self.text_file);
        let raw_file = Arc::clone(&self.raw_file);
        let timezone_offset = Arc::clone(&self.timezone_offset_minutes);
        let display_settings = Arc::clone(&self.display_settings);
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

                // Get current display settings for formatting
                let disp_settings = display_settings.lock()
                    .map(|guard| guard.clone())
                    .unwrap_or_default();

                match read_port.read(&mut buffer) {
                    Ok(bytes_read) if bytes_read > 0 => {
                        let received_bytes = &buffer[..bytes_read];
                        accumulated_data.extend_from_slice(received_bytes);
                        last_data_time = Instant::now();

                        // Write to raw recording file (raw bytes, no framing)
                        if let Ok(mut guard) = raw_file.lock() {
                            if let Some(ref mut file) = *guard {
                                let _ = file.write_all(received_bytes);
                            }
                        }

                        // Check for delimiter-based segmentation (only in Combined mode)
                        if seg_config.mode == FrameSegmentationMode::Combined {

                            // Handle AnyNewline specially - it matches \r, \n, or \r\n as single delimiter
                            if seg_config.delimiter.is_any_newline() {
                                while let Some((pos, len)) = find_any_newline(&accumulated_data) {
                                    let frame_end = pos + len;
                                    let frame_data: Vec<u8> = accumulated_data.drain(..frame_end).collect();
                                    let data_len = frame_data.len();

                                    // Write to text recording file with timestamp and RX label
                                    if let Ok(mut guard) = text_file.lock() {
                                        if let Some(ref mut file) = *guard {
                                            let tz_offset = *timezone_offset.lock().unwrap_or_else(|e| e.into_inner());
                                            let timestamp = format_timestamp_with_offset(tz_offset);
                                            let text = String::from_utf8_lossy(&frame_data);
                                            let _ = writeln!(file, "[{}] RX: {}", timestamp, text);
                                        }
                                    }

                                    // Format display text and timestamp based on current settings
                                    let tz_offset = *timezone_offset.lock().unwrap_or_else(|e| e.into_inner());
                                    let display_text = format_data_for_display(&frame_data, &disp_settings);
                                    let timestamp_formatted = if disp_settings.show_timestamps {
                                        Some(format_timestamp_with_offset(tz_offset))
                                    } else {
                                        None
                                    };

                                    let log_entry = LogEntry {
                                        id: None,
                                        timestamp: Utc::now(),
                                        direction: Direction::Received,
                                        data: frame_data,
                                        format: DataFormat::Text,
                                        port_name: port_name_clone.clone(),
                                        display_text,
                                        timestamp_formatted,
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

                                    // Write to text recording file with timestamp and RX label
                                    if let Ok(mut guard) = text_file.lock() {
                                        if let Some(ref mut file) = *guard {
                                            let tz_offset = *timezone_offset.lock().unwrap_or_else(|e| e.into_inner());
                                            let timestamp = format_timestamp_with_offset(tz_offset);
                                            let text = String::from_utf8_lossy(&frame_data);
                                            let _ = writeln!(file, "[{}] RX: {}", timestamp, text);
                                        }
                                    }

                                    // Format display text and timestamp based on current settings
                                    let tz_offset = *timezone_offset.lock().unwrap_or_else(|e| e.into_inner());
                                    let display_text = format_data_for_display(&frame_data, &disp_settings);
                                    let timestamp_formatted = if disp_settings.show_timestamps {
                                        Some(format_timestamp_with_offset(tz_offset))
                                    } else {
                                        None
                                    };

                                    let log_entry = LogEntry {
                                        id: None,
                                        timestamp: Utc::now(),
                                        direction: Direction::Received,
                                        data: frame_data,
                                        format: DataFormat::Text,
                                        port_name: port_name_clone.clone(),
                                        display_text,
                                        timestamp_formatted,
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

                            // Write to text recording file with timestamp and RX label
                            if let Ok(mut guard) = text_file.lock() {
                                if let Some(ref mut file) = *guard {
                                    let tz_offset = *timezone_offset.lock().unwrap_or_else(|e| e.into_inner());
                                    let timestamp = format_timestamp_with_offset(tz_offset);
                                    let text = String::from_utf8_lossy(&accumulated_data);
                                    let _ = writeln!(file, "[{}] RX: {}", timestamp, text);
                                }
                            }

                            // Format display text and timestamp based on current settings
                            let tz_offset = *timezone_offset.lock().unwrap_or_else(|e| e.into_inner());
                            let display_text = format_data_for_display(&accumulated_data, &disp_settings);
                            let timestamp_formatted = if disp_settings.show_timestamps {
                                Some(format_timestamp_with_offset(tz_offset))
                            } else {
                                None
                            };

                            let log_entry = LogEntry {
                                id: None,
                                timestamp: Utc::now(),
                                direction: Direction::Received,
                                data: accumulated_data.clone(),
                                format: DataFormat::Text,
                                port_name: port_name_clone.clone(),
                                display_text,
                                timestamp_formatted,
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

                            // Write to text recording file with timestamp and RX label
                            if let Ok(mut guard) = text_file.lock() {
                                if let Some(ref mut file) = *guard {
                                    let tz_offset = *timezone_offset.lock().unwrap_or_else(|e| e.into_inner());
                                    let timestamp = format_timestamp_with_offset(tz_offset);
                                    let text = String::from_utf8_lossy(&accumulated_data);
                                    let _ = writeln!(file, "[{}] RX: {}", timestamp, text);
                                }
                            }

                            // Format display text and timestamp based on current settings
                            let tz_offset = *timezone_offset.lock().unwrap_or_else(|e| e.into_inner());
                            let display_text = format_data_for_display(&accumulated_data, &disp_settings);
                            let timestamp_formatted = if disp_settings.show_timestamps {
                                Some(format_timestamp_with_offset(tz_offset))
                            } else {
                                None
                            };

                            let log_entry = LogEntry {
                                id: None,
                                timestamp: Utc::now(),
                                direction: Direction::Received,
                                data: accumulated_data.clone(),
                                format: DataFormat::Text,
                                port_name: port_name_clone.clone(),
                                display_text,
                                timestamp_formatted,
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

            // Stop all recordings before disconnecting
            self.stop_all_recordings();

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

            // Write to recording files (TX data)
            self.write_to_text_file(&data, Direction::Sent);
            self.write_to_raw_file(&data);

            // Update sent bytes statistics
            if let Ok(mut stats_guard) = self.stats.lock() {
                stats_guard.bytes_sent += data.len() as u64;
            }

            // Get current display settings for formatting
            let disp_settings = self.get_display_settings();
            let tz_offset = *self.timezone_offset_minutes.lock().unwrap_or_else(|e| e.into_inner());
            let display_text = format_data_for_display(&data, &disp_settings);
            let timestamp_formatted = if disp_settings.show_timestamps {
                Some(format_timestamp_with_offset(tz_offset))
            } else {
                None
            };

            // Add to logs
            self.add_log(LogEntry {
                id: None,
                timestamp: Utc::now(),
                direction: Direction::Sent,
                data,
                format: DataFormat::Text,
                port_name: self.port_name.clone().unwrap_or_default(),
                display_text,
                timestamp_formatted,
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

    pub fn export_logs(&self, file_path: &str, format: ExportFormat, timezone_offset_minutes: i32) -> Result<()> {
        use std::fs::File;
        use std::io::Write;
        use std::path::Path;
        use chrono::FixedOffset;

        // Ensure the parent directory exists
        let path = Path::new(file_path);
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                create_dir_all(parent)?;
            }
        }

        let logs = self.get_logs();
        let mut file = File::create(file_path)?;

        // Create timezone offset for formatting
        let offset_seconds = timezone_offset_minutes * 60;
        let tz_offset = FixedOffset::east_opt(offset_seconds).unwrap_or_else(|| FixedOffset::east_opt(0).unwrap());

        match format {
            ExportFormat::Txt => {
                let now_with_tz = Utc::now().with_timezone(&tz_offset);
                writeln!(file, "RSerial Debug Assistant - Log Export")?;
                writeln!(file, "Generated: {}", now_with_tz.format("%Y-%m-%d %H:%M:%S %z"))?;
                writeln!(file, "{}", "=".repeat(60))?;
                writeln!(file)?;

                for log in logs {
                    let timestamp_with_tz = log.timestamp.with_timezone(&tz_offset);
                    writeln!(
                        file,
                        "[{}] {}: {}",
                        timestamp_with_tz.format("%H:%M:%S%.3f"),
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
                    let timestamp_with_tz = log.timestamp.with_timezone(&tz_offset);
                    writeln!(
                        file,
                        "{},{:?},{},\"{}\"",
                        timestamp_with_tz.format("%Y-%m-%d %H:%M:%S%.3f"),
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

    // Display settings methods

    /// Set the display format (Txt or Hex)
    pub fn set_display_format(&self, format: ReceiveDisplayFormat) {
        if let Ok(mut guard) = self.display_settings.lock() {
            guard.format = format;
        }
    }

    /// Set the text encoding (UTF-8 or GBK)
    pub fn set_text_encoding(&self, encoding: TextEncoding) {
        if let Ok(mut guard) = self.display_settings.lock() {
            guard.encoding = encoding;
        }
    }

    /// Set the special character visualization config
    pub fn set_special_char_config(&self, config: SpecialCharConfig) {
        if let Ok(mut guard) = self.display_settings.lock() {
            guard.special_char_config = config;
        }
    }

    /// Set whether to show timestamps
    pub fn set_show_timestamps(&self, show: bool) {
        if let Ok(mut guard) = self.display_settings.lock() {
            guard.show_timestamps = show;
        }
    }

    /// Get current display settings
    pub fn get_display_settings(&self) -> DisplaySettings {
        self.display_settings
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    // Recording methods

    /// Set the log directory path (called from frontend settings)
    pub fn set_log_directory(&self, path: String) {
        if let Ok(mut guard) = self.log_directory.lock() {
            *guard = path;
        }
    }

    /// Get the current log directory path
    pub fn get_log_directory(&self) -> String {
        self.log_directory
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_else(|_| String::from("./SerialLogs"))
    }

    /// Set the timezone offset in minutes for recording timestamps
    pub fn set_timezone_offset(&self, offset_minutes: i32) {
        if let Ok(mut guard) = self.timezone_offset_minutes.lock() {
            *guard = offset_minutes;
        }
    }

    /// Generate a filename with port name and timestamp
    fn generate_recording_filename(&self, extension: &str) -> Result<PathBuf> {
        let log_dir = self.get_log_directory();
        let dir_path = PathBuf::from(&log_dir);

        // Create directory if it doesn't exist
        if !dir_path.exists() {
            create_dir_all(&dir_path)?;
        }

        let port_name = self.port_name.clone().unwrap_or_else(|| "UNKNOWN".to_string());
        // Sanitize port name for filename (replace special characters)
        let safe_port_name = port_name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");

        let tz_offset = *self.timezone_offset_minutes.lock().unwrap_or_else(|e| e.into_inner());
        let timestamp = format_date_for_filename_with_offset(tz_offset);
        let filename = format!("{}_{}.{}", safe_port_name, timestamp, extension);

        Ok(dir_path.join(filename))
    }

    /// Start text recording - creates a new text file and begins recording
    pub fn start_text_recording(&self) -> Result<String> {
        // Check if already recording
        if let Ok(guard) = self.text_file.lock() {
            if guard.is_some() {
                return Err(anyhow!("Text recording is already active"));
            }
        }

        let file_path = self.generate_recording_filename("txt")?;
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)?;

        let path_str = file_path.to_string_lossy().to_string();

        if let Ok(mut guard) = self.text_file.lock() {
            *guard = Some(file);
        }
        if let Ok(mut guard) = self.text_file_path.lock() {
            *guard = Some(path_str.clone());
        }

        info!("Started text recording to: {}", path_str);
        Ok(path_str)
    }

    /// Stop text recording - closes the file
    pub fn stop_text_recording(&self) -> Result<()> {
        if let Ok(mut guard) = self.text_file.lock() {
            if let Some(mut file) = guard.take() {
                file.flush()?;
            }
        }
        if let Ok(mut guard) = self.text_file_path.lock() {
            if let Some(path) = guard.take() {
                info!("Stopped text recording: {}", path);
            }
        }
        Ok(())
    }

    /// Start raw binary recording - creates a new binary file and begins recording
    pub fn start_raw_recording(&self) -> Result<String> {
        // Check if already recording
        if let Ok(guard) = self.raw_file.lock() {
            if guard.is_some() {
                return Err(anyhow!("Raw recording is already active"));
            }
        }

        let file_path = self.generate_recording_filename("bin")?;
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)?;

        let path_str = file_path.to_string_lossy().to_string();

        if let Ok(mut guard) = self.raw_file.lock() {
            *guard = Some(file);
        }
        if let Ok(mut guard) = self.raw_file_path.lock() {
            *guard = Some(path_str.clone());
        }

        info!("Started raw recording to: {}", path_str);
        Ok(path_str)
    }

    /// Stop raw binary recording - closes the file
    pub fn stop_raw_recording(&self) -> Result<()> {
        if let Ok(mut guard) = self.raw_file.lock() {
            if let Some(mut file) = guard.take() {
                file.flush()?;
            }
        }
        if let Ok(mut guard) = self.raw_file_path.lock() {
            if let Some(path) = guard.take() {
                info!("Stopped raw recording: {}", path);
            }
        }
        Ok(())
    }

    /// Get the current recording status
    pub fn get_recording_status(&self) -> RecordingStatus {
        let text_recording_active = self.text_file
            .lock()
            .map(|guard| guard.is_some())
            .unwrap_or(false);
        let raw_recording_active = self.raw_file
            .lock()
            .map(|guard| guard.is_some())
            .unwrap_or(false);
        let text_file_path = self.text_file_path
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or(None);
        let raw_file_path = self.raw_file_path
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or(None);

        RecordingStatus {
            text_recording_active,
            raw_recording_active,
            text_file_path,
            raw_file_path,
        }
    }

    /// Write data to text recording file with timestamp, direction, and newline
    pub fn write_to_text_file(&self, data: &[u8], direction: Direction) {
        if let Ok(mut guard) = self.text_file.lock() {
            if let Some(ref mut file) = *guard {
                let tz_offset = *self.timezone_offset_minutes.lock().unwrap_or_else(|e| e.into_inner());
                let timestamp = format_timestamp_with_offset(tz_offset);
                let dir_label = match direction {
                    Direction::Sent => "TX",
                    Direction::Received => "RX",
                };
                let text = String::from_utf8_lossy(data);
                // Write formatted line with timestamp, direction, content, and newline
                if let Err(e) = writeln!(file, "[{}] {}: {}", timestamp, dir_label, text) {
                    warn!("Error writing to text recording file: {}", e);
                }
            }
        }
    }

    /// Write data to raw binary recording file
    pub fn write_to_raw_file(&self, data: &[u8]) {
        if let Ok(mut guard) = self.raw_file.lock() {
            if let Some(ref mut file) = *guard {
                if let Err(e) = file.write_all(data) {
                    warn!("Error writing to raw recording file: {}", e);
                }
            }
        }
    }

    /// Stop all recordings (called on disconnect)
    pub fn stop_all_recordings(&self) {
        let _ = self.stop_text_recording();
        let _ = self.stop_raw_recording();
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

/// Format current UTC time with timezone offset applied
fn format_timestamp_with_offset(offset_minutes: i32) -> String {
    use chrono::FixedOffset;
    let offset_seconds = offset_minutes * 60;
    let tz_offset = FixedOffset::east_opt(offset_seconds).unwrap_or_else(|| FixedOffset::east_opt(0).unwrap());
    let now_with_tz = Utc::now().with_timezone(&tz_offset);
    now_with_tz.format("%H:%M:%S%.3f").to_string()
}

/// Format a date for filenames with timezone offset applied
fn format_date_for_filename_with_offset(offset_minutes: i32) -> String {
    use chrono::FixedOffset;
    let offset_seconds = offset_minutes * 60;
    let tz_offset = FixedOffset::east_opt(offset_seconds).unwrap_or_else(|| FixedOffset::east_opt(0).unwrap());
    let now_with_tz = Utc::now().with_timezone(&tz_offset);
    now_with_tz.format("%Y-%m-%d_%H-%M-%S").to_string()
}

/// Format bytes as hexadecimal string (e.g., "48 65 6C 6C 6F")
fn format_bytes_as_hex(data: &[u8]) -> String {
    data.iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(" ")
}

/// Format bytes as text with special character visualization
fn format_bytes_as_text(data: &[u8], encoding: &TextEncoding, special_chars: &SpecialCharConfig) -> String {
    // First decode the bytes using the specified encoding
    let text = match encoding {
        TextEncoding::Utf8 => {
            // Try strict UTF-8 decoding first, fallback to lossy if it fails
            match std::str::from_utf8(data) {
                Ok(s) => s.to_string(),
                Err(_) => {
                    // If UTF-8 decoding fails, fall back to hex display
                    return format_bytes_as_hex(data);
                }
            }
        }
        TextEncoding::Gbk => {
            let (decoded, _, had_errors) = encoding_rs::GBK.decode(data);
            if had_errors {
                // If GBK decoding has errors, fall back to hex display
                return format_bytes_as_hex(data);
            }
            decoded.into_owned()
        }
    };

    // Apply special character visualization if enabled
    if !special_chars.enabled {
        return text;
    }

    let mut result = text;

    if special_chars.convert_lf {
        result = result.replace('\n', "␊");
    }
    if special_chars.convert_cr {
        result = result.replace('\r', "␍");
    }
    if special_chars.convert_tab {
        result = result.replace('\t', "␉");
    }
    if special_chars.convert_null {
        result = result.replace('\0', "␀");
    }
    if special_chars.convert_esc {
        result = result.replace('\x1B', "␛");
    }
    if special_chars.convert_spaces {
        // Only show spaces at end of lines or multiple consecutive spaces
        // Trailing spaces
        let mut new_result = String::new();
        for line in result.split('\n') {
            if !new_result.is_empty() {
                new_result.push('\n');
            }
            // Handle trailing spaces
            let trimmed_end = line.trim_end_matches(' ');
            let trailing_spaces = line.len() - trimmed_end.len();
            new_result.push_str(trimmed_end);
            new_result.push_str(&"␣".repeat(trailing_spaces));
        }
        // Handle multiple consecutive spaces in the middle
        let mut final_result = String::new();
        let mut space_count = 0;
        for ch in new_result.chars() {
            if ch == ' ' {
                space_count += 1;
            } else {
                if space_count >= 2 {
                    final_result.push_str(&"␣".repeat(space_count));
                } else if space_count == 1 {
                    final_result.push(' ');
                }
                space_count = 0;
                final_result.push(ch);
            }
        }
        // Handle trailing spaces that weren't converted
        if space_count >= 2 {
            final_result.push_str(&"␣".repeat(space_count));
        } else if space_count == 1 {
            final_result.push(' ');
        }
        result = final_result;
    }

    result
}

/// Format data based on display settings
fn format_data_for_display(data: &[u8], settings: &DisplaySettings) -> String {
    match settings.format {
        ReceiveDisplayFormat::Hex => format_bytes_as_hex(data),
        ReceiveDisplayFormat::Txt => format_bytes_as_text(data, &settings.encoding, &settings.special_char_config),
    }
}