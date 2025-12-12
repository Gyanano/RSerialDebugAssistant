import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings, PanelLeftClose, PanelLeft } from 'lucide-react';
import PortSelector from './components/PortSelector';
import ConfigPanel from './components/ConfigPanel';
import LogViewer from './components/LogViewer';
import SendPanel, { SEND_PANEL_MIN_HEIGHTS } from './components/SendPanel';
import StatusBar from './components/StatusBar';
import SettingsModal from './components/SettingsModal';
import { SerialPortInfo, SerialConfig, LogEntry, ConnectionStatus, DataFormat, ChecksumConfig, QuickCommandList, QuickCommand, LineEnding, TextEncoding, FrameSegmentationConfig } from './types';
import { useTheme } from './contexts/ThemeContext';
import { useTranslation } from './i18n';
import { appendChecksum } from './utils/checksum';
import { loadTimezone, formatDateForFilename, getSystemTimezoneOffset, parseUtcOffset } from './utils/timezone';

const QUICK_COMMANDS_STORAGE_KEY = 'serial-debug-quick-commands';
const STORAGE_KEY_TEXT_ENCODING = 'serialDebug_textEncoding';
const STORAGE_KEY_SIDEBAR_WIDTH = 'serialDebug_sidebarWidth';
const STORAGE_KEY_SIDEBAR_COLLAPSED = 'serialDebug_sidebarCollapsed';
const STORAGE_KEY_LOG_VIEWER_HEIGHT = 'serialDebug_logViewerHeight';
const STORAGE_KEY_FRAME_SEGMENTATION = 'serialDebug_frameSegmentation';
const INITIAL_COMMANDS = 20;

// Layout constants
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 200;
const COLLAPSED_SIDEBAR_WIDTH = 48;
const AUTO_COLLAPSE_THRESHOLD = 640;
const MIN_LOG_VIEWER_HEIGHT = 150;
const DEFAULT_SEND_PANEL_MIN_HEIGHT = SEND_PANEL_MIN_HEIGHTS.normalText;
const DEFAULT_LOG_VIEWER_RATIO = 0.65;

const createEmptyCommand = (): QuickCommand => ({
  id: crypto.randomUUID(),
  name: '',
  selected: false,
  isHex: false,
  content: '',
  lineEnding: 'None',
});

const createDefaultList = (): QuickCommandList => ({
  id: crypto.randomUUID(),
  name: 'Default',
  commands: Array.from({ length: INITIAL_COMMANDS }, createEmptyCommand),
});

const loadQuickCommandsFromStorage = (): { lists: QuickCommandList[]; currentListId: string } => {
  try {
    const stored = localStorage.getItem(QUICK_COMMANDS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.lists && parsed.lists.length > 0) {
        // Ensure backward compatibility: add missing 'name' field to commands
        const migratedLists = parsed.lists.map((list: QuickCommandList) => ({
          ...list,
          commands: list.commands.map((cmd: QuickCommand) => ({
            ...cmd,
            name: cmd.name ?? '',  // Default to empty string if name doesn't exist
          })),
        }));
        return { lists: migratedLists, currentListId: parsed.currentListId };
      }
    }
  } catch (e) {
    console.error('Failed to load quick commands from storage:', e);
  }
  const defaultList = createDefaultList();
  return { lists: [defaultList], currentListId: defaultList.id };
};

const saveQuickCommandsToStorage = (lists: QuickCommandList[], currentListId: string) => {
  try {
    localStorage.setItem(QUICK_COMMANDS_STORAGE_KEY, JSON.stringify({ lists, currentListId }));
  } catch (e) {
    console.error('Failed to save quick commands to storage:', e);
  }
};

const getTextEncoding = (): TextEncoding => {
  const saved = localStorage.getItem(STORAGE_KEY_TEXT_ENCODING);
  return (saved === 'utf-8' || saved === 'gbk') ? saved : 'utf-8';
};

