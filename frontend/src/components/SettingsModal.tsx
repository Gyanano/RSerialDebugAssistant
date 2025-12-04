import React, { useState, useEffect } from 'react';
import { X, Folder, Moon, Sun } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import ToggleSwitch from './ToggleSwitch';
import { useTheme } from '../contexts/ThemeContext';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { themeMode, setThemeMode, colors } = useTheme();
  const [logPath, setLogPath] = useState('~/Documents/SerialLogs');
  const [soundEffects, setSoundEffects] = useState(false);
  const [maxLogLines, setMaxLogLines] = useState(1000);
  const [isBrowsing, setIsBrowsing] = useState(false);

  // Load saved settings from localStorage on component mount
  useEffect(() => {
    const savedLogPath = localStorage.getItem('serialDebug_logPath');
    const savedSoundEffects = localStorage.getItem('serialDebug_soundEffects');
    const savedMaxLogLines = localStorage.getItem('serialDebug_maxLogLines');

    if (savedLogPath) {
      setLogPath(savedLogPath);
    }
    if (savedSoundEffects) {
      setSoundEffects(JSON.parse(savedSoundEffects));
    }
    if (savedMaxLogLines) {
      setMaxLogLines(parseInt(savedMaxLogLines, 10));
    }
  }, []);

  // Save log path to localStorage whenever it changes
  const handleLogPathChange = (path: string) => {
    setLogPath(path);
    localStorage.setItem('serialDebug_logPath', path);
  };

  // Save sound effects to localStorage whenever it changes
  const handleSoundEffectsChange = (enabled: boolean) => {
    setSoundEffects(enabled);
    localStorage.setItem('serialDebug_soundEffects', JSON.stringify(enabled));
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
        className="w-[500px] rounded-xl shadow-macos-window flex flex-col overflow-hidden transform transition-all duration-200"
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
          <span className="font-semibold text-sm" style={{ color: colors.textPrimary }}>Settings</span>
          <button
            onClick={onClose}
            className="transition-colors focus:outline-none"
            style={{ color: colors.textSecondary }}
            onMouseEnter={(e) => e.currentTarget.style.color = colors.textPrimary}
            onMouseLeave={(e) => e.currentTarget.style.color = colors.textSecondary}
            title="Close settings"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-6 overflow-y-auto">

          {/* Appearance Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide ml-1" style={{ color: colors.textTertiary }}>
              Appearance
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
                <span>Light</span>
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
                <span>Dark</span>
              </button>
            </div>
          </div>

          {/* General Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide ml-1" style={{ color: colors.textTertiary }}>
              General
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
                  <span className="text-sm" style={{ color: colors.textPrimary }}>Default Log Path</span>
                  <span className="text-xs" style={{ color: colors.textTertiary }}>Where logs are automatically saved</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div
                    className="rounded px-2 py-1 text-xs max-w-[120px] truncate"
                    style={{
                      backgroundColor: colors.bgSurface,
                      border: `1px solid ${colors.border}`,
                      color: colors.textSecondary
                    }}
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
                    title="Browse folder"
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
                  <span className="text-sm" style={{ color: colors.textPrimary }}>Maximum Log Lines</span>
                  <span className="text-xs" style={{ color: colors.textTertiary }}>Number of log entries to display (100-10000)</span>
                </div>
                <input
                  type="number"
                  min="100"
                  max="10000"
                  step="100"
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

              {/* Sound Effects Item */}
              <div className="p-3 flex items-center justify-between">
                <span className="text-sm" style={{ color: colors.textPrimary }}>Sound Effects</span>
                <ToggleSwitch
                  checked={soundEffects}
                  onChange={handleSoundEffectsChange}
                  disabled={isBrowsing}
                  title="Toggle sound effects"
                />
              </div>
            </div>
          </div>

          {/* About Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide ml-1" style={{ color: colors.textTertiary }}>
              About
            </h3>
            <div
              className="rounded-lg p-4 flex items-center justify-between"
              style={{ backgroundColor: colors.bgMain, border: `1px solid ${colors.borderLight}` }}
            >
              <div>
                <div className="font-medium text-sm" style={{ color: colors.textPrimary }}>Serial Debug Assistant</div>
                <div className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>Version 1.0.1 (Build 20241129)</div>
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
                Check for Updates
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
