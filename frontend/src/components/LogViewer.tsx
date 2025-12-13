import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Trash2, Download, Terminal, ChevronDown, Circle, Search, X, ChevronUp } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { LogEntry, TextEncoding, SpecialCharConfig, RecordingStatus, ReceiveDisplayFormat, SpecialCharConfigBackend } from '../types';
import ToggleSwitch from './ToggleSwitch';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../i18n';
import { loadTimezone, formatTimestampWithTimezone } from '../utils/timezone';

const STORAGE_KEY_RECEIVE_FORMAT = 'serialDebug_receiveFormat';
const STORAGE_KEY_SHOW_TIMESTAMPS = 'serialDebug_showTimestamps';
const STORAGE_KEY_TEXT_ENCODING = 'serialDebug_textEncoding';
const STORAGE_KEY_SPECIAL_CHAR_CONFIG = 'serialDebug_specialCharConfig';
const STORAGE_KEY_SAVE_TEXT_ENABLED = 'serialDebug_saveTextEnabled';
const STORAGE_KEY_SAVE_RAW_ENABLED = 'serialDebug_saveRawEnabled';
const STORAGE_KEY_LOG_PATH = 'serialDebug_logPath';
const STORAGE_KEY_SHOW_LINE_NUMBERS = 'serialDebug_showLineNumbers';