// Layout persistence helpers
const getSavedSidebarWidth = (): number => {
  const saved = localStorage.getItem(STORAGE_KEY_SIDEBAR_WIDTH);
  if (saved) {
    const width = parseInt(saved, 10);
    if (!isNaN(width) && width >= MIN_SIDEBAR_WIDTH) {
      return width;
    }
  }
  return DEFAULT_SIDEBAR_WIDTH;
};

const getSavedSidebarCollapsed = (): boolean => {
  return localStorage.getItem(STORAGE_KEY_SIDEBAR_COLLAPSED) === 'true';
};

const getSavedLogViewerHeight = (): number | null => {
  const saved = localStorage.getItem(STORAGE_KEY_LOG_VIEWER_HEIGHT);
  if (saved) {
    const height = parseInt(saved, 10);
    if (!isNaN(height) && height >= MIN_LOG_VIEWER_HEIGHT) {
      return height;
    }
  }
  return null;
};

function App() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<SerialConfig>({
    baud_rate: 115200,
    data_bits: 'Eight',
    parity: 'None',
    stop_bits: 'One',
    flow_control: 'None',
    timeout: 1000,
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    is_connected: false,
    port_name: null,
    config: null,
    bytes_sent: 0,
    bytes_received: 0,
    connection_time: null,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sendText, setSendText] = useState('');
  const [sendFormat, setSendFormat] = useState<DataFormat>('Text');
  const [checksumConfig, setChecksumConfig] = useState<ChecksumConfig>({
    type: 'None',
    startIndex: 0,   // 0 = first byte
    endIndex: -1,    // -1 = last byte (include all)
  });
  const [isLoading, setIsLoading] = useState(false);
  const [userHasSelectedPort, setUserHasSelectedPort] = useState(false);

  // Layout state
  const [sidebarWidth, setSidebarWidth] = useState<number>(getSavedSidebarWidth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(getSavedSidebarCollapsed);
  const [logViewerHeight, setLogViewerHeight] = useState<number | null>(getSavedLogViewerHeight);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingVertical, setIsResizingVertical] = useState(false);
  const [wasAutoCollapsed, setWasAutoCollapsed] = useState(false);
  const [sendPanelMinHeight, setSendPanelMinHeight] = useState<number>(DEFAULT_SEND_PANEL_MIN_HEIGHT);

  // Refs for resize handling
  const mainContentRef = useRef<HTMLDivElement>(null);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const verticalResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Quick Command Lists state
  const [quickCommandLists, setQuickCommandLists] = useState<QuickCommandList[]>(() => {
    const { lists } = loadQuickCommandsFromStorage();
    return lists;
  });
  const [currentQuickCommandListId, setCurrentQuickCommandListId] = useState<string>(() => {
    const { currentListId } = loadQuickCommandsFromStorage();
    return currentListId;
  });

  // 使用useRef来保存最新的状态值，避免闭包陷阱
  const selectedPortRef = useRef(selectedPort);
  const userHasSelectedPortRef = useRef(userHasSelectedPort);

  // 更新ref值
  useEffect(() => {
    selectedPortRef.current = selectedPort;
  }, [selectedPort]);

  useEffect(() => {
    userHasSelectedPortRef.current = userHasSelectedPort;
  }, [userHasSelectedPort]);

  // Persist quick commands to localStorage
  useEffect(() => {
    saveQuickCommandsToStorage(quickCommandLists, currentQuickCommandListId);
  }, [quickCommandLists, currentQuickCommandListId]);

  // Persist layout settings to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SIDEBAR_WIDTH, sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SIDEBAR_COLLAPSED, sidebarCollapsed.toString());
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (logViewerHeight !== null) {
      localStorage.setItem(STORAGE_KEY_LOG_VIEWER_HEIGHT, logViewerHeight.toString());
    }
  }, [logViewerHeight]);

  // Adjust log viewer height when send panel min height changes
  useEffect(() => {
    if (!mainContentRef.current || logViewerHeight === null) return;

    const mainContentRect = mainContentRef.current.getBoundingClientRect();
    const maxLogViewerHeight = mainContentRect.height - sendPanelMinHeight;

    if (logViewerHeight > maxLogViewerHeight) {
      setLogViewerHeight(Math.max(MIN_LOG_VIEWER_HEIGHT, maxLogViewerHeight));
    }
  }, [sendPanelMinHeight, logViewerHeight]);

  // Window resize handler for auto-collapse
  useEffect(() => {
    const handleWindowResize = () => {
      const windowWidth = window.innerWidth;
      if (windowWidth < AUTO_COLLAPSE_THRESHOLD && !sidebarCollapsed) {
        setSidebarCollapsed(true);
        setWasAutoCollapsed(true);
      } else if (windowWidth >= AUTO_COLLAPSE_THRESHOLD && wasAutoCollapsed && sidebarCollapsed) {
        setSidebarCollapsed(false);
        setWasAutoCollapsed(false);
      }
    };

    window.addEventListener('resize', handleWindowResize);
    // Check on mount
    handleWindowResize();

    return () => window.removeEventListener('resize', handleWindowResize);
  }, [sidebarCollapsed, wasAutoCollapsed]);

  // Sidebar resize handlers
  const handleSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
    sidebarResizeRef.current = {
      startX: e.clientX,
      startWidth: sidebarWidth,
    };
  }, [sidebarWidth]);

  const handleSidebarResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizingSidebar || !sidebarResizeRef.current) return;

    const deltaX = e.clientX - sidebarResizeRef.current.startX;
    const newWidth = sidebarResizeRef.current.startWidth + deltaX;
    const maxWidth = window.innerWidth * 0.5;
    const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxWidth, newWidth));
    setSidebarWidth(clampedWidth);
  }, [isResizingSidebar]);

  const handleSidebarResizeEnd = useCallback(() => {
    setIsResizingSidebar(false);
    sidebarResizeRef.current = null;
  }, []);

  // Vertical resize handlers (between log viewer and send panel)
  const handleVerticalResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!mainContentRef.current) return;

    setIsResizingVertical(true);
    const mainContentRect = mainContentRef.current.getBoundingClientRect();
    const currentLogHeight = logViewerHeight ?? mainContentRect.height * DEFAULT_LOG_VIEWER_RATIO;

    verticalResizeRef.current = {
      startY: e.clientY,
      startHeight: currentLogHeight,
    };
  }, [logViewerHeight]);

  const handleVerticalResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizingVertical || !verticalResizeRef.current || !mainContentRef.current) return;

    const mainContentRect = mainContentRef.current.getBoundingClientRect();
    const deltaY = e.clientY - verticalResizeRef.current.startY;
    const newHeight = verticalResizeRef.current.startHeight + deltaY;
    const maxHeight = mainContentRect.height - sendPanelMinHeight;
    const clampedHeight = Math.max(MIN_LOG_VIEWER_HEIGHT, Math.min(maxHeight, newHeight));
    setLogViewerHeight(clampedHeight);
  }, [isResizingVertical, sendPanelMinHeight]);

  const handleVerticalResizeEnd = useCallback(() => {
    setIsResizingVertical(false);
    verticalResizeRef.current = null;
  }, []);

  // Global mouse event handlers for resize operations
  useEffect(() => {
    if (isResizingSidebar) {
      document.addEventListener('mousemove', handleSidebarResizeMove);
      document.addEventListener('mouseup', handleSidebarResizeEnd);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleSidebarResizeMove);
      document.removeEventListener('mouseup', handleSidebarResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingSidebar, handleSidebarResizeMove, handleSidebarResizeEnd]);

  useEffect(() => {
    if (isResizingVertical) {
      document.addEventListener('mousemove', handleVerticalResizeMove);
      document.addEventListener('mouseup', handleVerticalResizeEnd);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleVerticalResizeMove);
      document.removeEventListener('mouseup', handleVerticalResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingVertical, handleVerticalResizeMove, handleVerticalResizeEnd]);

  // Toggle sidebar collapse
  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
    setWasAutoCollapsed(false); // User manually toggled, so reset auto-collapse tracking
  }, []);

  // Calculate effective sidebar width
  const effectiveSidebarWidth = sidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : sidebarWidth;

  // 使用useCallback确保函数能访问到最新的状态
  const loadPorts = useCallback(async () => {
    try {
      const availablePorts = await invoke<SerialPortInfo[]>('list_serial_ports');
      setPorts(availablePorts);
      
      // 使用ref获取最新的状态值
      const currentUserHasSelectedPort = userHasSelectedPortRef.current;
      const currentSelectedPort = selectedPortRef.current;
      
      // Case 1: Initial load - auto-select first port if user hasn't made any choice
      if (!currentUserHasSelectedPort && !currentSelectedPort && availablePorts.length > 0) {
        setSelectedPort(availablePorts[0].port_name);
        return;
      }
      
      // Case 2: User has made a selection - preserve it if possible
      if (currentUserHasSelectedPort && currentSelectedPort) {
        const isSelectedPortAvailable = availablePorts.some(p => p.port_name === currentSelectedPort);
        if (!isSelectedPortAvailable) {
          // Only clear if the selected port is no longer available
          setSelectedPort('');
          // Keep userHasSelectedPort as true - respect that they made a choice before
        }
        // If port is still available, do nothing - preserve user's selection
        return;
      }
      
      // Case 3: Fallback - if somehow we have a selected port but no user selection flag
      if (currentSelectedPort && !availablePorts.some(p => p.port_name === currentSelectedPort)) {
        setSelectedPort('');
      }
    } catch (error) {
      console.error('Failed to load ports:', error);
    }
  }, []); // 空依赖数组，因为我们使用ref来访问最新状态

  // Load ports on component mount
  useEffect(() => {
    loadPorts();

    // Initialize log limit from localStorage
    const initLogLimit = async () => {
      const savedMaxLogLines = localStorage.getItem('serialDebug_maxLogLines');
      if (savedMaxLogLines) {
        try {
          await invoke('set_log_limit', { limit: parseInt(savedMaxLogLines, 10) });
        } catch (error) {
          console.error('Failed to initialize log limit:', error);
        }
      }
    };
    initLogLimit();

    // Initialize frame segmentation config from localStorage
    const initFrameSegmentation = async () => {
      const savedConfig = localStorage.getItem(STORAGE_KEY_FRAME_SEGMENTATION);
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig) as FrameSegmentationConfig;
          await invoke('set_frame_segmentation', { config });
        } catch (error) {
          console.error('Failed to initialize frame segmentation:', error);
        }
      }
    };
    initFrameSegmentation();

    // Initialize timezone offset for backend recording timestamps
    const initTimezoneOffset = async () => {
      try {
        const tz = loadTimezone();
        const offsetMinutes = tz === 'System'
          ? Math.round(getSystemTimezoneOffset() * 60)  // Convert hours to minutes
          : Math.round(parseUtcOffset(tz) * 60);
        await invoke('set_timezone_offset', { offsetMinutes });
      } catch (error) {
        console.error('Failed to initialize timezone offset:', error);
      }
    };
    initTimezoneOffset();

    // Set up intervals for updating status, logs, and ports
    const statusInterval = setInterval(updateStatus, 1000);
    const logsInterval = setInterval(updateLogs, 100); // More frequent log updates
    const portsInterval = setInterval(loadPorts, 3000); // Check for new ports every 3 seconds

    return () => {
      clearInterval(statusInterval);
      clearInterval(logsInterval);
      clearInterval(portsInterval);
    };
  }, [loadPorts]); // 依赖loadPorts函数

  const handlePortSelect = (port: string) => {
    setSelectedPort(port);
    setUserHasSelectedPort(true); // Mark that user has made a manual choice
  };

  const updateStatus = async () => {
    try {
      const status = await invoke<ConnectionStatus>('get_connection_status');
      setConnectionStatus(status);
    } catch (error) {
      console.error('Failed to get status:', error);
    }
  };

  const updateLogs = async () => {
    try {
      const newLogs = await invoke<LogEntry[]>('get_logs');
      setLogs(newLogs);
    } catch (error) {
      console.error('Failed to get logs:', error);
    }
  };

  const handleConnect = async () => {
    if (!selectedPort) return;
    
    setIsLoading(true);
    try {
      await invoke('connect_to_port', {
        portName: selectedPort,
        config: config,
      });
      await updateStatus();
    } catch (error) {
      console.error('Failed to connect:', error);
      alert(`Failed to connect: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await invoke('disconnect_port');
      await updateStatus();
      // Don't clear logs - preserve message history for user review
    } catch (error) {
      console.error('Failed to disconnect:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendData = async () => {
    if (!sendText.trim() || !connectionStatus.is_connected) return;

    try {
      const textEncoding = getTextEncoding();

      // If checksum is enabled, we need to calculate and append it
      if (checksumConfig.type !== 'None') {
        // Convert input to bytes first
        let bytes: Uint8Array;
        if (sendFormat === 'Text') {
          // For checksum calculation with text, we use UTF-8 encoding in frontend
          // The actual encoding conversion happens in backend
          bytes = new TextEncoder().encode(sendText);
        } else {
          // Parse hex string
          const cleanHex = sendText.replace(/\s/g, '');
          if (cleanHex.length % 2 !== 0) {
            alert('Hex string must have even number of characters');
            return;
          }
          const byteArray: number[] = [];
          for (let i = 0; i < cleanHex.length; i += 2) {
            const byte = parseInt(cleanHex.substr(i, 2), 16);
            if (isNaN(byte)) {
              alert('Invalid hex characters');
              return;
            }
            byteArray.push(byte);
          }
          bytes = new Uint8Array(byteArray);
        }

        // Append checksum
        const bytesWithChecksum = appendChecksum(bytes, checksumConfig);

        // Convert back to hex string for sending (always send as hex when checksum is added)
        const dataToSend = Array.from(bytesWithChecksum)
          .map(b => b.toString(16).padStart(2, '0').toUpperCase())
          .join(' ');

        // Send as hex format when checksum is appended (encoding not needed for hex)
        await invoke('send_data', {
          data: dataToSend,
          format: 'Hex',
        });
      } else {
        // No checksum, send as-is with encoding
        await invoke('send_data', {
          data: sendText,
          format: sendFormat,
          encoding: sendFormat === 'Text' ? textEncoding : undefined,
        });
      }

      // Don't clear the input - keep the content for re-sending
      // Note: Logs are updated automatically via polling interval, no need to await here
    } catch (error) {
      console.error('Failed to send data:', error);
      alert(`Failed to send data: ${error}`);
    }
  };

  const handleClearLogs = async () => {
    try {
      await invoke('clear_logs');
      setLogs([]);
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  };

  const handleExportLogs = async () => {
    try {
      // Get the log directory from backend (which has the correct platform-specific path)
      const logPath = await invoke<string>('get_log_directory');

      // Format timestamp for filename using configured timezone
      const timezone = loadTimezone();
      const timestamp = formatDateForFilename(new Date(), timezone);

      // Use "noport" if no port is connected, otherwise use the selected port name
      // Sanitize port name for filename (replace special characters)
      const portName = (selectedPort || 'noport').replace(/[\/\\:*?"<>|]/g, '_');

      // Use "export_" prefix to distinguish from auto-saved files
      const filename = `export_${portName}_${timestamp}.txt`;

      // Construct full path
      const fullPath = `${logPath}/${filename}`;

      // Pass timezone offset to backend for formatting timestamps in the exported file
      await invoke('export_logs', {
        filePath: fullPath,
        format: 'Txt',
        timezoneOffsetMinutes: timezone === 'System' ? -new Date().getTimezoneOffset() : getTimezoneOffsetMinutes(timezone),
      });

      alert(`Logs exported to ${fullPath}`);
    } catch (error) {
      console.error('Failed to export logs:', error);
      alert(`Failed to export logs: ${error}`);
    }
  };

  // Helper function to convert timezone string to offset in minutes
  const getTimezoneOffsetMinutes = (timezone: string): number => {
    if (timezone === 'UTC') return 0;

    const match = timezone.match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (!match) return 0;

    const sign = match[1] === '+' ? 1 : -1;
    const hours = parseInt(match[2], 10);
    const minutes = match[3] ? parseInt(match[3], 10) : 0;

    return sign * (hours * 60 + minutes);
  };

  // Helper function to append line ending to data
  const appendLineEnding = (data: string, lineEnding: LineEnding, isHex: boolean): string => {
    if (lineEnding === 'None') return data;

    const lineEndingMap: Record<string, string> = {
      '\\r': isHex ? '0D' : '\r',
      '\\n': isHex ? '0A' : '\n',
      '\\r\\n': isHex ? '0D 0A' : '\r\n',
    };

    const ending = lineEndingMap[lineEnding];
    if (!ending) return data;

    if (isHex) {
      return data.trim() ? `${data} ${ending}` : ending;
    }
    return data + ending;
  };

  // Handler for sending a single quick command
  const handleSendQuickCommand = async (content: string, isHex: boolean, lineEnding: LineEnding) => {
    if (!content.trim() || !connectionStatus.is_connected) return;

    try {
      const dataToSend = appendLineEnding(content, lineEnding, isHex);
      const format: DataFormat = isHex ? 'Hex' : 'Text';
      const textEncoding = getTextEncoding();

      await invoke('send_data', {
        data: dataToSend,
        format: format,
        encoding: !isHex ? textEncoding : undefined,
      });

      // Note: Logs are updated automatically via polling interval
    } catch (error) {
      console.error('Failed to send quick command:', error);
      alert(`Failed to send: ${error}`);
    }
  };

  // Handler for sending all selected quick commands
  const handleSendSelectedQuickCommands = async (commands: QuickCommand[]) => {
    if (commands.length === 0 || !connectionStatus.is_connected) return;

    try {
      const textEncoding = getTextEncoding();

      for (const command of commands) {
        const dataToSend = appendLineEnding(command.content, command.lineEnding, command.isHex);
        const format: DataFormat = command.isHex ? 'Hex' : 'Text';

        await invoke('send_data', {
          data: dataToSend,
          format: format,
          encoding: !command.isHex ? textEncoding : undefined,
        });

        // Small delay between commands to ensure proper sequencing
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Note: Logs are updated automatically via polling interval
    } catch (error) {
      console.error('Failed to send selected commands:', error);
      alert(`Failed to send: ${error}`);
    }
  };

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: colors.bgMain, color: colors.textPrimary }}>
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div
          className="flex flex-col relative z-20 transition-[width] duration-200 ease-out"
          style={{
            width: effectiveSidebarWidth,
            minWidth: effectiveSidebarWidth,
            backgroundColor: colors.bgSidebar,
            borderRight: `1px solid ${colors.borderDark}`,
            backdropFilter: 'blur(20px)'
          }}
        >
          {/* Collapsed Sidebar View */}
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center pt-4">
              <button
                onClick={toggleSidebarCollapse}
                className="p-2 rounded-md transition-colors focus:outline-none"
                style={{
                  color: colors.textSecondary,
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = colors.textPrimary;
                  e.currentTarget.style.backgroundColor = colors.bgHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = colors.textSecondary;
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title={t('sidebar.expandSidebar')}
              >
                <PanelLeft size={20} />
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-4 pt-6 flex items-start justify-between" style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                <div className="flex-1 min-w-0">
                  <h1 className="text-base font-bold tracking-wide truncate" style={{ color: colors.textPrimary }}>{t('app.title')}</h1>
                  <p className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>{t('app.subtitle')}</p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={toggleSidebarCollapse}
                    className="p-1.5 rounded-md transition-colors focus:outline-none"
                    style={{
                      color: colors.textSecondary,
                      backgroundColor: 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = colors.textPrimary;
                      e.currentTarget.style.backgroundColor = colors.bgHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = colors.textSecondary;
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title={t('sidebar.collapseSidebar')}
                  >
                    <PanelLeftClose size={16} />
                  </button>
                  <button
                    onClick={() => setShowSettings(true)}
                    className="p-1.5 rounded-md transition-colors focus:outline-none"
                    style={{
                      color: colors.textSecondary,
                      backgroundColor: 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = colors.textPrimary;
                      e.currentTarget.style.backgroundColor = colors.bgHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = colors.textSecondary;
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title={t('sidebar.settings')}
                  >
                    <Settings size={16} />
                  </button>
                </div>
              </div>

              {/* Port Selector */}
              <div className="p-4" style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                <PortSelector
                  ports={ports}
                  selectedPort={selectedPort}
                  onPortSelect={handlePortSelect}
                  onRefresh={loadPorts}
                  connectionStatus={connectionStatus}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  isLoading={isLoading}
                />
              </div>

              {/* Configuration */}
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                <ConfigPanel
                  config={config}
                  onChange={setConfig}
                  disabled={connectionStatus.is_connected}
                />
              </div>
            </>
          )}
        </div>

        {/* Sidebar Resize Handle */}
        {!sidebarCollapsed && (
          <div
            className="w-1 hover:w-1 cursor-col-resize relative z-30 group"
            onMouseDown={handleSidebarResizeStart}
            style={{
              backgroundColor: isResizingSidebar ? colors.accent : 'transparent',
            }}
          >
            <div
              className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-opacity-50 transition-colors"
              style={{
                backgroundColor: isResizingSidebar ? colors.accent : 'transparent',
              }}
            />
            <div
              className="absolute inset-y-0 left-0 w-1 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ backgroundColor: colors.accent }}
            />
          </div>
        )}

        {/* Main Content Area */}
        <div ref={mainContentRef} className="flex-1 flex flex-col relative" style={{ backgroundColor: colors.bgMain }}>
          {/* Log Viewer */}
          <div
            className="flex flex-col min-h-0"
            style={{
              height: logViewerHeight !== null ? logViewerHeight : undefined,
              flex: logViewerHeight !== null ? 'none' : `${DEFAULT_LOG_VIEWER_RATIO} 1 0%`,
              minHeight: MIN_LOG_VIEWER_HEIGHT,
            }}
          >
            <LogViewer
              logs={logs}
              onClear={handleClearLogs}
              onExport={handleExportLogs}
              isConnected={connectionStatus.is_connected}
            />
          </div>

          {/* Vertical Resize Handle */}
          <div
            className="h-1 cursor-row-resize relative z-30 group"
            onMouseDown={handleVerticalResizeStart}
            style={{
              backgroundColor: isResizingVertical ? colors.accent : colors.borderDark,
            }}
          >
            <div
              className="absolute inset-x-0 -top-1 -bottom-1 group-hover:bg-opacity-50 transition-colors"
              style={{
                backgroundColor: isResizingVertical ? colors.accent : 'transparent',
              }}
            />
            <div
              className="absolute inset-x-0 top-0 h-1 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ backgroundColor: colors.accent }}
            />
          </div>

          {/* Send Panel */}
          <div
            className="flex-1 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.2)] z-20"
            style={{
              minHeight: sendPanelMinHeight,
            }}
          >
            <SendPanel
              value={sendText}
              onChange={setSendText}
              format={sendFormat}
              onFormatChange={setSendFormat}
              onSend={handleSendData}
              isConnected={connectionStatus.is_connected}
              checksumConfig={checksumConfig}
              onChecksumConfigChange={setChecksumConfig}
              quickCommandLists={quickCommandLists}
              currentQuickCommandListId={currentQuickCommandListId}
              onQuickCommandListsChange={setQuickCommandLists}
              onCurrentQuickCommandListChange={setCurrentQuickCommandListId}
              onSendQuickCommand={handleSendQuickCommand}
              onSendSelectedQuickCommands={handleSendSelectedQuickCommands}
              onMinHeightChange={setSendPanelMinHeight}
            />
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        connectionStatus={connectionStatus}
        selectedPort={selectedPort}
        config={config}
      />

      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;