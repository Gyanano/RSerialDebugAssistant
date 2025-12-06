import React, { useState, useEffect } from 'react';
import { X, Folder, Moon, Sun, ChevronDown, ChevronUp } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import ToggleSwitch from './ToggleSwitch';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage, Language } from '../i18n';
import { TextEncoding, SpecialCharConfig, FrameSegmentationConfig, FrameSegmentationMode, FrameDelimiter, TimezoneOption } from '../types';
import { TIMEZONE_OPTIONS, loadTimezone, saveTimezone, getSystemTimezoneAsUtcOffset, getSystemTimezoneName, getSystemTimezoneOffset, parseUtcOffset } from '../utils/timezone';

const DEFAULT_SPECIAL_CHAR_CONFIG: SpecialCharConfig = {
  enabled: true,
  convertLF: true,
  convertCR: true,
  convertTab: true,
  convertNull: true,
  convertEsc: true,
  convertSpaces: true,
};

const DEFAULT_FRAME_SEGMENTATION_CONFIG: FrameSegmentationConfig = {
  mode: 'Timeout',
  timeout_ms: 10,
  delimiter: 'AnyNewline',
};

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { themeMode, setThemeMode, colors } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [timezone, setTimezoneState] = useState<TimezoneOption>(loadTimezone);
  const [logPath, setLogPath] = useState('~/Documents/SerialLogs');
  const [maxLogLines, setMaxLogLines] = useState(1000);
  const [textEncoding, setTextEncoding] = useState<TextEncoding>('utf-8');
  const [specialCharConfig, setSpecialCharConfig] = useState<SpecialCharConfig>(DEFAULT_SPECIAL_CHAR_CONFIG);
  const [specialCharExpanded, setSpecialCharExpanded] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);

  // Frame segmentation state
  const [frameSegmentationConfig, setFrameSegmentationConfig] = useState<FrameSegmentationConfig>(DEFAULT_FRAME_SEGMENTATION_CONFIG);
  const [customDelimiterHex, setCustomDelimiterHex] = useState('');
  const [customDelimiterError, setCustomDelimiterError] = useState('');

  // Helper to get delimiter type for UI display
  const getDelimiterType = (delimiter: FrameDelimiter): 'AnyNewline' | 'CR' | 'LF' | 'CRLF' | 'Custom' => {
    if (typeof delimiter === 'object' && 'Custom' in delimiter) {
      return 'Custom';
    }
    return delimiter as 'AnyNewline' | 'CR' | 'LF' | 'CRLF';
  };

  // Parse hex string to byte array
  const parseHexString = (hex: string): number[] | null => {
    const cleaned = hex.replace(/\s+/g, '').toUpperCase();
    if (cleaned.length === 0) return null;
    if (cleaned.length % 2 !== 0) return null;

    const bytes: number[] = [];
    for (let i = 0; i < cleaned.length; i += 2) {
      const byte = parseInt(cleaned.substring(i, i + 2), 16);
      if (isNaN(byte)) return null;
      bytes.push(byte);
    }
    return bytes;
  };

  // Format byte array to hex string for display
  const bytesToHexString = (bytes: number[]): string => {
    return bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  };

  // Load saved settings from localStorage on component mount
  useEffect(() => {
    const savedLogPath = localStorage.getItem('serialDebug_logPath');
    const savedMaxLogLines = localStorage.getItem('serialDebug_maxLogLines');
    const savedTextEncoding = localStorage.getItem('serialDebug_textEncoding');
    const savedSpecialCharConfig = localStorage.getItem('serialDebug_specialCharConfig');
    const savedFrameSegmentationConfig = localStorage.getItem('serialDebug_frameSegmentation');

    if (savedLogPath) {
      setLogPath(savedLogPath);
    }
    if (savedMaxLogLines) {
      setMaxLogLines(parseInt(savedMaxLogLines, 10));
    }
    if (savedTextEncoding === 'utf-8' || savedTextEncoding === 'gbk') {
      setTextEncoding(savedTextEncoding);
    }
    if (savedSpecialCharConfig) {
      try {
        const parsed = JSON.parse(savedSpecialCharConfig);
        setSpecialCharConfig({ ...DEFAULT_SPECIAL_CHAR_CONFIG, ...parsed });
      } catch {
        // Use default if parsing fails
      }
    }
    if (savedFrameSegmentationConfig) {
      try {
        const parsed = JSON.parse(savedFrameSegmentationConfig) as FrameSegmentationConfig;
        setFrameSegmentationConfig(parsed);
        // Initialize custom delimiter hex input if using custom
        if (typeof parsed.delimiter === 'object' && 'Custom' in parsed.delimiter) {
          setCustomDelimiterHex(bytesToHexString(parsed.delimiter.Custom));
        }
      } catch {
        // Use default if parsing fails
      }
    }
  }, []);

  // Save log path to localStorage whenever it changes
  const handleLogPathChange = (path: string) => {
    setLogPath(path);
    localStorage.setItem('serialDebug_logPath', path);
  };

  // Save max log lines to localStorage and sync with backend
  const handleMaxLogLinesChange = async (value: number) => {
    const clampedValue = Math.min(10000, Math.max(100, value));
    setMaxLogLines(clampedValue);
    localStorage.setItem('serialDebug_maxLogLines', clampedValue.toString());
    try {
      await invoke('set_log_limit', { limit: clampedValue });
    } catch (error) {
      console.error('Error setting log limit:', error);
    }
  };

  // Save text encoding to localStorage
  const handleTextEncodingChange = (encoding: TextEncoding) => {
    setTextEncoding(encoding);
    localStorage.setItem('serialDebug_textEncoding', encoding);
  };

  // Save special character config to localStorage
  const handleSpecialCharConfigChange = (updates: Partial<SpecialCharConfig>) => {
    const newConfig = { ...specialCharConfig, ...updates };
    setSpecialCharConfig(newConfig);
    localStorage.setItem('serialDebug_specialCharConfig', JSON.stringify(newConfig));
  };

  // Handle timezone change
  const handleTimezoneChange = async (tz: TimezoneOption) => {
    setTimezoneState(tz);
    saveTimezone(tz);

    // Sync timezone offset to backend for recording timestamps
    const offsetMinutes = tz === 'System'
      ? Math.round(getSystemTimezoneOffset() * 60)  // Convert hours to minutes
      : Math.round(parseUtcOffset(tz) * 60);
    try {
      await invoke('set_timezone_offset', { offsetMinutes });
    } catch (error) {
      console.error('Error setting timezone offset:', error);
    }
  };

  // Save frame segmentation config to localStorage and sync with backend
  const handleFrameSegmentationChange = async (updates: Partial<FrameSegmentationConfig>) => {
    const newConfig = { ...frameSegmentationConfig, ...updates };
    setFrameSegmentationConfig(newConfig);
    localStorage.setItem('serialDebug_frameSegmentation', JSON.stringify(newConfig));
    try {
      await invoke('set_frame_segmentation', { config: newConfig });
    } catch (error) {
      console.error('Error setting frame segmentation config:', error);
    }
  };

  // Handle frame segmentation mode change
  const handleModeChange = (mode: FrameSegmentationMode) => {
    handleFrameSegmentationChange({ mode });
  };

  // Handle timeout change
  const handleTimeoutChange = (timeout: number) => {
    const clampedValue = Math.min(1000, Math.max(10, timeout));
    handleFrameSegmentationChange({ timeout_ms: clampedValue });
  };

  // Handle delimiter type change
  const handleDelimiterTypeChange = (type: 'AnyNewline' | 'CR' | 'LF' | 'CRLF' | 'Custom') => {
    if (type === 'Custom') {
      const bytes = parseHexString(customDelimiterHex);
      if (bytes && bytes.length > 0) {
        handleFrameSegmentationChange({ delimiter: { Custom: bytes } });
        setCustomDelimiterError('');
      } else {
        // Set a default custom delimiter if none is valid
        setCustomDelimiterHex('0A');
        handleFrameSegmentationChange({ delimiter: { Custom: [0x0A] } });
        setCustomDelimiterError('');
      }
    } else {
      handleFrameSegmentationChange({ delimiter: type });
      setCustomDelimiterError('');
    }
  };

  // Handle custom delimiter hex input change
  const handleCustomDelimiterChange = (hex: string) => {
    setCustomDelimiterHex(hex);
    const bytes = parseHexString(hex);
    if (bytes === null && hex.trim() !== '') {
      setCustomDelimiterError('Invalid hex format');
    } else if (bytes && bytes.length === 0) {
      setCustomDelimiterError('Delimiter cannot be empty');
    } else {
      setCustomDelimiterError('');
      if (bytes && bytes.length > 0) {
        handleFrameSegmentationChange({ delimiter: { Custom: bytes } });
      }
    }
  };

  // Handle folder selection with Tauri dialog
  const handleBrowsePath = async () => {
    try {
      setIsBrowsing(true);
      console.log('Opening file dialog...');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Log Save Location',
      });
      console.log('Dialog result:', selected);

      if (selected && typeof selected === 'string') {
        console.log('Selected path:', selected);
        handleLogPathChange(selected);
      } else {
        console.log('No path selected or dialog cancelled');
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
      alert(`Error selecting folder: ${error}`);
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleCheckUpdates = () => {
    // TODO: Implement update check
    console.log('Check for updates clicked');
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center transition-opacity duration-200"
    >
      {/* Modal Window */}
      <div
        className="w-[500px] max-h-[80vh] rounded-xl shadow-macos-window flex flex-col overflow-hidden transform transition-all duration-200"
        style={{
          backgroundColor: colors.bgSidebar,
          borderColor: colors.border,
          borderWidth: '1px',
          borderStyle: 'solid'
        }}
      >

        {/* Modal Header */}
        <div
          className="h-10 flex items-center justify-between px-4 select-none"
          style={{
            backgroundColor: colors.bgHeader,
            borderBottom: `1px solid ${colors.borderDark}`
          }}
        >
          <span className="font-semibold text-sm" style={{ color: colors.textPrimary }}>{t('settings.title')}</span>
          <button
            onClick={onClose}
            className="transition-colors focus:outline-none"
            style={{ color: colors.textSecondary }}
            onMouseEnter={(e) => e.currentTarget.style.color = colors.textPrimary}
            onMouseLeave={(e) => e.currentTarget.style.color = colors.textSecondary}
            title={t('settings.close')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-6 overflow-y-auto">

          {/* Appearance Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide ml-1" style={{ color: colors.textTertiary }}>
              {t('settings.appearance')}
            </h3>
            <div
              className="rounded-lg p-1 flex"
              style={{ backgroundColor: colors.bgMain, border: `1px solid ${colors.borderLight}` }}
            >
              <button
                onClick={() => setThemeMode('light')}
                className="flex-1 py-1.5 text-xs font-medium rounded-[5px] transition-all flex items-center justify-center space-x-1"
                style={{
                  backgroundColor: themeMode === 'light' ? colors.accent : 'transparent',
                  color: themeMode === 'light' ? '#ffffff' : colors.textSecondary,
                  boxShadow: themeMode === 'light' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'
                }}
              >
                <Sun size={12} />
                <span>{t('settings.light')}</span>
              </button>
              <button
                onClick={() => setThemeMode('dark')}
                className="flex-1 py-1.5 text-xs font-medium rounded-[5px] transition-all flex items-center justify-center space-x-1"
                style={{
                  backgroundColor: themeMode === 'dark' ? colors.accent : 'transparent',
                  color: themeMode === 'dark' ? '#ffffff' : colors.textSecondary,
                  boxShadow: themeMode === 'dark' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'
                }}
              >
                <Moon size={12} />
                <span>{t('settings.dark')}</span>
              </button>
            </div>
          </div>

          {/* Regional Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide ml-1" style={{ color: colors.textTertiary }}>
              {t('settings.regional')}
            </h3>
            <div
              className="rounded-lg overflow-hidden"
              style={{ backgroundColor: colors.bgMain, border: `1px solid ${colors.borderLight}` }}
            >
              {/* Language Item */}
              <div
                className="p-3 flex items-center justify-between"
                style={{ borderBottom: `1px solid ${colors.borderLight}` }}
              >
                <div className="flex flex-col">
                  <span className="text-sm" style={{ color: colors.textPrimary }}>{t('settings.language')}</span>
                  <span className="text-xs" style={{ color: colors.textTertiary }}>{t('settings.languageDesc')}</span>
                </div>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                  className="w-32 px-2 py-1 text-xs rounded focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: colors.bgSurface,
                    border: `1px solid ${colors.border}`,
                    color: colors.textPrimary
                  }}
                >
                  <option value="en">English</option>
                  <option value="zh-CN">中文 (Chinese)</option>
                </select>
              </div>

              {/* Timezone Item */}
              <div className="p-3 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm" style={{ color: colors.textPrimary }}>{t('settings.timezone')}</span>
                  <span className="text-xs" style={{ color: colors.textTertiary }}>
                    {t('settings.timezoneDesc')}
                    {timezone === 'System' && (
                      <span style={{ color: colors.textTertiary, marginLeft: '4px' }}>
                        ({getSystemTimezoneName()}, {getSystemTimezoneAsUtcOffset()})
                      </span>
                    )}
                  </span>
                </div>
                <select
                  value={timezone}
                  onChange={(e) => handleTimezoneChange(e.target.value as TimezoneOption)}
                  className="w-40 px-2 py-1 text-xs rounded focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: colors.bgSurface,
                    border: `1px solid ${colors.border}`,
                    color: colors.textPrimary
                  }}
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {language === 'zh-CN' ? tz.labelZh : tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* General Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide ml-1" style={{ color: colors.textTertiary }}>
              {t('settings.general')}
            </h3>
            <div
              className="rounded-lg overflow-hidden"
              style={{ backgroundColor: colors.bgMain, border: `1px solid ${colors.borderLight}` }}
            >
              {/* Log Path Item */}
              <div
                className="p-3 flex items-center justify-between"
                style={{ borderBottom: `1px solid ${colors.borderLight}` }}
              >
                <div className="flex flex-col">
                  <span className="text-sm" style={{ color: colors.textPrimary }}>{t('settings.defaultLogPath')}</span>
                  <span className="text-xs" style={{ color: colors.textTertiary }}>{t('settings.defaultLogPathDesc')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div
                    className="rounded px-2 py-1 text-xs max-w-[120px] truncate cursor-default"
                    style={{
                      backgroundColor: colors.bgSurface,
                      border: `1px solid ${colors.border}`,
                      color: colors.textSecondary
                    }}
                    title={logPath}
                  >
                    {logPath}
                  </div>
                  <button
                    onClick={handleBrowsePath}
                    className="p-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ color: colors.textSecondary }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = colors.bgHover;
                      e.currentTarget.style.color = colors.textPrimary;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = colors.textSecondary;
                    }}
                    title={t('settings.browseFolderTitle')}
                    disabled={isBrowsing}
                  >
                    <Folder size={16} />
                  </button>
                </div>
              </div>

              {/* Max Log Lines Item */}
              <div
                className="p-3 flex items-center justify-between"
                style={{ borderBottom: `1px solid ${colors.borderLight}` }}
              >
                <div className="flex flex-col">
                  <span className="text-sm" style={{ color: colors.textPrimary }}>{t('settings.maxLogLines')}</span>
                  <span className="text-xs" style={{ color: colors.textTertiary }}>{t('settings.maxLogLinesDesc')}</span>
                </div>
                <input
                  type="number"
                  min="1000"
                  max="100000"
                  step="1000"
                  value={maxLogLines}
                  onChange={(e) => handleMaxLogLinesChange(parseInt(e.target.value, 10) || 1000)}
                  className="w-24 px-2 py-1 text-xs rounded text-right focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: colors.bgSurface,
                    border: `1px solid ${colors.border}`,
                    color: colors.textPrimary
                  }}
                />
              </div>

              {/* Text Encoding Item */}
              <div
                className="p-3 flex items-center justify-between"
                style={{ borderBottom: `1px solid ${colors.borderLight}` }}
              >
                <div className="flex flex-col">
                  <span className="text-sm" style={{ color: colors.textPrimary }}>{t('settings.textEncoding')}</span>
                  <span className="text-xs" style={{ color: colors.textTertiary }}>{t('settings.textEncodingDesc')}</span>
                </div>
                <select
                  value={textEncoding}
                  onChange={(e) => handleTextEncodingChange(e.target.value as TextEncoding)}
                  className="w-24 px-2 py-1 text-xs rounded focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: colors.bgSurface,
                    border: `1px solid ${colors.border}`,
                    color: colors.textPrimary
                  }}
                >
                  <option value="utf-8">UTF-8</option>
                  <option value="gbk">GBK</option>
                </select>
              </div>

              {/* Special Character Conversion Item */}
              <div
                style={{ borderBottom: `1px solid ${colors.borderLight}` }}
              >
                <div className="p-3 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm" style={{ color: colors.textPrimary }}>{t('settings.convertSpecialChars')}</span>
                    <span className="text-xs" style={{ color: colors.textTertiary }}>{t('settings.convertSpecialCharsDesc')}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <ToggleSwitch
                      checked={specialCharConfig.enabled}
                      onChange={(enabled) => handleSpecialCharConfigChange({ enabled })}
                      title={t('settings.convertSpecialChars')}
                    />
                    {specialCharConfig.enabled && (
                      <button
                        onClick={() => setSpecialCharExpanded(!specialCharExpanded)}
                        className="p-1 rounded transition-colors"
                        style={{ color: colors.textSecondary }}
                        title={specialCharExpanded ? t('settings.collapseOptions') : t('settings.expandOptions')}
                      >
                        {specialCharExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-options for special character conversion */}
                {specialCharConfig.enabled && specialCharExpanded && (
                  <div

                    className="px-3 pt-2 pb-3 grid grid-cols-2 gap-2"
                    style={{ backgroundColor: colors.bgSurface }}
                  >
                    {[
                      { key: 'convertLF', label: '\\n → ␊', descKey: 'settings.lineFeed' },
                      { key: 'convertCR', label: '\\r → ␍', descKey: 'settings.carriageReturn' },
                      { key: 'convertTab', label: '\\t → ␉', descKey: 'settings.tab' },
                      { key: 'convertNull', label: '\\0 → ␀', descKey: 'settings.null' },
                      { key: 'convertEsc', label: 'ESC → ␛', descKey: 'settings.escape' },
                      { key: 'convertSpaces', label: 'Spaces → ␣', descKey: 'settings.trailingMultiple' },
                    ].map(({ key, label, descKey }) => (
                      <label
                        key={key}
                        className="flex items-center space-x-2 p-1.5 rounded cursor-pointer transition-colors"
                        style={{ backgroundColor: 'transparent' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <input
                          type="checkbox"
                          checked={specialCharConfig[key as keyof SpecialCharConfig] as boolean}
                          onChange={(e) => handleSpecialCharConfigChange({ [key]: e.target.checked })}
                          className="w-3.5 h-3.5 rounded"
                          style={{ accentColor: colors.accent }}
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-mono" style={{ color: colors.textPrimary }}>{label}</span>
                          <span className="text-[10px]" style={{ color: colors.textTertiary }}>{t(descKey)}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Frame Segmentation Item */}
              <div
                style={{ borderBottom: `1px solid ${colors.borderLight}` }}
              >
                <div className="p-3 flex flex-col space-y-3">
                  <div className="flex flex-col">
                    <span className="text-sm" style={{ color: colors.textPrimary }}>{t('settings.frameSegmentation')}</span>
                    <span className="text-xs" style={{ color: colors.textTertiary }}>{t('settings.frameSegmentationDesc')}</span>
                  </div>

                  {/* Mode selector */}
                  <div className="flex items-center space-x-2">
                    <span className="text-xs w-14" style={{ color: colors.textSecondary }}>{t('settings.mode')}:</span>
                    <div
                      className="flex rounded-md overflow-hidden flex-1"
                      style={{ border: `1px solid ${colors.borderLight}` }}
                    >
                      {(['Timeout', 'Delimiter', 'Combined'] as FrameSegmentationMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => handleModeChange(mode)}
                          className="flex-1 py-1 text-xs font-medium transition-colors"
                          style={{
                            backgroundColor: frameSegmentationConfig.mode === mode ? colors.accent : colors.bgSurface,
                            color: frameSegmentationConfig.mode === mode ? '#ffffff' : colors.textSecondary,
                          }}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Timeout setting - show for Timeout and Combined modes */}
                  {(frameSegmentationConfig.mode === 'Timeout' || frameSegmentationConfig.mode === 'Combined') && (
                    <div className="flex items-center space-x-2">
                      <span className="text-xs w-14" style={{ color: colors.textSecondary }}>Timeout:</span>
                      <input
                        type="number"
                        min="10"
                        max="1000"
                        step="10"
                        value={frameSegmentationConfig.timeout_ms}
                        onChange={(e) => handleTimeoutChange(parseInt(e.target.value, 10) || 10)}
                        className="w-20 px-2 py-1 text-xs rounded text-right focus:outline-none focus:ring-1"
                        style={{
                          backgroundColor: colors.bgSurface,
                          border: `1px solid ${colors.border}`,
                          color: colors.textPrimary
                        }}
                      />
                      <span className="text-xs" style={{ color: colors.textTertiary }}>ms (10-1000)</span>
                    </div>
                  )}

                  {/* Delimiter setting - show for Delimiter and Combined modes */}
                  {(frameSegmentationConfig.mode === 'Delimiter' || frameSegmentationConfig.mode === 'Combined') && (
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs w-14" style={{ color: colors.textSecondary }}>{t('settings.delimiterLabel')}:</span>
                        <select
                          value={getDelimiterType(frameSegmentationConfig.delimiter)}
                          onChange={(e) => handleDelimiterTypeChange(e.target.value as 'AnyNewline' | 'CR' | 'LF' | 'CRLF' | 'Custom')}
                          className="flex-1 px-2 py-1 text-xs rounded focus:outline-none focus:ring-1"
                          style={{
                            backgroundColor: colors.bgSurface,
                            border: `1px solid ${colors.border}`,
                            color: colors.textPrimary
                          }}
                        >
                          <option value="AnyNewline">{t('settings.anyNewline')} (\r, \n, \r\n)</option>
                          <option value="CR">CR (\r, 0x0D)</option>
                          <option value="LF">LF (\n, 0x0A)</option>
                          <option value="CRLF">CRLF (\r\n, 0x0D 0x0A)</option>
                          <option value="Custom">{t('settings.custom')}</option>
                        </select>
                      </div>

                      {/* Custom delimiter input */}
                      {getDelimiterType(frameSegmentationConfig.delimiter) === 'Custom' && (
                        <div className="flex items-center space-x-2 ml-16">
                          <input
                            type="text"
                            value={customDelimiterHex}
                            onChange={(e) => handleCustomDelimiterChange(e.target.value)}
                            placeholder="e.g., 0D 0A or 1B5D"
                            className="flex-1 px-2 py-1 text-xs font-mono rounded focus:outline-none focus:ring-1"
                            style={{
                              backgroundColor: colors.bgSurface,
                              border: `1px solid ${customDelimiterError ? '#ef4444' : colors.border}`,
                              color: colors.textPrimary
                            }}
                          />
                          {customDelimiterError && (
                            <span className="text-xs text-red-500">{customDelimiterError === 'Invalid hex format' ? t('settings.invalidHex') : t('settings.delimiterEmpty')}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* About Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide ml-1" style={{ color: colors.textTertiary }}>
              {t('settings.about')}
            </h3>
            <div
              className="rounded-lg p-4 flex items-center justify-between"
              style={{ backgroundColor: colors.bgMain, border: `1px solid ${colors.borderLight}` }}
            >
              <div>
                <div className="font-medium text-sm" style={{ color: colors.textPrimary }}>{t('app.title')}</div>
                <div className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>{t('settings.version')} 1.2.0 (Build 20251206)</div>
              </div>
              <button
                onClick={handleCheckUpdates}
                className="px-3 py-1 rounded-md text-xs transition-colors"
                style={{
                  backgroundColor: colors.buttonSecondaryBg,
                  border: `1px solid ${colors.borderLight}`,
                  color: colors.textPrimary
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.buttonSecondaryHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = colors.buttonSecondaryBg}
              >
                {t('settings.checkForUpdates')}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
