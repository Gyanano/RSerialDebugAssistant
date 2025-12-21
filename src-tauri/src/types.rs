use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialPortInfo {
    pub port_name: String,
    pub port_type: String,
    pub description: Option<String>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialConfig {
    pub baud_rate: u32,
    pub data_bits: DataBits,
    pub parity: Parity,
    pub stop_bits: StopBits,
    pub flow_control: FlowControl,
    pub timeout: u64,
}

impl Default for SerialConfig {
    fn default() -> Self {
        Self {
            baud_rate: 115200,
            data_bits: DataBits::Eight,
            parity: Parity::None,
            stop_bits: StopBits::One,
            flow_control: FlowControl::None,
            timeout: 1000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DataBits {
    Five,
    Six,
    Seven,
    Eight,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Parity {
    None,
    Odd,
    Even,
    Mark,
    Space,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StopBits {
    One,
    OnePointFive,
    Two,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FlowControl {
    None,
    Software,
    Hardware,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DataFormat {
    Text,
    Hex,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub enum TextEncoding {
    #[default]
    #[serde(rename = "utf-8")]
    Utf8,
    #[serde(rename = "gbk")]
    Gbk,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub id: Option<i64>,
    pub timestamp: DateTime<Utc>,
    pub direction: Direction,
    pub data: Vec<u8>,
    pub format: DataFormat,
    pub port_name: String,
    /// Pre-formatted display text (formatted at receive time based on current settings)
    pub display_text: String,
    /// Pre-formatted timestamp string (None if timestamps were disabled when entry was created)
    pub timestamp_formatted: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Direction {
    Sent,
    Received,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub is_connected: bool,
    pub port_name: Option<String>,
    pub config: Option<SerialConfig>,
    pub bytes_sent: u64,
    pub bytes_received: u64,
    pub connection_time: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExportFormat {
    Txt,
    Csv,
    Json,
}

// Frame Segmentation types
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub enum FrameSegmentationMode {
    #[default]
    Timeout,
    /// Combined mode: flushes on either delimiter OR timeout (whichever comes first)
    /// This ensures data is always displayed even if no delimiter is present
    Combined,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub enum FrameDelimiter {
    #[default]
    AnyNewline, // Treats \r, \n, and \r\n all as a single line ending
    CR,
    LF,
    CRLF,
    Custom(Vec<u8>),
}

impl FrameDelimiter {
    pub fn to_bytes(&self) -> Vec<u8> {
        match self {
            FrameDelimiter::AnyNewline => vec![], // Special case, handled separately
            FrameDelimiter::CR => vec![0x0D],
            FrameDelimiter::LF => vec![0x0A],
            FrameDelimiter::CRLF => vec![0x0D, 0x0A],
            FrameDelimiter::Custom(bytes) => bytes.clone(),
        }
    }

    pub fn is_any_newline(&self) -> bool {
        matches!(self, FrameDelimiter::AnyNewline)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameSegmentationConfig {
    pub mode: FrameSegmentationMode,
    pub timeout_ms: u64,
    pub delimiter: FrameDelimiter,
}

impl Default for FrameSegmentationConfig {
    fn default() -> Self {
        Self {
            mode: FrameSegmentationMode::Timeout,
            timeout_ms: 10,
            delimiter: FrameDelimiter::AnyNewline,
        }
    }
}

// Recording status types
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RecordingStatus {
    pub text_recording_active: bool,
    pub raw_recording_active: bool,
    pub text_file_path: Option<String>,
    pub raw_file_path: Option<String>,
}

// Display settings types for pre-formatted log rendering
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub enum ReceiveDisplayFormat {
    #[default]
    Txt,
    Hex,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecialCharConfig {
    pub enabled: bool,
    pub convert_lf: bool,
    pub convert_cr: bool,
    pub convert_tab: bool,
    pub convert_null: bool,
    pub convert_esc: bool,
    pub convert_spaces: bool,
}

impl Default for SpecialCharConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            convert_lf: true,
            convert_cr: true,
            convert_tab: true,
            convert_null: true,
            convert_esc: true,
            convert_spaces: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplaySettings {
    pub format: ReceiveDisplayFormat,
    pub encoding: TextEncoding,
    pub special_char_config: SpecialCharConfig,
    pub show_timestamps: bool,
}

impl Default for DisplaySettings {
    fn default() -> Self {
        Self {
            format: ReceiveDisplayFormat::Txt,
            encoding: TextEncoding::Utf8,
            special_char_config: SpecialCharConfig::default(),
            show_timestamps: true,
        }
    }
}