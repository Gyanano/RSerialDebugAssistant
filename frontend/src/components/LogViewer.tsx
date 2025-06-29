import React, { useEffect, useRef, useState } from 'react';
import { Trash2, Download, Terminal } from 'lucide-react';
import { LogEntry } from '../types';

interface LogViewerProps {
  logs: LogEntry[];
  onClear: () => void;
  onExport: () => void;
  isConnected: boolean;
}

const LogViewer: React.FC<LogViewerProps> = ({ logs, onClear, onExport, isConnected }) => {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const previousLogsLengthRef = useRef(logs.length);

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

  const formatData = (data: number[]) => {
    // Convert number array to string, handling both text and binary data
    try {
      const bytes = new Uint8Array(data);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      
      // Check if the data contains mostly printable characters (including UTF-8)
      const printableChars = text.split('').filter(char => {
        const code = char.charCodeAt(0);
        // Include more character ranges: ASCII printable, Latin-1 supplement, and most Unicode characters
        return (code >= 32 && code <= 126) || // ASCII printable
               (code >= 160 && code <= 255) || // Latin-1 supplement  
               (code >= 256 && code < 0xFFFE) || // Most Unicode characters
               code === 9 || code === 10 || code === 13; // Tab, LF, CR
      }).length;
      
      // Check for replacement characters (indicating invalid UTF-8)
      const hasReplacementChars = text.includes('\uFFFD');
      
      if (!hasReplacementChars && printableChars / text.length > 0.7) {
        // Valid UTF-8 text, show as text with visible control characters
        return text
          .replace(/\r\n/g, '␍␊')    // CRLF
          .replace(/\n/g, '␊')       // LF (Line Feed)
          .replace(/\r/g, '␍')       // CR (Carriage Return)
          .replace(/\t/g, '␉')       // TAB
          .replace(/\0/g, '␀')       // NULL
          .replace(/\x1B/g, '␛')     // ESC
          // Only show spaces at end of lines or multiple consecutive spaces
          .replace(/\x20+$/gm, (spaces) => '␣'.repeat(spaces.length))  // Trailing spaces
          .replace(/\x20{2,}/g, (spaces) => '␣'.repeat(spaces.length)) // Multiple spaces
          .replace(/[\x01-\x1F\x7F]/g, (char) => {
            // Other control characters as Unicode symbols
            const code = char.charCodeAt(0);
            return String.fromCharCode(0x2400 + code); // Control Pictures block
          });
      } else {
        // Contains non-printable or invalid UTF-8, show as hex
        return Array.from(bytes)
          .map(b => b.toString(16).padStart(2, '0').toUpperCase())
          .join(' ');
      }
    } catch {
      // Fallback to hex if decoding fails
      return data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    }
  };

  const getLogEntryClass = (direction: string) => {
    return `log-entry ${direction.toLowerCase()}`;
  };

  const getDirectionClass = (direction: string) => {
    return `log-direction ${direction.toLowerCase()}`;
  };

  const sentCount = logs.filter(log => log.direction === 'Sent').length;
  const receivedCount = logs.filter(log => log.direction === 'Received').length;
  const totalBytes = logs.reduce((acc, log) => acc + log.data.length, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Terminal size={18} className="text-gray-400" />
            <h2 className="text-lg font-semibold text-white">Communication Log</h2>
            <span className="text-sm text-gray-400">
              ({logs.length} entries)
            </span>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Auto Scroll Toggle */}
            <label className="flex items-center space-x-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={autoScrollEnabled}
                onChange={(e) => setAutoScrollEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
              />
              <span>Auto Scroll</span>
            </label>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={onExport}
                className="btn-secondary text-sm px-3 py-1 flex items-center"
                disabled={logs.length === 0}
                title="Export logs"
              >
                <Download size={14} className="mr-1" />
                Export
              </button>
              <button
                onClick={onClear}
                className="btn-secondary text-sm px-3 py-1 flex items-center"
                disabled={logs.length === 0}
                title="Clear logs"
              >
                <Trash2 size={14} className="mr-1" />
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Log Content */}
      <div 
        ref={logContainerRef}
        className="flex-1 overflow-y-auto bg-gray-900 scrollbar-thin"
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
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
          <div className="p-2">
            {logs.map((log, index) => (
              <div key={index} className={getLogEntryClass(log.direction)}>
                <div className="flex items-start space-x-2">
                  <span className="log-timestamp">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span className={getDirectionClass(log.direction)}>
                    {log.direction === 'Sent' ? 'TX' : 'RX'}
                  </span>
                  <span className="flex-1 break-all font-mono text-sm whitespace-pre-wrap">
                    {formatData(log.data)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with statistics */}
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between text-sm text-gray-400">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <span>TX:</span>
              <span className="text-blue-400 font-mono">{sentCount}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span>RX:</span>
              <span className="text-green-400 font-mono">{receivedCount}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span>Total Bytes:</span>
            <span className="font-mono">{totalBytes.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogViewer;