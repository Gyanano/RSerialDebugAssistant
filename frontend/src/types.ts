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