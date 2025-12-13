import React, { useState, useEffect } from 'react';
import { Folder, Moon, Sun, ChevronDown, ChevronUp, Loader2, ExternalLink, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage, Language } from '../i18n';
import { TextEncoding, SpecialCharConfig, FrameSegmentationConfig, FrameSegmentationMode, FrameDelimiter, TimezoneOption } from '../types';
import { TIMEZONE_OPTIONS, loadTimezone, saveTimezone, getSystemTimezoneAsUtcOffset, getSystemTimezoneName, getSystemTimezoneOffset, parseUtcOffset } from '../utils/timezone';

// shadcn components
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

// Update check types
interface UpdateCheckResult {
  has_update: boolean;
  current_version: string;
  latest_version: string;
  download_url: string | null;
  download_size: number | null;
  release_url: string;
  asset_name: string | null;
}

interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

// Format bytes to human-readable size
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onOpenChange }) => {
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

  // Update checker state
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [installerPath, setInstallerPath] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

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
      ? Math.round(getSystemTimezoneOffset() * 60)
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
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Log Save Location',
      });

      if (selected && typeof selected === 'string') {
        handleLogPathChange(selected);
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    } finally {
      setIsBrowsing(false);
    }
  };

  // Check for updates
  const handleCheckUpdates = async () => {
    setUpdateState('checking');
    setUpdateError(null);

    try {
      const result = await invoke<UpdateCheckResult>('check_for_updates');
      setUpdateInfo(result);

      if (result.has_update) {
        if (!result.download_url || !result.asset_name) {
          setUpdateState('error');
          setUpdateError(t('settings.noExeFound'));
        } else {
          setUpdateState('available');
        }
      } else {
        setUpdateState('idle');
        setUpdateError(t('settings.upToDate'));
        setTimeout(() => setUpdateError(null), 3000);
      }
    } catch (error) {
      setUpdateState('error');
      const errorMsg = String(error);
      if (errorMsg.includes('Network') || errorMsg.includes('network')) {
        setUpdateError(t('settings.networkError'));
      } else if (errorMsg.includes('No releases')) {
        setUpdateError(t('settings.noReleases'));
      } else {
        setUpdateError(errorMsg);
      }
    }
  };

  // Download update
  const handleDownloadUpdate = async () => {
    if (!updateInfo?.download_url || !updateInfo?.asset_name) return;

    setUpdateState('downloading');
    setDownloadProgress(0);
    setUpdateError(null);

    const unlisten = await listen<DownloadProgress>('update-download-progress', (event) => {
      setDownloadProgress(event.payload.percentage);
    });

    try {
      const path = await invoke<string>('download_update', {
        downloadUrl: updateInfo.download_url,
        assetName: updateInfo.asset_name,
      });
      setInstallerPath(path);
      setUpdateState('ready');
    } catch (error) {
      setUpdateState('error');
      setUpdateError(t('settings.downloadError') + ': ' + String(error));
    } finally {
      unlisten();
    }
  };

  // Launch installer and exit
  const handleInstall = async () => {
    if (!installerPath) return;

    try {
      await invoke('launch_installer_and_exit', { installerPath });
    } catch (error) {
      setUpdateState('error');
      setUpdateError(t('settings.installError') + ': ' + String(error) + '\n' + installerPath);
    }
  };

  // Reset update state
  const handleCancelUpdate = () => {
    setUpdateState('idle');
    setUpdateInfo(null);
    setDownloadProgress(0);
    setInstallerPath(null);
    setUpdateError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[500px] max-h-[80vh] overflow-hidden flex flex-col p-0" style={{ backgroundColor: colors.bgSidebar }}>
        <DialogHeader className="px-4 py-3 border-b" style={{ backgroundColor: colors.bgHeader, borderColor: colors.borderDark }}>
          <DialogTitle className="text-sm font-semibold" style={{ color: colors.textPrimary }}>
            {t('settings.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-6 overflow-y-auto flex-1">
          {/* Appearance Section */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide ml-1" style={{ color: colors.textTertiary }}>
              {t('settings.appearance')}
            </Label>
            <Card className="p-1" style={{ backgroundColor: colors.bgMain, borderColor: colors.borderLight }}>
              <div className="flex">
                <Button
                  variant={themeMode === 'light' ? 'default' : 'ghost'}
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={() => setThemeMode('light')}
                >
                  <Sun size={12} />
                  <span>{t('settings.light')}</span>
                </Button>
                <Button
                  variant={themeMode === 'dark' ? 'default' : 'ghost'}
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={() => setThemeMode('dark')}
                >
                  <Moon size={12} />
                  <span>{t('settings.dark')}</span>
                </Button>
              </div>
            </Card>
          </div>

          {/* Regional Section */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide ml-1" style={{ color: colors.textTertiary }}>
              {t('settings.regional')}
            </Label>
            <Card style={{ backgroundColor: colors.bgMain, borderColor: colors.borderLight }}>
              <CardContent className="p-0">
                {/* Language Item */}
                <div className="p-3 flex items-center justify-between border-b" style={{ borderColor: colors.borderLight }}>
                  <div className="flex flex-col">
                    <span className="text-sm" style={{ color: colors.textPrimary }}>{t('settings.language')}</span>
                    <span className="text-xs" style={{ color: colors.textTertiary }}>{t('settings.languageDesc')}</span>
                  </div>
                  <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="zh-CN">中文 (Chinese)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Timezone Item */}
                <div className="p-3 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm" style={{ color: colors.textPrimary }}>{t('settings.timezone')}</span>
                    <span className="text-xs" style={{ color: colors.textTertiary }}>
                      {t('settings.timezoneDesc')}
                      {timezone === 'System' && (
                        <span className="ml-1">({getSystemTimezoneName()}, {getSystemTimezoneAsUtcOffset()})</span>
                      )}
                    </span>
                  </div>
                  <Select value={timezone} onValueChange={(v) => handleTimezoneChange(v as TimezoneOption)}>
                    <SelectTrigger className="w-40 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {language === 'zh-CN' ? tz.labelZh : tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* General Section */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide ml-1" style={{ color: colors.textTertiary }}>
              {t('settings.general')}
            </Label>
            <Card style={{ backgroundColor: colors.bgMain, borderColor: colors.borderLight }}>
              <CardContent className="p-0">
                {/* Log Path Item */}
                <div className="p-3 flex items-center justify-between border-b" style={{ borderColor: colors.borderLight }}>
                  <div className="flex flex-col">
                    <span className="text-sm" style={{ color: colors.textPrimary }}>{t('settings.defaultLogPath')}</span>
                    <span className="text-xs" style={{ color: colors.textTertiary }}>{t('settings.defaultLogPathDesc')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="rounded px-2 py-1 text-xs max-w-[120px] truncate border cursor-default" style={{ backgroundColor: colors.bgSurface, borderColor: colors.border, color: colors.textSecondary }}>
                            {logPath}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{logPath}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={handleBrowsePath}
                            disabled={isBrowsing}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md border transition-colors hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                            style={{ borderColor: colors.border, backgroundColor: colors.bgInput }}
                          >
                            <Folder size={16} style={{ color: colors.textSecondary }} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('settings.browseFolderTitle')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {/* Max Log Lines Item */}
                <div className="p-3 flex items-center justify-between border-b" style={{ borderColor: colors.borderLight }}>
                  <div className="flex flex-col">
                    <span className="text-sm" style={{ color: colors.textPrimary }}>{t('settings.maxLogLines')}</span>
                    <span className="text-xs" style={{ color: colors.textTertiary }}>{t('settings.maxLogLinesDesc')}</span>
                  </div>
                  <Input
                    type="number"
                    min="1000"
                    max="100000"
                    step="1000"
                    value={maxLogLines}
                    onChange={(e) => handleMaxLogLinesChange(parseInt(e.target.value, 10) || 1000)}
                    className="w-24 h-8 text-xs text-right"
                  />
                </div>

                {/* Text Encoding Item */}
                <div className="p-3 flex items-center justify-between border-b" style={{ borderColor: colors.borderLight }}>
                  <div className="flex flex-col">
                    <span className="text-sm" style={{ color: colors.textPrimary }}>{t('settings.textEncoding')}</span>
                    <span className="text-xs" style={{ color: colors.textTertiary }}>{t('settings.textEncodingDesc')}</span>
                  </div>
                  <Select value={textEncoding} onValueChange={(v) => handleTextEncodingChange(v as TextEncoding)}>
                    <SelectTrigger className="w-24 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utf-8">UTF-8</SelectItem>
                      <SelectItem value="gbk">GBK</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Special Character Conversion Item */}
                <div className="border-b" style={{ borderColor: colors.borderLight }}>
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm" style={{ color: colors.textPrimary }}>{t('settings.convertSpecialChars')}</span>
                      <span className="text-xs" style={{ color: colors.textTertiary }}>{t('settings.convertSpecialCharsDesc')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={specialCharConfig.enabled}
                        onCheckedChange={(enabled) => handleSpecialCharConfigChange({ enabled })}
                      />
                      {specialCharConfig.enabled && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSpecialCharExpanded(!specialCharExpanded)}>
                          {specialCharExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Sub-options for special character conversion */}
                  {specialCharConfig.enabled && specialCharExpanded && (
                    <div className="px-3 pt-2 pb-3 grid grid-cols-2 gap-2" style={{ backgroundColor: colors.bgSurface }}>
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
                          className="flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors hover:bg-accent"
                        >
                          <Checkbox
                            checked={specialCharConfig[key as keyof SpecialCharConfig] as boolean}
                            onCheckedChange={(checked) => handleSpecialCharConfigChange({ [key]: checked })}
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
                <div className="border-b" style={{ borderColor: colors.borderLight }}>
                  <div className="p-3 flex flex-col gap-3">
                    <div className="flex flex-col">
                      <span className="text-sm" style={{ color: colors.textPrimary }}>{t('settings.frameSegmentation')}</span>
                      <span className="text-xs" style={{ color: colors.textTertiary }}>{t('settings.frameSegmentationDesc')}</span>
                    </div>

                    {/* Mode selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs w-14" style={{ color: colors.textSecondary }}>{t('settings.mode')}:</span>
                      <div className="flex rounded-md overflow-hidden flex-1 border" style={{ borderColor: colors.borderLight }}>
                        {(['Timeout', 'Delimiter', 'Combined'] as FrameSegmentationMode[]).map((mode) => (
                          <Button
                            key={mode}
                            variant={frameSegmentationConfig.mode === mode ? 'default' : 'ghost'}
                            size="sm"
                            className="flex-1 rounded-none text-xs h-7"
                            onClick={() => handleModeChange(mode)}
                          >
                            {mode}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Timeout setting */}
                    {(frameSegmentationConfig.mode === 'Timeout' || frameSegmentationConfig.mode === 'Combined') && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs w-14" style={{ color: colors.textSecondary }}>Timeout:</span>
                        <Input
                          type="number"
                          min="10"
                          max="1000"
                          step="10"
                          value={frameSegmentationConfig.timeout_ms}
                          onChange={(e) => handleTimeoutChange(parseInt(e.target.value, 10) || 10)}
                          className="w-20 h-7 text-xs text-right"
                        />
                        <span className="text-xs" style={{ color: colors.textTertiary }}>ms (10-1000)</span>
                      </div>
                    )}

                    {/* Delimiter setting */}
                    {(frameSegmentationConfig.mode === 'Delimiter' || frameSegmentationConfig.mode === 'Combined') && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs w-14" style={{ color: colors.textSecondary }}>{t('settings.delimiterLabel')}:</span>
                          <Select
                            value={getDelimiterType(frameSegmentationConfig.delimiter)}
                            onValueChange={(v) => handleDelimiterTypeChange(v as 'AnyNewline' | 'CR' | 'LF' | 'CRLF' | 'Custom')}
                          >
                            <SelectTrigger className="flex-1 h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AnyNewline">{t('settings.anyNewline')} (\r, \n, \r\n)</SelectItem>
                              <SelectItem value="CR">CR (\r, 0x0D)</SelectItem>
                              <SelectItem value="LF">LF (\n, 0x0A)</SelectItem>
                              <SelectItem value="CRLF">CRLF (\r\n, 0x0D 0x0A)</SelectItem>
                              <SelectItem value="Custom">{t('settings.custom')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Custom delimiter input */}
                        {getDelimiterType(frameSegmentationConfig.delimiter) === 'Custom' && (
                          <div className="flex items-center gap-2 ml-16">
                            <Input
                              type="text"
                              value={customDelimiterHex}
                              onChange={(e) => handleCustomDelimiterChange(e.target.value)}
                              placeholder="e.g., 0D 0A or 1B5D"
                              className={`flex-1 h-7 text-xs font-mono ${customDelimiterError ? 'border-destructive' : ''}`}
                            />
                            {customDelimiterError && (
                              <span className="text-xs text-destructive">
                                {customDelimiterError === 'Invalid hex format' ? t('settings.invalidHex') : t('settings.delimiterEmpty')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* About Section */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide ml-1" style={{ color: colors.textTertiary }}>
              {t('settings.about')}
            </Label>
            <Card style={{ backgroundColor: colors.bgMain, borderColor: colors.borderLight }}>
              <CardContent className="p-0">
                {/* App Info Row */}
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm" style={{ color: colors.textPrimary }}>{t('app.title')}</div>
                    <div className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>{t('settings.version')} 1.2.1 (Build 20251213)</div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCheckUpdates}
                    disabled={updateState === 'checking' || updateState === 'downloading'}
                  >
                    {updateState === 'checking' ? (
                      <>
                        <Loader2 size={12} className="animate-spin mr-1.5" />
                        <span>{t('settings.checking')}</span>
                      </>
                    ) : (
                      <span>{t('settings.checkForUpdates')}</span>
                    )}
                  </Button>
                </div>

                {/* Update Available State */}
                {updateState === 'available' && updateInfo && (
                  <div className="p-4 border-t space-y-3" style={{ borderColor: colors.borderLight, backgroundColor: colors.bgSurface }}>
                    <div className="flex items-start gap-2">
                      <Download size={16} className="mt-0.5 flex-shrink-0 text-primary" />
                      <div className="flex-1">
                        <div className="font-medium text-sm" style={{ color: colors.textPrimary }}>
                          {t('settings.updateAvailable')}
                        </div>
                        <div className="text-xs mt-1 space-y-0.5" style={{ color: colors.textSecondary }}>
                          <div>{t('settings.currentVersion')}: {updateInfo.current_version}</div>
                          <div>{t('settings.latestVersion')}: {updateInfo.latest_version}</div>
                          {updateInfo.download_size && (
                            <div>{t('settings.downloadSize')}: {formatBytes(updateInfo.download_size)}</div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button className="flex-1" size="sm" onClick={handleDownloadUpdate}>
                        {t('settings.downloadAndInstall')}
                      </Button>
                      <Button variant="secondary" size="sm" asChild>
                        <a href={updateInfo.release_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                          <ExternalLink size={12} />
                          <span>{t('settings.viewReleaseNotes')}</span>
                        </a>
                      </Button>
                      <Button variant="secondary" size="sm" onClick={handleCancelUpdate}>
                        {t('settings.cancel')}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Downloading State */}
                {updateState === 'downloading' && (
                  <div className="p-4 border-t space-y-3" style={{ borderColor: colors.borderLight, backgroundColor: colors.bgSurface }}>
                    <div className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin text-primary" />
                      <span className="text-sm" style={{ color: colors.textPrimary }}>
                        {t('settings.downloading')} {downloadProgress}%
                      </span>
                    </div>
                    <Progress value={downloadProgress} className="h-2" />
                  </div>
                )}

                {/* Ready to Install State */}
                {updateState === 'ready' && (
                  <div className="p-4 border-t space-y-3" style={{ borderColor: colors.borderLight, backgroundColor: colors.bgSurface }}>
                    <div className="flex items-start gap-2">
                      <CheckCircle size={16} className="mt-0.5 flex-shrink-0 text-green-500" />
                      <div className="flex-1">
                        <div className="font-medium text-sm" style={{ color: colors.textPrimary }}>
                          {t('settings.readyToInstall')}
                        </div>
                        <div className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                          {t('settings.readyToInstallDesc')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button className="flex-1 bg-green-500 hover:bg-green-600" size="sm" onClick={handleInstall}>
                        {t('settings.closeAndInstall')}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={handleCancelUpdate}>
                        {t('settings.cancel')}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Error State */}
                {updateState === 'error' && updateError && (
                  <div className="p-4 border-t space-y-3" style={{ borderColor: colors.borderLight, backgroundColor: colors.bgSurface }}>
                    <div className="flex items-start gap-2">
                      <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-destructive" />
                      <div className="flex-1">
                        <div className="font-medium text-sm text-destructive">
                          {t('settings.updateError')}
                        </div>
                        <div className="text-xs mt-1 whitespace-pre-wrap" style={{ color: colors.textSecondary }}>
                          {updateError}
                        </div>
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={handleCancelUpdate}>
                      {t('settings.cancel')}
                    </Button>
                  </div>
                )}

                {/* Up to date message (shown briefly) */}
                {updateState === 'idle' && updateError === t('settings.upToDate') && (
                  <div className="p-3 border-t flex items-center gap-2" style={{ borderColor: colors.borderLight, backgroundColor: colors.bgSurface }}>
                    <CheckCircle size={14} className="text-green-500" />
                    <span className="text-xs" style={{ color: colors.textSecondary }}>
                      {t('settings.upToDate')}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
