import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import PortSelector from './components/PortSelector';
import ConfigPanel from './components/ConfigPanel';
import LogViewer from './components/LogViewer';
import SendPanel from './components/SendPanel';
import StatusBar from './components/StatusBar';
import { SerialPortInfo, SerialConfig, LogEntry, ConnectionStatus, DataFormat } from './types';

function App() {
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
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
  const [isLoading, setIsLoading] = useState(false);
  const [userHasSelectedPort, setUserHasSelectedPort] = useState(false);

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
      await invoke('send_data', {
        data: sendText,
        format: sendFormat,
      });
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

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-700">
            <h1 className="text-xl font-bold text-white">Serial Debug Assistant</h1>
            <p className="text-sm text-gray-400 mt-1">Professional Serial Communication Tool</p>
          </div>
          
          {/* Port Selector */}
          <div className="p-4 border-b border-gray-700">
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
        <div className="flex-1 flex flex-col">
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
          <div className="border-t border-gray-700 flex-shrink-0">
            <SendPanel
              value={sendText}
              onChange={setSendText}
              format={sendFormat}
              onFormatChange={setSendFormat}
              onSend={handleSendData}
              disabled={!connectionStatus.is_connected}
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
    </div>
  );
}

export default App;