import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings } from 'lucide-react';
import PortSelector from './components/PortSelector';
import ConfigPanel from './components/ConfigPanel';
import LogViewer from './components/LogViewer';
import SendPanel from './components/SendPanel';
import StatusBar from './components/StatusBar';
import SettingsModal from './components/SettingsModal';
import { SerialPortInfo, SerialConfig, LogEntry, ConnectionStatus, DataFormat, ChecksumConfig, QuickCommandList, QuickCommand, LineEnding, TextEncoding } from './types';
import { useTheme } from './contexts/ThemeContext';
import { appendChecksum } from './utils/checksum';

const QUICK_COMMANDS_STORAGE_KEY = 'serial-debug-quick-commands';
const STORAGE_KEY_TEXT_ENCODING = 'serialDebug_textEncoding';
const INITIAL_COMMANDS = 20;

const createEmptyCommand = (): QuickCommand => ({
  id: crypto.randomUUID(),
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
        return parsed;
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

function App() {
  const { colors } = useTheme();
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
      await updateLogs();
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
      // In a real app, you'd use a file dialog here
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `serial_logs_${timestamp}.txt`;

      await invoke('export_logs', {
        filePath: filename,
        format: 'Txt',
      });

      alert(`Logs exported to ${filename}`);
    } catch (error) {
      console.error('Failed to export logs:', error);
      alert(`Failed to export logs: ${error}`);
    }
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

      await updateLogs();
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

      await updateLogs();
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
        <div className="w-80 flex flex-col relative z-20" style={{ 
          backgroundColor: colors.bgSidebar, 
          borderRight: `1px solid ${colors.borderDark}`,
          backdropFilter: 'blur(20px)'
        }}>
          {/* Header */}
          <div className="p-4 pt-6 flex items-start justify-between" style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
            <div>
              <h1 className="text-base font-bold tracking-wide" style={{ color: colors.textPrimary }}>RSerial Debug Assistant</h1>
              <p className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>Professional Tool</p>
            </div>
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
              title="Settings"
            >
              <Settings size={16} />
            </button>
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
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col relative" style={{ backgroundColor: colors.bgMain }}>
          {/* Log Viewer */}
          <div className="flex-1 flex flex-col min-h-0">
            <LogViewer
              logs={logs}
              onClear={handleClearLogs}
              onExport={handleExportLogs}
              isConnected={connectionStatus.is_connected}
            />
          </div>

          {/* Send Panel */}
          <div className="flex-shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.2)] z-20" style={{ borderTop: `1px solid ${colors.borderDark}` }}>
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