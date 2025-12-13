import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Send, Shield, ChevronDown, ChevronUp, List, FileText } from 'lucide-react';
import { DataFormat, ChecksumType, ChecksumConfig, QuickCommandList, QuickCommand, LineEnding } from '../types';
import QuickCommandPanel from './QuickCommandPanel';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../i18n';
import { getChecksumLength, calculateChecksum } from '../utils/checksum';
import { getTextEncoding, textToHex as encodeTextToHex, hexToText as decodeHexToText } from '../utils/encoding';

// shadcn components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type SendMode = 'normal' | 'quickCommand';

// Minimum heights for different modes (exported for use in App.tsx)
export const SEND_PANEL_MIN_HEIGHTS = {
  normalText: 180,           // Header + textarea (min) + controls
  normalTextChecksum: 216,   // + checksum expanded row
  normalHex: 220,            // Header + textarea (min) + controls + quick insert row
  normalHexChecksum: 256,    // + checksum expanded row
  quickCommand: 280,         // Header + quick command panel
};

// Format hex input: filter non-hex chars, add spaces every 2 chars
const formatHexInput = (input: string, previousValue: string): string => {
  // Remove all spaces first
  const withoutSpaces = input.replace(/\s/g, '');

  // Filter to only valid hex characters (0-9, A-F, a-f)
  const hexOnly = withoutSpaces.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();

  // Add space after every 2 characters
  const pairs: string[] = [];
  for (let i = 0; i < hexOnly.length; i += 2) {
    pairs.push(hexOnly.substr(i, 2));
  }

  return pairs.join(' ');
};

