import React from 'react';
import { RefreshCw, Plug, PlugZap } from 'lucide-react';
import { SerialPortInfo, ConnectionStatus } from '../types';

interface PortSelectorProps {
  ports: SerialPortInfo[];
  selectedPort: string;
  onPortSelect: (port: string) => void;
  onRefresh: () => void;
  connectionStatus: ConnectionStatus;
  onConnect: () => void;
  onDisconnect: () => void;
  isLoading: boolean;
}

const PortSelector: React.FC<PortSelectorProps> = ({
  ports,
  selectedPort,
  onPortSelect,
  onRefresh,
  connectionStatus,
  onConnect,
  onDisconnect,
  isLoading,
}) => {
  const handlePortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onPortSelect(e.target.value);
  };

  const handleConnectionToggle = () => {
    if (connectionStatus.is_connected) {
      onDisconnect();
    } else {
      onConnect();
    }
  };

  const getStatusIndicator = () => {
    if (connectionStatus.is_connected) {
      return <span className="status-indicator status-connected"></span>;
    }
    return <span className="status-indicator status-disconnected"></span>;
  };

  const getConnectionButtonText = () => {
    if (isLoading) {
      return connectionStatus.is_connected ? 'Disconnecting...' : 'Connecting...';
    }
    return connectionStatus.is_connected ? 'Disconnect' : 'Connect';
  };

  const getConnectionButtonClass = () => {
    if (connectionStatus.is_connected) {
      return 'btn-danger w-full';
    }
    return 'btn-primary w-full';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Serial Ports</h3>
        <button
          onClick={onRefresh}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
          disabled={isLoading}
          title="Refresh ports"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Available Ports
        </label>
        <select
          value={selectedPort}
          onChange={handlePortChange}
          className="select-field"
          disabled={connectionStatus.is_connected || isLoading || ports.length === 0}
        >
          {ports.length === 0 ? (
            <option value="">No ports available</option>
          ) : (
            ports.map((port) => (
              <option key={port.port_name} value={port.port_name}>
                {port.port_name} - {port.description || 'Unknown Device'}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
        <div className="flex items-center space-x-2">
          {getStatusIndicator()}
          <span className="text-sm text-gray-300">
            {connectionStatus.is_connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="text-xs text-gray-400">
          {connectionStatus.port_name || 'No port'}
        </div>
      </div>

      <button
        onClick={handleConnectionToggle}
        disabled={!selectedPort || isLoading}
        className={getConnectionButtonClass()}
      >
        <div className="flex items-center justify-center space-x-2">
          {connectionStatus.is_connected ? (
            <PlugZap size={16} />
          ) : (
            <Plug size={16} />
          )}
          <span>{getConnectionButtonText()}</span>
        </div>
      </button>

      {selectedPort && !connectionStatus.is_connected && (
        <div className="mt-4 p-3 bg-gray-700 rounded-lg">
          <h4 className="font-medium text-sm text-gray-300 mb-2">Port Information</h4>
          {(() => {
            const portInfo = ports.find(p => p.port_name === selectedPort);
            if (!portInfo) return null;
            
            return (
              <div className="space-y-1 text-xs text-gray-400">
                <div>Type: {portInfo.port_type}</div>
                {portInfo.manufacturer && (
                  <div>Manufacturer: {portInfo.manufacturer}</div>
                )}
                {portInfo.product && (
                  <div>Product: {portInfo.product}</div>
                )}
                {portInfo.serial_number && (
                  <div>Serial: {portInfo.serial_number}</div>
                )}
                {portInfo.vid && portInfo.pid && (
                  <div>VID:PID: {portInfo.vid.toString(16).toUpperCase()}:{portInfo.pid.toString(16).toUpperCase()}</div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default PortSelector;