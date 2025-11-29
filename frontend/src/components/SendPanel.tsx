import React, { useRef, useEffect, useState } from 'react';
import { Send, Type, Hash, Clock, Play, Pause, Shield, ChevronDown, ChevronUp, List, FileText } from 'lucide-react';
import { DataFormat, ChecksumType, ChecksumConfig, QuickCommandList, QuickCommand, LineEnding } from '../types';
import ToggleSwitch from './ToggleSwitch';
import QuickCommandPanel from './QuickCommandPanel';
import { useTheme } from '../contexts/ThemeContext';
import { getChecksumLength } from '../utils/checksum';

type SendMode = 'normal' | 'quickCommand';

interface SendPanelProps {
  value: string;
  onChange: (value: string) => void;
  format: DataFormat;
  onFormatChange: (format: DataFormat) => void;
  onSend: () => void;
  isConnected: boolean;  // Renamed from 'disabled' to be clearer
  checksumConfig: ChecksumConfig;
  onChecksumConfigChange: (config: ChecksumConfig) => void;
  // Quick Command props
  quickCommandLists: QuickCommandList[];
  currentQuickCommandListId: string;
  onQuickCommandListsChange: (lists: QuickCommandList[]) => void;
  onCurrentQuickCommandListChange: (listId: string) => void;
  onSendQuickCommand: (content: string, isHex: boolean, lineEnding: LineEnding) => void;
  onSendSelectedQuickCommands: (commands: QuickCommand[]) => void;
}