interface SendPanelProps {
  value: string;
  onChange: (value: string) => void;
  format: DataFormat;
  onFormatChange: (format: DataFormat) => void;
  onSend: () => void;
  isConnected: boolean;
  checksumConfig: ChecksumConfig;
  onChecksumConfigChange: (config: ChecksumConfig) => void;
  // Quick Command props
  quickCommandLists: QuickCommandList[];
  currentQuickCommandListId: string;
  onQuickCommandListsChange: (lists: QuickCommandList[]) => void;
  onCurrentQuickCommandListChange: (listId: string) => void;
  onSendQuickCommand: (content: string, isHex: boolean, lineEnding: LineEnding) => void;
  onSendSelectedQuickCommands: (commands: QuickCommand[]) => void;
  // Callback to report current minimum height requirement
  onMinHeightChange?: (minHeight: number) => void;
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
  onMinHeightChange,
}) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sendMode, setSendMode] = useState<SendMode>('normal');
  const [isScheduledEnabled, setIsScheduledEnabled] = useState(false);
  const [scheduledInterval, setScheduledInterval] = useState(1000);
  const [isScheduledRunning, setIsScheduledRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isChecksumExpanded, setIsChecksumExpanded] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

  // Calculate disabled state for normal mode (depends on both connection AND content)
  const isNormalSendDisabled = !isConnected || !value.trim() || isScheduledEnabled || isConverting;
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

  // Handle format change with automatic conversion using configured encoding
  const handleFormatChange = useCallback(async (newFormat: DataFormat) => {
    if (newFormat === format || isConverting) return;

    setIsConverting(true);
    try {
      // Read encoding fresh from localStorage to ensure we use the latest setting
      const currentEncoding = getTextEncoding();
      if (newFormat === 'Hex') {
        // Convert text to hex using configured encoding
        const hexValue = await encodeTextToHex(value, currentEncoding);
        onChange(hexValue);
      } else {
        // Convert hex to text using configured encoding
        const textValue = await decodeHexToText(value, currentEncoding);
        onChange(textValue);
      }
      onFormatChange(newFormat);
    } catch (error) {
      console.error('Error converting format:', error);
    } finally {
      setIsConverting(false);
    }
  }, [format, value, onChange, onFormatChange, isConverting]);

  // Handle input change with hex validation and auto-spacing
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;

    if (format === 'Hex') {
      // Format and validate hex input
      const formattedHex = formatHexInput(newValue, value);
      onChange(formattedHex);
    } else {
      // Text mode: no restrictions
      onChange(newValue);
    }
  }, [format, value, onChange]);

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

  // Report minimum height changes to parent
  useEffect(() => {
    if (!onMinHeightChange) return;

    let minHeight: number;
    if (sendMode === 'quickCommand') {
      minHeight = SEND_PANEL_MIN_HEIGHTS.quickCommand;
    } else if (format === 'Hex') {
      minHeight = checksumConfig.type !== 'None' && isChecksumExpanded
        ? SEND_PANEL_MIN_HEIGHTS.normalHexChecksum
        : SEND_PANEL_MIN_HEIGHTS.normalHex;
    } else {
      minHeight = checksumConfig.type !== 'None' && isChecksumExpanded
        ? SEND_PANEL_MIN_HEIGHTS.normalTextChecksum
        : SEND_PANEL_MIN_HEIGHTS.normalText;
    }
    onMinHeightChange(minHeight);
  }, [sendMode, format, checksumConfig.type, isChecksumExpanded, onMinHeightChange]);

  const getPlaceholderText = () => {
    if (format === 'Text') {
      return t('sendPanel.placeholderText');
    } else {
      return t('sendPanel.placeholderHex');
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

  // Calculate checksum preview
  const checksumPreview = useMemo(() => {
    if (checksumConfig.type === 'None' || !value.trim()) {
      return '';
    }

    try {
      let dataBytes: Uint8Array;
      if (format === 'Text') {
        dataBytes = new TextEncoder().encode(value);
      } else {
        // Parse hex string to bytes
        const cleanHex = value.replace(/\s/g, '');
        const bytes: number[] = [];
        for (let i = 0; i < cleanHex.length; i += 2) {
          const byte = parseInt(cleanHex.substring(i, i + 2), 16);
          if (!isNaN(byte)) {
            bytes.push(byte);
          }
        }
        dataBytes = new Uint8Array(bytes);
      }

      if (dataBytes.length === 0) {
        return '';
      }

      const checksumBytes = calculateChecksum(dataBytes, checksumConfig);
      if (checksumBytes.length === 0) {
        return '';
      }

      // Format as hex string
      return checksumBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    } catch {
      return '';
    }
  }, [value, format, checksumConfig]);

  const insertCommonHex = (hexValue: string) => {
    const newValue = value ? `${value} ${hexValue}` : hexValue;
    onChange(newValue);
    // Focus back to textarea
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const commonHexValues = [
    { label: 'CR', value: '0D', descKey: 'sendPanel.carriageReturn' },
    { label: 'LF', value: '0A', descKey: 'sendPanel.lineFeed' },
    { label: 'CRLF', value: '0D 0A', descKey: 'sendPanel.crLf' },
    { label: 'NULL', value: '00', descKey: 'sendPanel.nullByte' },
    { label: 'ESC', value: '1B', descKey: 'sendPanel.escape' },
    { label: 'SPACE', value: '20', descKey: 'sendPanel.spaceChar' },
  ];

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: colors.bgSidebar }}>
      {/* Send Header with Mode Toggle */}
      <div
        className="px-4 py-2 flex justify-between items-center"
        style={{ borderBottom: `1px solid ${colors.borderLight}` }}
      >
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2" style={{ color: colors.textSecondary }}>
            <Send size={14} style={{ color: colors.textTertiary }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textPrimary }}>
              {sendMode === 'normal' ? t('sendPanel.payload') : t('sendPanel.quickCommands')}
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
              <span>{t('sendPanel.normal')}</span>
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
              <span>{t('sendPanel.quick')}</span>
            </button>
          </div>
        </div>

        {/* Right side controls - only show in normal mode */}
        {sendMode === 'normal' && (
          <div className="flex items-center space-x-3">
            {/* Checksum Type Selector */}
            <div className="flex items-center space-x-2">
              <Shield size={12} style={{ color: colors.textTertiary }} />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Select
                        value={checksumConfig.type}
                        onValueChange={(value) => onChecksumConfigChange({ ...checksumConfig, type: value as ChecksumType })}
                      >
                        <SelectTrigger
                          className="h-6 w-[100px] text-xs"
                          style={{
                            backgroundColor: checksumConfig.type !== 'None' ? colors.accent : colors.bgInput,
                            borderColor: colors.borderLight,
                            color: checksumConfig.type !== 'None' ? '#ffffff' : colors.textSecondary
                          }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {checksumTypes.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('sendPanel.checksumAlgorithm')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {checksumConfig.type !== 'None' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => setIsChecksumExpanded(!isChecksumExpanded)}
                      >
                        {isChecksumExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{isChecksumExpanded ? t('sendPanel.hideChecksumOptions') : t('sendPanel.showChecksumOptions')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Format Selector */}
            <div
              className="p-0.5 rounded-[6px] flex text-xs font-medium"
              style={{ backgroundColor: colors.bgInput, border: `1px solid ${colors.borderLight}` }}
            >
              <button
                onClick={() => handleFormatChange('Text')}
                className="px-3 py-0.5 rounded-[4px] transition-all"
                style={{
                  backgroundColor: format === 'Text' ? colors.accent : 'transparent',
                  color: format === 'Text' ? '#ffffff' : colors.textSecondary,
                  boxShadow: format === 'Text' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'
                }}
              >
                Text
              </button>
              <button
                onClick={() => handleFormatChange('Hex')}
                className="px-3 py-0.5 rounded-[4px] transition-all"
                style={{
                  backgroundColor: format === 'Hex' ? colors.accent : 'transparent',
                  color: format === 'Hex' ? '#ffffff' : colors.textSecondary,
                  boxShadow: format === 'Hex' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'
                }}
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
              <span className="text-xs" style={{ color: colors.textTertiary }}>{t('sendPanel.range')}:</span>
              <div className="flex items-center space-x-2">
                <span className="text-xs" style={{ color: colors.textSecondary }}>{t('sendPanel.start')}</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Input
                        type="number"
                        value={checksumConfig.startIndex}
                        onChange={(e) => onChecksumConfigChange({ ...checksumConfig, startIndex: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-14 h-6 text-xs text-center"
                        min={0}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('sendPanel.startIndexTitle')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs" style={{ color: colors.textSecondary }}>{t('sendPanel.end')}</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Input
                        type="number"
                        value={checksumConfig.endIndex}
                        onChange={(e) => onChecksumConfigChange({ ...checksumConfig, endIndex: Math.min(0, parseInt(e.target.value) || 0) })}
                        className="w-14 h-6 text-xs text-center"
                        max={0}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('sendPanel.endIndexTitle')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <span className="text-xs" style={{ color: colors.textTertiary }}>
                {t('sendPanel.indexHint')}
              </span>
            </div>
          )}

          {/* Normal Send Content */}
          <div className="flex-1 flex flex-col p-3 min-h-0">
            {/* Main row: Textarea + Controls */}
            <div className="flex-1 flex space-x-3 min-h-0">
              {/* Text Input */}
              <div className="flex-1 flex flex-col min-h-0">
                <Textarea
                  ref={textareaRef}
                  value={value}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={getPlaceholderText()}
                  className="flex-1 w-full min-h-[60px] resize-none text-sm font-mono shadow-inner"
                />

                <div className="flex items-center justify-between mt-2 text-xs flex-shrink-0" style={{ color: colors.textTertiary }}>
                  <div className="flex items-center space-x-4">
                    {format === 'Text' && (
                      <span>{t('sendPanel.characters')}: {value.length}</span>
                    )}
                    <span>{t('sendPanel.bytes')}: {getByteCount()}</span>
                    {checksumConfig.type !== 'None' && (
                      <span style={{ color: colors.accent }}>
                        +{getChecksumLength(checksumConfig.type)} ({checksumConfig.type}) = {getTotalByteCount()}
                        {checksumPreview && (
                          <span className="font-mono ml-2" style={{ color: colors.textTertiary }}>
                            [{checksumPreview}]
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="w-40 flex flex-col space-y-2 flex-shrink-0">
                <Button
                  onClick={handleSendClick}
                  disabled={isNormalSendDisabled}
                  className="w-full h-9"
                >
                  <span className="text-sm">{isScheduledEnabled ? t('sendPanel.scheduledActive') : t('sendPanel.send')}</span>
                </Button>

                <div
                  className="rounded-[6px] p-2"
                  style={{ backgroundColor: colors.bgInput, border: `1px solid ${colors.borderLight}` }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: colors.textTertiary }}>{t('sendPanel.cycle')}</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Switch
                              checked={isScheduledEnabled}
                              onCheckedChange={handleScheduledToggle}
                              disabled={!isConnected}
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{isScheduledEnabled ? t('sendPanel.stopScheduled') : t('sendPanel.startScheduled')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          type="number"
                          value={scheduledInterval}
                          onChange={handleIntervalChange}
                          className="w-full h-7 text-xs text-right"
                          min={100}
                          max={60000}
                          step={100}
                          disabled={!isConnected || isScheduledRunning}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('sendPanel.intervalTitle')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>

            {/* Quick Insert Row (Hex mode only) */}
            {format === 'Hex' && (
              <div
                className="mt-3 pt-3 flex items-center space-x-3 flex-shrink-0"
                style={{ borderTop: `1px solid ${colors.borderLight}` }}
              >
                <span className="text-xs font-medium whitespace-nowrap" style={{ color: colors.textTertiary }}>
                  {t('sendPanel.quickInsert')}:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {commonHexValues.map((item) => (
                    <TooltipProvider key={item.value}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-xs px-2.5 py-1 h-7 font-mono"
                            onClick={() => insertCommonHex(item.value)}
                            disabled={!isConnected}
                          >
                            {item.label}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t(item.descKey)}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Quick Command Mode */
        <div className="flex-1 min-h-0">
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