import React, { useEffect, useRef, useState } from 'react';
import { Trash2, Download, Terminal, ChevronDown } from 'lucide-react';
import { LogEntry, TextEncoding, SpecialCharConfig } from '../types';
import ToggleSwitch from './ToggleSwitch';
import { useTheme } from '../contexts/ThemeContext';

type ReceiveDisplayFormat = 'Txt' | 'Hex';

const STORAGE_KEY_RECEIVE_FORMAT = 'serialDebug_receiveFormat';
const STORAGE_KEY_SHOW_TIMESTAMPS = 'serialDebug_showTimestamps';
const STORAGE_KEY_TEXT_ENCODING = 'serialDebug_textEncoding';
const STORAGE_KEY_SPECIAL_CHAR_CONFIG = 'serialDebug_specialCharConfig';

const DEFAULT_SPECIAL_CHAR_CONFIG: SpecialCharConfig = {
  enabled: true,
  convertLF: true,
  convertCR: true,
  convertTab: true,
  convertNull: true,
  convertEsc: true,
  convertSpaces: true,
};

interface LogViewerProps {
  logs: LogEntry[];
  onClear: () => void;
  onExport: () => void;
  isConnected: boolean;
}

const LogViewer: React.FC<LogViewerProps> = ({ logs, onClear, onExport, isConnected }) => {
  const { colors } = useTheme();
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const previousLogsLengthRef = useRef(logs.length);

  // State for receive format and timestamp display
  const [receiveFormat, setReceiveFormat] = useState<ReceiveDisplayFormat>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_RECEIVE_FORMAT);
    return (saved === 'Hex' || saved === 'Txt') ? saved : 'Txt';
  });
  const [showTimestamps, setShowTimestamps] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SHOW_TIMESTAMPS);
    return saved === null ? true : saved === 'true';
  });
  const [textEncoding, setTextEncoding] = useState<TextEncoding>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_TEXT_ENCODING);
    return (saved === 'utf-8' || saved === 'gbk') ? saved : 'utf-8';
  });
  const [specialCharConfig, setSpecialCharConfig] = useState<SpecialCharConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SPECIAL_CHAR_CONFIG);
    if (saved) {
      try {
        return { ...DEFAULT_SPECIAL_CHAR_CONFIG, ...JSON.parse(saved) };
      } catch {
        return DEFAULT_SPECIAL_CHAR_CONFIG;
      }
    }
    return DEFAULT_SPECIAL_CHAR_CONFIG;
  });
  const [formatDropdownOpen, setFormatDropdownOpen] = useState(false);
  const formatDropdownRef = useRef<HTMLDivElement>(null);

  // Persist receive format to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_RECEIVE_FORMAT, receiveFormat);
  }, [receiveFormat]);

  // Persist timestamp setting to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SHOW_TIMESTAMPS, String(showTimestamps));
  }, [showTimestamps]);

  // Listen for settings changes from Settings modal
  useEffect(() => {
    const handleStorageChange = () => {
      // Text encoding
      const savedEncoding = localStorage.getItem(STORAGE_KEY_TEXT_ENCODING);
      if (savedEncoding === 'utf-8' || savedEncoding === 'gbk') {
        setTextEncoding(savedEncoding);
      }
      // Special char config
      const savedSpecialCharConfig = localStorage.getItem(STORAGE_KEY_SPECIAL_CHAR_CONFIG);
      if (savedSpecialCharConfig) {
        try {
          setSpecialCharConfig({ ...DEFAULT_SPECIAL_CHAR_CONFIG, ...JSON.parse(savedSpecialCharConfig) });
        } catch {
          // Ignore parse errors
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    // Also check periodically for same-window changes
    const interval = setInterval(handleStorageChange, 500);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (formatDropdownRef.current && !formatDropdownRef.current.contains(event.target as Node)) {
        setFormatDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Smart auto-scroll: only scroll to bottom when there are NEW logs (not when toggling the switch)
  useEffect(() => {
    const currentLogsLength = logs.length;
    const hasNewLogs = currentLogsLength > previousLogsLengthRef.current;

    if (autoScrollEnabled && hasNewLogs && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }

    // Update the previous logs length for next comparison
    previousLogsLengthRef.current = currentLogsLength;
  }, [logs, autoScrollEnabled]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const timeStr = date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    // Manually add milliseconds
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${timeStr}.${ms}`;
  };

  const formatDataAsHex = (data: number[]) => {
    return data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  };

  const formatDataAsText = (data: number[]) => {
    try {
      const bytes = new Uint8Array(data);
      // Use fatal: true to strictly enforce encoding - throws on invalid sequences
      const decoder = new TextDecoder(textEncoding, { fatal: true });
      let text = decoder.decode(bytes);

      // Apply control character visualization based on settings
      if (specialCharConfig.enabled) {
        if (specialCharConfig.convertLF) {
          text = text.replace(/\n/g, '␊');
        }
        if (specialCharConfig.convertCR) {
          text = text.replace(/\r/g, '␍');
        }
        if (specialCharConfig.convertTab) {
          text = text.replace(/\t/g, '␉');
        }
        if (specialCharConfig.convertNull) {
          text = text.replace(/\0/g, '␀');
        }
        if (specialCharConfig.convertEsc) {
          text = text.replace(/\x1B/g, '␛');
        }
        if (specialCharConfig.convertSpaces) {
          // Only show spaces at end of lines or multiple consecutive spaces
          text = text.replace(/\x20+$/gm, (spaces) => '␣'.repeat(spaces.length));  // Trailing spaces
          text = text.replace(/\x20{2,}/g, (spaces) => '␣'.repeat(spaces.length)); // Multiple spaces
        }
      }

      return text;
    } catch {
      // Decoding failed with the selected encoding - show as hex
      return formatDataAsHex(data);
    }
  };

  const formatData = (data: number[]) => {
    if (receiveFormat === 'Hex') {
      return formatDataAsHex(data);
    }
    // 'Txt' uses auto-detection logic
    return formatDataAsText(data);
  };

  const sentCount = logs.filter(log => log.direction === 'Sent').length;
  const receivedCount = logs.filter(log => log.direction === 'Received').length;
  const totalBytes = logs.reduce((acc, log) => acc + log.data.length, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="h-12 px-4 flex items-center justify-between shadow-sm z-10"
        style={{
          backgroundColor: colors.bgHeader,
          borderBottom: `1px solid ${colors.borderDark}`
        }}
      >
        <div className="flex items-center space-x-2" style={{ color: colors.textSecondary }}>
          <Terminal size={16} style={{ color: colors.textTertiary }} />
          <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>Console Output</span>
          <span className="text-xs" style={{ color: colors.textTertiary }}>
            ({logs.length})
          </span>
        </div>

        <div className="flex items-center space-x-3">
          {/* Receive Format Dropdown */}
          <div className="relative" ref={formatDropdownRef}>
            <button
              onClick={() => setFormatDropdownOpen(!formatDropdownOpen)}
              className="flex items-center space-x-1 px-2 py-1 text-xs rounded transition-colors"
              style={{
                backgroundColor: colors.bgInput,
                border: `1px solid ${colors.borderLight}`,
                color: colors.textSecondary
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = colors.accent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = colors.borderLight;
              }}
              title="Receive data display format"
            >
              <span>Format:</span>
              <span style={{ color: colors.textPrimary }}>{receiveFormat}</span>
              <ChevronDown size={12} />
            </button>
            {formatDropdownOpen && (
              <div
                className="absolute top-full right-0 mt-1 py-1 rounded-md shadow-lg z-50"
                style={{
                  backgroundColor: colors.bgSidebar,
                  border: `1px solid ${colors.borderLight}`,
                  minWidth: '80px'
                }}
              >
                {(['Txt', 'Hex'] as ReceiveDisplayFormat[]).map((format) => (
                  <button
                    key={format}
                    onClick={() => {
                      setReceiveFormat(format);
                      setFormatDropdownOpen(false);
                    }}
                    className="w-full px-3 py-1.5 text-xs text-left transition-colors"
                    style={{
                      backgroundColor: receiveFormat === format ? colors.bgHover : 'transparent',
                      color: receiveFormat === format ? colors.textPrimary : colors.textSecondary
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = colors.bgHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = receiveFormat === format ? colors.bgHover : 'transparent';
                    }}
                  >
                    {format}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Timestamp Toggle */}
          <div className="flex items-center space-x-2">
            <span className="text-xs" style={{ color: colors.textTertiary }}>Timestamps</span>
            <ToggleSwitch
              checked={showTimestamps}
              onChange={setShowTimestamps}
              title="Toggle timestamp display"
            />
          </div>

          {/* Auto Scroll Toggle */}
          <div className="flex items-center space-x-2 mr-2">
            <span className="text-xs" style={{ color: colors.textTertiary }}>Auto Scroll</span>
            <ToggleSwitch
              checked={autoScrollEnabled}
              onChange={setAutoScrollEnabled}
              title="Toggle auto-scroll to bottom"
            />
          </div>

          <div
            className="flex rounded-md p-0.5"
            style={{ backgroundColor: colors.bgInput, border: `1px solid ${colors.borderLight}` }}
          >
            <button
              onClick={onExport}
              className="px-2 py-0.5 text-xs rounded flex items-center space-x-1 transition-colors"
              style={{ color: colors.textSecondary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.bgHover;
                e.currentTarget.style.color = colors.textPrimary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = colors.textSecondary;
              }}
              disabled={logs.length === 0}
              title="Export logs"
            >
              <Download size={12} />
              <span>Export</span>
            </button>
            <div className="w-px my-0.5 mx-0.5" style={{ backgroundColor: colors.border }}></div>
            <button
              onClick={onClear}
              className="px-2 py-0.5 text-xs rounded flex items-center space-x-1 transition-colors"
              style={{ color: colors.textSecondary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.bgHover;
                e.currentTarget.style.color = colors.danger;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = colors.textSecondary;
              }}
              disabled={logs.length === 0}
              title="Clear logs"
            >
              <Trash2 size={12} />
              <span>Clear</span>
            </button>
          </div>
        </div>
      </div>

      {/* Log Content */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto scrollbar-thin p-1"
        style={{ backgroundColor: colors.bgMain }}
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ color: colors.textTertiary }}>
            <div className="text-center">
              <Terminal size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg">No communication data</p>
              <p className="text-sm mt-2">
                {isConnected
                  ? "Data will appear here when you send or receive messages"
                  : "Connect to a serial port to start logging communication"
                }
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {logs.map((log, index) => (
              <div
                key={index}
                className="py-1 px-2 rounded-[4px] transition-colors duration-150"
                style={{
                  borderLeft: `2px solid ${log.direction === 'Sent' ? colors.accent : colors.success}`,
                  backgroundColor: log.direction === 'Sent' ? colors.logSentBg : colors.logReceivedBg
                }}
              >
                <div className="flex items-start space-x-2">
                  {showTimestamps && (
                    <span className="text-xs select-none" style={{ color: colors.textTertiary, opacity: 0.6 }}>
                      {formatTimestamp(log.timestamp)}
                    </span>
                  )}
                  <span
                    className="font-bold text-xs uppercase select-none"
                    style={{ color: log.direction === 'Sent' ? colors.accent : colors.success }}
                  >
                    {log.direction === 'Sent' ? 'TX' : 'RX'}
                  </span>
                  <span
                    className="flex-1 break-all font-mono text-sm whitespace-pre-wrap"
                    style={{ color: colors.textPrimary }}
                  >
                    {formatData(log.data)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with statistics */}
      <div
        className="px-3 py-1 text-xs flex justify-between items-center select-none"
        style={{
          backgroundColor: colors.bgHeader,
          borderTop: `1px solid ${colors.borderDark}`,
          color: colors.textTertiary
        }}
      >
        <div className="flex space-x-4">
          <span className="flex items-center">
            <div className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: colors.accent }}></div>
            TX: {sentCount}
          </span>
          <span className="flex items-center">
            <div className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: colors.success }}></div>
            RX: {receivedCount}
          </span>
        </div>
        <span>Total: {totalBytes.toLocaleString()} Bytes</span>
      </div>
    </div>
  );
};

export default LogViewer;
