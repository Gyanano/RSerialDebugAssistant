export interface SerialPortInfo {
  port_name: string;
  port_type: string;
  description?: string;
  manufacturer?: string;
  product?: string;
  serial_number?: string;
  vid?: number;
  pid?: number;
}

export interface SerialConfig {
  baud_rate: number;
  data_bits: DataBits;
  parity: Parity;
  stop_bits: StopBits;
  flow_control: FlowControl;
  timeout: number;
}

export type DataBits = 'Five' | 'Six' | 'Seven' | 'Eight';
export type Parity = 'None' | 'Odd' | 'Even' | 'Mark' | 'Space';
export type StopBits = 'One' | 'OnePointFive' | 'Two';
export type FlowControl = 'None' | 'Software' | 'Hardware';
export type DataFormat = 'Text' | 'Hex';
export type Direction = 'Sent' | 'Received';
export type TextEncoding = 'utf-8' | 'gbk';

// Checksum types
export type ChecksumType = 'None' | 'XOR' | 'ADD8' | 'CRC8' | 'CRC16' | 'CCITT-CRC16';

export interface ChecksumConfig {
  type: ChecksumType;
  startIndex: number;  // 0-indexed, starting position (0 = first byte)
  endIndex: number;    // 0-indexed, supports negative (-1 = last byte, -2 = second to last)
}

export interface LogEntry {
  id?: number;
  timestamp: string;
  direction: Direction;
  data: number[];
  format: DataFormat;
  port_name: string;
}

export interface ConnectionStatus {
  is_connected: boolean;
  port_name: string | null;
  config: SerialConfig | null;
  bytes_sent: number;
  bytes_received: number;
  connection_time: string | null;
}

// Quick Command types
export type LineEnding = 'None' | '\\r' | '\\n' | '\\r\\n';

export interface QuickCommand {
  id: string;
  name: string;           // Optional name for identification
  selected: boolean;      // For batch sending selection
  isHex: boolean;         // Send as hex format
  content: string;        // Command content
  lineEnding: LineEnding; // Line ending option
}

export interface QuickCommandList {
  id: string;
  name: string;
  commands: QuickCommand[];
}

// Special character conversion settings
export interface SpecialCharConfig {
  enabled: boolean;
  convertLF: boolean;     // \n -> ␊
  convertCR: boolean;     // \r -> ␍
  convertTab: boolean;    // \t -> ␉
  convertNull: boolean;   // \0 -> ␀
  convertEsc: boolean;    // ESC -> ␛
  convertSpaces: boolean; // trailing/multiple spaces -> ␣
}

// Frame segmentation types
export type FrameSegmentationMode = 'Timeout' | 'Delimiter' | 'Combined';

export type FrameDelimiter =
  | 'AnyNewline'
  | 'CR'
  | 'LF'
  | 'CRLF'
  | { Custom: number[] };

export interface FrameSegmentationConfig {
  mode: FrameSegmentationMode;
  timeout_ms: number;
  delimiter: FrameDelimiter;
}

// Recording status
export interface RecordingStatus {
  text_recording_active: boolean;
  raw_recording_active: boolean;
  text_file_path: string | null;
  raw_file_path: string | null;
}
// Timezone configuration
export type TimezoneOption = 'System' | string; // 'System' or UTC offset like 'UTC+8', 'UTC-5', etc.