// Threshold in pixels to consider "at bottom" for auto-scroll re-enable
const SCROLL_BOTTOM_THRESHOLD = 50;

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
  const { t } = useTranslation();
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const previousLogsLengthRef = useRef(logs.length);
  const wasConnectedRef = useRef(isConnected);

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

  // Recording states
  const [saveTextEnabled, setSaveTextEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SAVE_TEXT_ENABLED);
    return saved === 'true';
  });
  const [saveRawEnabled, setSaveRawEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SAVE_RAW_ENABLED);
    return saved === 'true';
  });
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>({
    text_recording_active: false,
    raw_recording_active: false,
    text_file_path: null,
    raw_file_path: null,
  });

  // Line numbers state
  const [showLineNumbers, setShowLineNumbers] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SHOW_LINE_NUMBERS);
    return saved === 'true'; // Default to false
  });

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const logEntryRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  // Helper function to convert frontend SpecialCharConfig to backend format
  const toBackendSpecialCharConfig = (config: SpecialCharConfig): SpecialCharConfigBackend => ({
    enabled: config.enabled,
    convert_lf: config.convertLF,
    convert_cr: config.convertCR,
    convert_tab: config.convertTab,
    convert_null: config.convertNull,
    convert_esc: config.convertEsc,
    convert_spaces: config.convertSpaces,
  });

  // Sync display settings with backend when they change
  // This enables pre-formatted log rendering for new incoming data
  useEffect(() => {
    const syncDisplaySettings = async () => {
      try {
        await invoke('set_display_format', { format: receiveFormat });
      } catch (error) {
        console.error('Error syncing display format:', error);
      }
    };
    syncDisplaySettings();
  }, [receiveFormat]);

  useEffect(() => {
    const syncTextEncoding = async () => {
      try {
        await invoke('set_text_encoding_display', { encoding: textEncoding });
      } catch (error) {
        console.error('Error syncing text encoding:', error);
      }
    };
    syncTextEncoding();
  }, [textEncoding]);

  useEffect(() => {
    const syncSpecialCharConfig = async () => {
      try {
        await invoke('set_special_char_config', { config: toBackendSpecialCharConfig(specialCharConfig) });
      } catch (error) {
        console.error('Error syncing special char config:', error);
      }
    };
    syncSpecialCharConfig();
  }, [specialCharConfig]);

  useEffect(() => {
    const syncShowTimestamps = async () => {
      try {
        await invoke('set_show_timestamps', { show: showTimestamps });
      } catch (error) {
        console.error('Error syncing show timestamps:', error);
      }
    };
    syncShowTimestamps();
  }, [showTimestamps]);

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

  // Persist recording checkbox states to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SAVE_TEXT_ENABLED, String(saveTextEnabled));
  }, [saveTextEnabled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SAVE_RAW_ENABLED, String(saveRawEnabled));
  }, [saveRawEnabled]);

  // Persist line numbers setting to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SHOW_LINE_NUMBERS, String(showLineNumbers));
  }, [showLineNumbers]);

  // Smart scroll detection: disable auto-scroll when user scrolls up, re-enable at bottom
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!logContainerRef.current) return;

    // User scrolling up - disable auto-scroll
    if (e.deltaY < 0 && autoScrollEnabled) {
      setAutoScrollEnabled(false);
    }
  }, [autoScrollEnabled]);

  const handleScroll = useCallback(() => {
    if (!logContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // User scrolled to bottom (within threshold) - re-enable auto-scroll
    if (distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD && !autoScrollEnabled) {
      setAutoScrollEnabled(true);
    }
  }, [autoScrollEnabled]);

  // Attach wheel and scroll listeners
  useEffect(() => {
    const container = logContainerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleWheel, handleScroll]);

  // Sync log directory with backend on mount and when it changes
  useEffect(() => {
    const syncLogDirectory = async () => {
      const logPath = localStorage.getItem(STORAGE_KEY_LOG_PATH);
      if (logPath) {
        try {
          await invoke('set_log_directory', { path: logPath });
        } catch (error) {
          console.error('Error setting log directory:', error);
        }
      }
    };
    syncLogDirectory();

    // Also listen for changes
    const interval = setInterval(() => {
      const logPath = localStorage.getItem(STORAGE_KEY_LOG_PATH);
      if (logPath) {
        invoke('set_log_directory', { path: logPath }).catch(console.error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Handle auto-start/stop recording based on connection state
  useEffect(() => {
    const handleConnectionChange = async () => {
      const wasConnected = wasConnectedRef.current;
      wasConnectedRef.current = isConnected;

      if (isConnected && !wasConnected) {
        // Just connected - start recordings if checkboxes are enabled
        if (saveTextEnabled) {
          try {
            await invoke('start_text_recording');
          } catch (error) {
            console.error('Error starting text recording:', error);
          }
        }
        if (saveRawEnabled) {
          try {
            await invoke('start_raw_recording');
          } catch (error) {
            console.error('Error starting raw recording:', error);
          }
        }
      }

      // Update recording status
      try {
        const status = await invoke<RecordingStatus>('get_recording_status');
        setRecordingStatus(status);
      } catch (error) {
        console.error('Error getting recording status:', error);
      }
    };

    handleConnectionChange();
  }, [isConnected, saveTextEnabled, saveRawEnabled]);

  // Handle checkbox changes when connected
  const handleSaveTextChange = async (enabled: boolean) => {
    setSaveTextEnabled(enabled);
    if (isConnected) {
      try {
        if (enabled) {
          await invoke('start_text_recording');
        } else {
          await invoke('stop_text_recording');
        }
        const status = await invoke<RecordingStatus>('get_recording_status');
        setRecordingStatus(status);
      } catch (error) {
        console.error('Error toggling text recording:', error);
      }
    }
  };

  const handleSaveRawChange = async (enabled: boolean) => {
    setSaveRawEnabled(enabled);
    if (isConnected) {
      try {
        if (enabled) {
          await invoke('start_raw_recording');
        } else {
          await invoke('stop_raw_recording');
        }
        const status = await invoke<RecordingStatus>('get_recording_status');
        setRecordingStatus(status);
      } catch (error) {
        console.error('Error toggling raw recording:', error);
      }
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return formatTimestampWithTimezone(timestamp, loadTimezone());
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

  // Search logic: compute all matches
  interface SearchMatch {
    logIndex: number;
    startPos: number;
    endPos: number;
  }

  const searchMatches = useMemo((): SearchMatch[] => {
    if (!searchQuery.trim()) return [];

    const matches: SearchMatch[] = [];
    const query = searchQuery.toLowerCase();

    logs.forEach((log, logIndex) => {
      const text = (log.display_text ?? formatData(log.data)).toLowerCase();
      let pos = 0;
      while ((pos = text.indexOf(query, pos)) !== -1) {
        matches.push({
          logIndex,
          startPos: pos,
          endPos: pos + query.length,
        });
        pos += 1; // Move forward to find overlapping matches
      }
    });

    return matches;
  }, [searchQuery, logs]);

  // Reset current match index when matches change
  useEffect(() => {
    if (searchMatches.length > 0) {
      setCurrentMatchIndex(0);
    }
  }, [searchMatches.length]);

  // Get match count for display
  const totalMatches = searchMatches.length;

  // Navigation functions
  const goToNextMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setCurrentMatchIndex(prev => (prev + 1) % totalMatches);
  }, [totalMatches]);

  const goToPrevMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setCurrentMatchIndex(prev => (prev - 1 + totalMatches) % totalMatches);
  }, [totalMatches]);

  // Scroll to current match
  useEffect(() => {
    if (totalMatches === 0 || !searchOpen) return;

    const currentMatch = searchMatches[currentMatchIndex];
    if (!currentMatch) return;

    const logEntry = logEntryRefs.current[currentMatch.logIndex];
    if (logEntry) {
      logEntry.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentMatchIndex, searchMatches, searchOpen, totalMatches]);

  // Open search function
  const openSearch = useCallback(() => {
    setSearchOpen(true);
    // Focus input after state update
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  // Close search function
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setCurrentMatchIndex(0);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F to open search
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        openSearch();
        return;
      }

      // Escape to close search
      if (e.key === 'Escape' && searchOpen) {
        e.preventDefault();
        closeSearch();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen, openSearch, closeSearch]);

  // Handle search input keyboard events
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        goToPrevMatch();
      } else {
        goToNextMatch();
      }
    }
  };

  // Helper function to render text with highlights
  const renderTextWithHighlights = (text: string, logIndex: number): React.ReactNode => {
    if (!searchQuery.trim() || !searchOpen) {
      return text;
    }

    const query = searchQuery.toLowerCase();
    const lowerText = text.toLowerCase();
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let matchCountInLog = 0;

    // Find global match index for this log entry
    let globalMatchStartIndex = 0;
    for (let i = 0; i < logIndex; i++) {
      const logText = (logs[i].display_text ?? formatData(logs[i].data)).toLowerCase();
      let pos = 0;
      while ((pos = logText.indexOf(query, pos)) !== -1) {
        globalMatchStartIndex++;
        pos += 1;
      }
    }

    let pos = 0;
    while ((pos = lowerText.indexOf(query, pos)) !== -1) {
      // Add non-matching text before this match
      if (pos > lastIndex) {
        parts.push(text.substring(lastIndex, pos));
      }

      const globalIndex = globalMatchStartIndex + matchCountInLog;
      const isCurrentMatch = globalIndex === currentMatchIndex;

      // Add highlighted match
      parts.push(
        <span
          key={`${logIndex}-${pos}`}
          style={{
            backgroundColor: isCurrentMatch ? colors.warning : colors.accent,
            color: isCurrentMatch ? '#000' : colors.textPrimary,
            borderRadius: '2px',
            padding: '0 1px',
          }}
        >
          {text.substring(pos, pos + searchQuery.length)}
        </span>
      );

      lastIndex = pos + searchQuery.length;
      matchCountInLog++;
      pos += 1;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  const sentCount = logs.filter(log => log.direction === 'Sent').length;
  const receivedCount = logs.filter(log => log.direction === 'Received').length;
  const totalBytes = logs.reduce((acc, log) => acc + log.data.length, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header - Two Rows */}
      <div
        className="flex flex-col shadow-sm z-10"
        style={{
          backgroundColor: colors.bgHeader,
          borderBottom: `1px solid ${colors.borderDark}`
        }}
      >
        {/* Row 1: Console Output title, Export, Clear */}
        <div className="h-9 px-4 flex items-center justify-between">
          <div className="flex items-center space-x-2" style={{ color: colors.textSecondary }}>
            <Terminal size={16} style={{ color: colors.textTertiary }} />
            <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>{t('logViewer.consoleOutput')}</span>
            <span className="text-xs" style={{ color: colors.textTertiary }}>
              ({logs.length})
            </span>
          </div>

          <div
            className="flex rounded-md p-0.5"
            style={{ backgroundColor: colors.bgInput, border: `1px solid ${colors.borderLight}` }}
          >
            <button
              onClick={openSearch}
              className="px-2 py-0.5 text-xs rounded flex items-center space-x-1 transition-colors"
              style={{ color: searchOpen ? colors.accent : colors.textSecondary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.bgHover;
                e.currentTarget.style.color = colors.textPrimary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = searchOpen ? colors.accent : colors.textSecondary;
              }}
              title={t('logViewer.search')}
            >
              <Search size={12} />
              <span>{t('logViewer.search')}</span>
            </button>
            <div className="w-px my-0.5 mx-0.5" style={{ backgroundColor: colors.border }}></div>
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
              title={t('logViewer.exportLogs')}
            >
              <Download size={12} />
              <span>{t('logViewer.export')}</span>
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
              title={t('logViewer.clearLogs')}
            >
              <Trash2 size={12} />
              <span>{t('logViewer.clear')}</span>
            </button>
          </div>
        </div>

        {/* Row 2: Format, Timestamps, Auto Scroll, Save Text, Save Raw */}
        <div
          className="h-8 px-4 flex items-center justify-between"
          style={{ borderTop: `1px solid ${colors.borderLight}` }}
        >
          <div className="flex items-center space-x-3">
            {/* Receive Format Dropdown */}
            <div className="relative" ref={formatDropdownRef}>
              <button
                onClick={() => setFormatDropdownOpen(!formatDropdownOpen)}
                className="flex items-center space-x-1 px-2 py-0.5 text-xs rounded transition-colors"
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
                title={t('logViewer.receiveFormat')}
              >
                <span>{t('logViewer.format')}:</span>
                <span style={{ color: colors.textPrimary }}>{receiveFormat}</span>
                <ChevronDown size={12} />
              </button>
              {formatDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 py-1 rounded-md shadow-lg z-50"
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
            <div className="flex items-center space-x-1.5">
              <span className="text-xs" style={{ color: colors.textTertiary }}>{t('logViewer.timestamps')}</span>
              <ToggleSwitch
                checked={showTimestamps}
                onChange={setShowTimestamps}
                title={t('logViewer.toggleTimestamps')}
              />
            </div>

            {/* Auto Scroll Toggle */}
            <div className="flex items-center space-x-1.5">
              <span className="text-xs" style={{ color: colors.textTertiary }}>{t('logViewer.autoScroll')}</span>
              <ToggleSwitch
                checked={autoScrollEnabled}
                onChange={setAutoScrollEnabled}
                title={t('logViewer.toggleAutoScroll')}
              />
            </div>

            {/* Line Numbers Toggle */}
            <div className="flex items-center space-x-1.5">
              <span className="text-xs" style={{ color: colors.textTertiary }}>{t('logViewer.lineNumbers')}</span>
              <ToggleSwitch
                checked={showLineNumbers}
                onChange={setShowLineNumbers}
                title={t('logViewer.toggleLineNumbers')}
              />
            </div>
          </div>

          {/* Recording Checkboxes */}
          <div className="flex items-center space-x-3">
            {/* Save Text Checkbox */}
            <label
              className="flex items-center space-x-1.5 cursor-pointer"
              title={recordingStatus.text_recording_active ? `${t('logViewer.recordingTo')}: ${recordingStatus.text_file_path}` : t('logViewer.enableTextRecording')}
            >
              <input
                type="checkbox"
                checked={saveTextEnabled}
                onChange={(e) => handleSaveTextChange(e.target.checked)}
                className="w-3.5 h-3.5 rounded"
                style={{ accentColor: colors.accent }}
              />
              <span className="text-xs" style={{ color: colors.textTertiary }}>{t('logViewer.saveText')}</span>
              {recordingStatus.text_recording_active && (
                <Circle size={8} fill={colors.success} style={{ color: colors.success }} />
              )}
            </label>

            {/* Save Raw Checkbox */}
            <label
              className="flex items-center space-x-1.5 cursor-pointer"
              title={recordingStatus.raw_recording_active ? `${t('logViewer.recordingTo')}: ${recordingStatus.raw_file_path}` : t('logViewer.enableRawRecording')}
            >
              <input
                type="checkbox"
                checked={saveRawEnabled}
                onChange={(e) => handleSaveRawChange(e.target.checked)}
                className="w-3.5 h-3.5 rounded"
                style={{ accentColor: colors.accent }}
              />
              <span className="text-xs" style={{ color: colors.textTertiary }}>{t('logViewer.saveRaw')}</span>
              {recordingStatus.raw_recording_active && (
                <Circle size={8} fill={colors.success} style={{ color: colors.success }} />
              )}
            </label>
          </div>
        </div>

        {/* Row 3: Search bar (visible when search is open) */}
        {searchOpen && (
          <div
            className="h-8 px-4 flex items-center space-x-2"
            style={{ borderTop: `1px solid ${colors.borderLight}` }}
          >
            <Search size={14} style={{ color: colors.textTertiary }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('logViewer.searchPlaceholder')}
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: colors.textPrimary }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-0.5 rounded transition-colors"
                style={{ color: colors.textTertiary }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = colors.textPrimary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = colors.textTertiary;
                }}
                title={t('logViewer.clearSearch')}
              >
                <X size={12} />
              </button>
            )}
            <span className="text-xs px-1" style={{ color: colors.textTertiary }}>
              {totalMatches > 0 ? `${currentMatchIndex + 1}/${totalMatches}` : '0/0'}
            </span>
            <div className="flex items-center">
              <button
                onClick={goToPrevMatch}
                disabled={totalMatches === 0}
                className="p-0.5 rounded transition-colors"
                style={{
                  color: totalMatches === 0 ? colors.textTertiary : colors.textSecondary,
                  opacity: totalMatches === 0 ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (totalMatches > 0) e.currentTarget.style.color = colors.textPrimary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = totalMatches === 0 ? colors.textTertiary : colors.textSecondary;
                }}
                title={t('logViewer.prevMatch')}
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={goToNextMatch}
                disabled={totalMatches === 0}
                className="p-0.5 rounded transition-colors"
                style={{
                  color: totalMatches === 0 ? colors.textTertiary : colors.textSecondary,
                  opacity: totalMatches === 0 ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (totalMatches > 0) e.currentTarget.style.color = colors.textPrimary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = totalMatches === 0 ? colors.textTertiary : colors.textSecondary;
                }}
                title={t('logViewer.nextMatch')}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <button
              onClick={closeSearch}
              className="p-0.5 rounded transition-colors"
              style={{ color: colors.textTertiary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = colors.textPrimary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = colors.textTertiary;
              }}
              title={t('logViewer.closeSearch')}
            >
              <X size={14} />
            </button>
          </div>
        )}
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
              <p className="text-lg">{t('logViewer.noData')}</p>
              <p className="text-sm mt-2">
                {isConnected
                  ? t('logViewer.dataWillAppear')
                  : t('logViewer.connectToStart')
                }
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {logs.map((log, index) => (
              <div
                key={index}
                ref={(el) => { logEntryRefs.current[index] = el; }}
                className="py-1 px-2 rounded-[4px] transition-colors duration-150"
                style={{
                  borderLeft: `2px solid ${log.direction === 'Sent' ? colors.accent : colors.success}`,
                  backgroundColor: log.direction === 'Sent' ? colors.logSentBg : colors.logReceivedBg
                }}
              >
                <div className="flex items-start space-x-2">
                  {showLineNumbers && (
                    <span
                      className="text-xs select-none font-mono"
                      style={{
                        color: colors.textTertiary,
                        opacity: 0.5,
                        minWidth: `${Math.max(String(logs.length).length, 3)}ch`,
                        textAlign: 'right'
                      }}
                    >
                      {index + 1}
                    </span>
                  )}
                  {showTimestamps && (
                    <span className="text-xs select-none" style={{ color: colors.textTertiary, opacity: 0.6 }}>
                      {/* Use pre-formatted timestamp if available, otherwise format on the fly */}
                      {log.timestamp_formatted ?? formatTimestamp(log.timestamp)}
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
                    {/* Use pre-formatted display_text with search highlighting, fallback to on-the-fly formatting */}
                    {renderTextWithHighlights(log.display_text ?? formatData(log.data), index)}
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
            {t('logViewer.tx')}: {sentCount}
          </span>
          <span className="flex items-center">
            <div className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: colors.success }}></div>
            {t('logViewer.rx')}: {receivedCount}
          </span>
        </div>
        <span>{t('logViewer.total')}: {totalBytes.toLocaleString()} {t('logViewer.bytes')}</span>
      </div>
    </div>
  );
};

export default LogViewer;
