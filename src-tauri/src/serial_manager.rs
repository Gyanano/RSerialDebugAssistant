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

                match read_port.read(&mut buffer) {
                    Ok(bytes_read) if bytes_read > 0 => {
                        accumulated_data.extend_from_slice(&buffer[..bytes_read]);
                        last_data_time = Instant::now();
                    }
                    Ok(_) => {
                        // Check if we should flush accumulated data (no new data for 10ms)
                        if !accumulated_data.is_empty() && last_data_time.elapsed() > Duration::from_millis(10) {
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
                                if logs_guard.len() > 1000 {
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
                        if !accumulated_data.is_empty() && last_data_time.elapsed() > Duration::from_millis(10) {
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
                                if logs_guard.len() > 1000 {
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
                writeln!(file, "Serial Debug Assistant - Log Export")?;
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
            if logs.len() > 1000 {
                logs.pop_front();
            }
        }
    }
}