const SendPanel: React.FC<SendPanelProps> = ({
  value,
  onChange,
  format,
  onFormatChange,
  onSend,
  isConnected,
  checksumConfig,
  onChecksumConfigChange,
  quickCommandLists,
  currentQuickCommandListId,
  onQuickCommandListsChange,
  onCurrentQuickCommandListChange,
  onSendQuickCommand,
  onSendSelectedQuickCommands,
}) => {
  const { colors } = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sendMode, setSendMode] = useState<SendMode>('normal');
  const [isScheduledEnabled, setIsScheduledEnabled] = useState(false);
  const [scheduledInterval, setScheduledInterval] = useState(1000);
  const [isScheduledRunning, setIsScheduledRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isChecksumExpanded, setIsChecksumExpanded] = useState(false);

  // Calculate disabled state for normal mode (depends on both connection AND content)
  const isNormalSendDisabled = !isConnected || !value.trim() || isScheduledEnabled;
  // Calculate disabled state for quick mode (depends ONLY on connection)
  const isQuickModeDisabled = !isConnected;

  const checksumTypes: ChecksumType[] = ['None', 'XOR', 'ADD8', 'CRC8', 'CRC16', 'CCITT-CRC16'];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (isConnected && value.trim()) {
        onSend();
      }
    }
  };

  const handleSendClick = () => {
    if (isConnected && value.trim()) {
      onSend();
    }
  };

  const handleScheduledToggle = () => {
    const newEnabledState = !isScheduledEnabled;
    setIsScheduledEnabled(newEnabledState);

    if (newEnabledState && value.trim() && isConnected) {
      startScheduledSending();
    } else if (!newEnabledState) {
      stopScheduledSending();
    }
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newInterval = Math.max(100, parseInt(e.target.value) || 1000);
    setScheduledInterval(newInterval);

    // Restart interval with new timing if already running
    if (isScheduledRunning) {
      stopScheduledSending();
      setTimeout(() => startScheduledSending(), 0);
    }
  };

  const startScheduledSending = () => {
    if (!value.trim() || !isConnected) return;

    setIsScheduledRunning(true);
    intervalRef.current = setInterval(() => {
      onSend();
    }, scheduledInterval);
  };

  const stopScheduledSending = () => {
    setIsScheduledRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Cleanup when disconnected or value becomes empty
  useEffect(() => {
    if (!isConnected || !value.trim()) {
      stopScheduledSending();
    }
  }, [isConnected, value]);

  const getPlaceholderText = () => {
    if (format === 'Text') {
      return 'Type your message here... (Ctrl+Enter to send)';
    } else {
      return 'Enter hex data (e.g., 48 65 6C 6C 6F or 48656C6C6F)...';
    }
  };

  const getByteCount = () => {
    if (format === 'Text') {
      return new TextEncoder().encode(value).length;
    } else {
      const cleanHex = value.replace(/\s/g, '');
      return Math.floor(cleanHex.length / 2);
    }
  };

  const getTotalByteCount = () => {
    const dataBytes = getByteCount();
    const checksumBytes = getChecksumLength(checksumConfig.type);
    return dataBytes + checksumBytes;
  };

  const insertCommonHex = (hexValue: string) => {
    const newValue = value ? `${value} ${hexValue}` : hexValue;
    onChange(newValue);
    // Focus back to textarea
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const commonHexValues = [
    { label: 'CR', value: '0D', description: 'Carriage Return' },
    { label: 'LF', value: '0A', description: 'Line Feed' },
    { label: 'CRLF', value: '0D 0A', description: 'CR + LF' },
    { label: 'NULL', value: '00', description: 'Null byte' },
    { label: 'ESC', value: '1B', description: 'Escape' },
    { label: 'SPACE', value: '20', description: 'Space character' },
  ];

  return (
    <div style={{ backgroundColor: colors.bgSidebar }}>
      {/* Send Header with Mode Toggle */}
      <div
        className="px-4 py-2 flex justify-between items-center"
        style={{ borderBottom: `1px solid ${colors.borderLight}` }}
      >
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2" style={{ color: colors.textSecondary }}>
            <Send size={14} style={{ color: colors.textTertiary }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textPrimary }}>
              {sendMode === 'normal' ? 'Payload' : 'Quick Commands'}
            </span>
          </div>

          {/* Mode Toggle */}
          <div
            className="p-0.5 rounded-[6px] flex text-xs font-medium"
            style={{ backgroundColor: colors.bgInput, border: `1px solid ${colors.borderLight}` }}
          >
            <button
              onClick={() => setSendMode('normal')}
              className="px-2 py-0.5 rounded-[4px] transition-all flex items-center space-x-1"
              style={{
                backgroundColor: sendMode === 'normal' ? colors.accent : 'transparent',
                color: sendMode === 'normal' ? '#ffffff' : colors.textSecondary,
                boxShadow: sendMode === 'normal' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'
              }}
            >
              <FileText size={12} />
              <span>Normal</span>
            </button>
            <button
              onClick={() => setSendMode('quickCommand')}
              className="px-2 py-0.5 rounded-[4px] transition-all flex items-center space-x-1"
              style={{
                backgroundColor: sendMode === 'quickCommand' ? colors.accent : 'transparent',
                color: sendMode === 'quickCommand' ? '#ffffff' : colors.textSecondary,
                boxShadow: sendMode === 'quickCommand' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'
              }}
            >
              <List size={12} />
              <span>Quick</span>
            </button>
          </div>
        </div>

        {/* Right side controls - only show in normal mode */}
        {sendMode === 'normal' && (
          <div className="flex items-center space-x-3">
            {/* Checksum Type Selector */}
            <div className="flex items-center space-x-2">
              <Shield size={12} style={{ color: colors.textTertiary }} />
              <select
                value={checksumConfig.type}
                onChange={(e) => onChecksumConfigChange({ ...checksumConfig, type: e.target.value as ChecksumType })}
                className="text-xs py-0.5 px-2 rounded-[4px] focus:outline-none"
                style={{
                  backgroundColor: checksumConfig.type !== 'None' ? colors.accent : colors.bgInput,
                  border: `1px solid ${colors.borderLight}`,
                  color: checksumConfig.type !== 'None' ? '#ffffff' : colors.textSecondary
                }}
                disabled={!isConnected}
                title="Checksum algorithm"
              >
                {checksumTypes.map((type) => (
                  <option key={type} value={type} style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>
                    {type}
                  </option>
                ))}
              </select>
              {checksumConfig.type !== 'None' && (
                <button
                  onClick={() => setIsChecksumExpanded(!isChecksumExpanded)}
                  className="p-0.5 rounded transition-colors"
                  style={{ color: colors.textSecondary }}
                  title={isChecksumExpanded ? 'Hide checksum options' : 'Show checksum options'}
                >
                  {isChecksumExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}
            </div>

            {/* Format Selector */}
            <div
              className="p-0.5 rounded-[6px] flex text-xs font-medium"
              style={{ backgroundColor: colors.bgInput, border: `1px solid ${colors.borderLight}` }}
            >
              <button
                onClick={() => onFormatChange('Text')}
                className="px-3 py-0.5 rounded-[4px] transition-all"
                style={{
                  backgroundColor: format === 'Text' ? colors.accent : 'transparent',
                  color: format === 'Text' ? '#ffffff' : colors.textSecondary,
                  boxShadow: format === 'Text' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'
                }}
                disabled={!isConnected}
              >
                Text
              </button>
              <button
                onClick={() => onFormatChange('Hex')}
                className="px-3 py-0.5 rounded-[4px] transition-all"
                style={{
                  backgroundColor: format === 'Hex' ? colors.accent : 'transparent',
                  color: format === 'Hex' ? '#ffffff' : colors.textSecondary,
                  boxShadow: format === 'Hex' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'
                }}
                disabled={!isConnected}
              >
                Hex
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Content Area */}
      {sendMode === 'normal' ? (
        <>
          {/* Checksum Range Config (collapsible) */}
          {checksumConfig.type !== 'None' && isChecksumExpanded && (
            <div
              className="px-4 py-2 flex items-center space-x-4"
              style={{ borderBottom: `1px solid ${colors.borderLight}`, backgroundColor: colors.bgMain }}
            >
              <span className="text-xs" style={{ color: colors.textTertiary }}>Range:</span>
              <div className="flex items-center space-x-2">
                <span className="text-xs" style={{ color: colors.textSecondary }}>Start</span>
                <input
                  type="number"
                  value={checksumConfig.startIndex}
                  onChange={(e) => onChecksumConfigChange({ ...checksumConfig, startIndex: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-14 text-xs px-2 py-0.5 rounded text-center focus:outline-none"
                  style={{
                    backgroundColor: colors.bgInput,
                    border: `1px solid ${colors.border}`,
                    color: colors.textPrimary
                  }}
                  min="0"
                  disabled={!isConnected}
                  title="Start index (0 = first byte)"
                />
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs" style={{ color: colors.textSecondary }}>End</span>
                <input
                  type="number"
                  value={checksumConfig.endIndex}
                  onChange={(e) => onChecksumConfigChange({ ...checksumConfig, endIndex: Math.min(0, parseInt(e.target.value) || 0) })}
                  className="w-14 text-xs px-2 py-0.5 rounded text-center focus:outline-none"
                  style={{
                    backgroundColor: colors.bgInput,
                    border: `1px solid ${colors.border}`,
                    color: colors.textPrimary
                  }}
                  max="0"
                  disabled={!isConnected}
                  title="End index (0 or -1 = last byte, -2 = second to last)"
                />
              </div>
              <span className="text-xs" style={{ color: colors.textTertiary }}>
                (0/-1=last, -2=2nd last...)
              </span>
            </div>
          )}

          {/* Normal Send Content */}
          <div className="flex p-3 space-x-3">
            {/* Text Input */}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={getPlaceholderText()}
                className="w-full h-24 resize-none rounded-[6px] p-3 text-sm font-mono focus:outline-none focus:ring-2 shadow-inner"
                style={{
                  backgroundColor: colors.bgMain,
                  border: `1px solid ${colors.border}`,
                  color: colors.textPrimary,
                  '--tw-ring-color': `${colors.accent}80`
                } as React.CSSProperties}
                disabled={!isConnected}
              />

              <div className="flex items-center justify-between mt-2 text-xs" style={{ color: colors.textTertiary }}>
                <div className="flex items-center space-x-4">
                  {format === 'Text' && (
                    <span>Characters: {value.length}</span>
                  )}
                  <span>Bytes: {getByteCount()}</span>
                  {checksumConfig.type !== 'None' && (
                    <span style={{ color: colors.accent }}>
                      +{getChecksumLength(checksumConfig.type)} ({checksumConfig.type}) = {getTotalByteCount()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="w-40 flex flex-col space-y-2">
              <button
                onClick={handleSendClick}
                disabled={isNormalSendDisabled}
                className="w-full h-9 font-medium rounded-[6px] shadow-macos-btn transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
                style={{
                  backgroundColor: !isNormalSendDisabled ? colors.accent : colors.bgSurface,
                  color: !isNormalSendDisabled ? '#ffffff' : colors.textTertiary,
                  opacity: isNormalSendDisabled ? 0.5 : 1,
                  cursor: isNormalSendDisabled ? 'not-allowed' : 'pointer'
                }}
              >
                <span className="text-sm">{isScheduledEnabled ? 'Scheduled Active' : 'Send'}</span>
              </button>

              <div
                className="rounded-[6px] p-2"
                style={{ backgroundColor: colors.bgInput, border: `1px solid ${colors.borderLight}` }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: colors.textTertiary }}>Cycle (ms)</span>
                  <ToggleSwitch
                    checked={isScheduledEnabled}
                    onChange={handleScheduledToggle}
                    disabled={!isConnected}
                    title={isScheduledEnabled ? 'Stop scheduled sending' : 'Start scheduled sending'}
                  />
                </div>
                <input
                  type="number"
                  value={scheduledInterval}
                  onChange={handleIntervalChange}
                  className="w-full rounded px-2 py-1 text-xs text-right focus:outline-none"
                  style={{
                    backgroundColor: colors.bgMain,
                    border: `1px solid ${colors.border}`,
                    color: colors.textSecondary
                  }}
                  min="100"
                  max="60000"
                  step="100"
                  disabled={!isConnected || isScheduledRunning}
                  title="Send interval in milliseconds"
                />
              </div>

              {format === 'Hex' && (
                <div>
                  <h4 className="text-xs font-medium mb-2" style={{ color: colors.textTertiary }}>Quick Insert:</h4>
                  <div className="grid grid-cols-2 gap-1">
                    {commonHexValues.map((item) => (
                      <button
                        key={item.value}
                        onClick={() => insertCommonHex(item.value)}
                        className="text-xs px-2 py-1 rounded-[4px] font-mono transition-colors"
                        style={{
                          backgroundColor: colors.buttonSecondaryBg,
                          border: `1px solid ${colors.borderLight}`,
                          color: colors.textSecondary
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.buttonSecondaryHover}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = colors.buttonSecondaryBg}
                        disabled={!isConnected}
                        title={item.description}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Quick Command Mode */
        <div style={{ height: '240px' }}>
          <QuickCommandPanel
            lists={quickCommandLists}
            currentListId={currentQuickCommandListId}
            onListsChange={onQuickCommandListsChange}
            onCurrentListChange={onCurrentQuickCommandListChange}
            onSendCommand={onSendQuickCommand}
            onSendSelected={onSendSelectedQuickCommands}
            disabled={isQuickModeDisabled}
          />
        </div>
      )}
    </div>
  );
};

export default SendPanel;