import React, { useRef, useEffect, useState } from 'react';
import { Send, Type, Hash, Clock, Play, Pause } from 'lucide-react';
import { DataFormat } from '../types';
import ToggleSwitch from './ToggleSwitch';
import { useTheme } from '../contexts/ThemeContext';

interface SendPanelProps {
  value: string;
  onChange: (value: string) => void;
  format: DataFormat;
  onFormatChange: (format: DataFormat) => void;
  onSend: () => void;
  disabled: boolean;
}

const SendPanel: React.FC<SendPanelProps> = ({
  value,
  onChange,
  format,
  onFormatChange,
  onSend,
  disabled,
}) => {
  const { colors } = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isScheduledEnabled, setIsScheduledEnabled] = useState(false);
  const [scheduledInterval, setScheduledInterval] = useState(1000); // Default 1000ms
  const [isScheduledRunning, setIsScheduledRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSend();
      }
    }
  };

  const handleSendClick = () => {
    if (!disabled && value.trim()) {
      onSend();
    }
  };

  const handleScheduledToggle = () => {
    const newEnabledState = !isScheduledEnabled;
    setIsScheduledEnabled(newEnabledState);
    
    if (newEnabledState && value.trim() && !disabled) {
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
    if (!value.trim() || disabled) return;
    
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

  // Cleanup when disabled or value becomes empty
  useEffect(() => {
    if (disabled || !value.trim()) {
      stopScheduledSending();
    }
  }, [disabled, value]);

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
      {/* Send Header */}
      <div
        className="px-4 py-2 flex justify-between items-center"
        style={{ borderBottom: `1px solid ${colors.borderLight}` }}
      >
        <div className="flex items-center space-x-2" style={{ color: colors.textSecondary }}>
          <Send size={14} style={{ color: colors.textTertiary }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textPrimary }}>Payload</span>
        </div>

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
            disabled={disabled}
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
            disabled={disabled}
          >
            Hex
          </button>
        </div>
      </div>

      {/* Send Content */}
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
            disabled={disabled}
          />

          <div className="flex items-center justify-between mt-2 text-xs" style={{ color: colors.textTertiary }}>
            <div>
              {format === 'Text' && (
                <span>Characters: {value.length}</span>
              )}
              <span className="ml-4">Bytes: {getByteCount()}</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="w-40 flex flex-col space-y-2">
          <button
            onClick={handleSendClick}
            disabled={disabled || !value.trim() || isScheduledEnabled}
            className="w-full h-9 font-medium rounded-[6px] shadow-macos-btn transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
            style={{
              backgroundColor: !isScheduledEnabled && !disabled && value.trim() ? colors.accent : colors.bgSurface,
              color: !isScheduledEnabled && !disabled && value.trim() ? '#ffffff' : colors.textTertiary,
              opacity: disabled || !value.trim() || isScheduledEnabled ? 0.5 : 1,
              cursor: disabled || !value.trim() || isScheduledEnabled ? 'not-allowed' : 'pointer'
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
                disabled={disabled}
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
              disabled={disabled || isScheduledRunning}
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
                    disabled={disabled}
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
    </div>
  );
};

export default SendPanel;