import React from 'react';
import { Activity, Clock, Settings2 } from 'lucide-react';
import { ConnectionStatus, SerialConfig } from '../types';

interface StatusBarProps {
  connectionStatus: ConnectionStatus;
  selectedPort: string;
  config: SerialConfig;
}

const StatusBar: React.FC<StatusBarProps> = ({ connectionStatus, selectedPort, config }) => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatConnectionTime = (timestamp: string | null) => {
    if (!timestamp) return 'Not connected';
    
    const now = new Date();
    const connectionTime = new Date(timestamp);
    const diff = Math.floor((now.getTime() - connectionTime.getTime()) / 1000);
    
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getStatusText = () => {
    if (connectionStatus.is_connected) {
      return `Connected to ${connectionStatus.port_name}`;
    } else if (selectedPort) {
      return `Ready to connect to ${selectedPort}`;
    } else {
      return 'No port selected';
    }
  };

  const getStatusColor = () => {
    if (connectionStatus.is_connected) {
      return 'text-green-400';
    } else if (selectedPort) {
      return 'text-yellow-400';
    } else {
      return 'text-gray-400';
    }
  };

  const getConfigSummary = () => {
    const dataBitsMap = {
      'Five': '5',
      'Six': '6',
      'Seven': '7',
      'Eight': '8',
    };

    const parityMap = {
      'None': 'N',
      'Odd': 'O',
      'Even': 'E',
      'Mark': 'M',
      'Space': 'S',
    };

    const stopBitsMap = {
      'One': '1',
      'OnePointFive': '1.5',
      'Two': '2',
    };

    return `${config.baud_rate} ${dataBitsMap[config.data_bits]}${parityMap[config.parity]}${stopBitsMap[config.stop_bits]}`;
  };

  return (
    <div className="h-8 bg-gray-800 border-t border-gray-700 px-4 flex items-center justify-between text-xs">
      {/* Left side - Connection status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Activity size={12} className={getStatusColor()} />
          <span className={getStatusColor()}>{getStatusText()}</span>
        </div>
        
        {connectionStatus.is_connected && (
          <>
            <div className="flex items-center space-x-2 text-gray-400">
              <Clock size={12} />
              <span>{formatConnectionTime(connectionStatus.connection_time)}</span>
            </div>
            
            <div className="flex items-center space-x-4 text-gray-400">
              <span>
                TX: <span className="text-blue-400 font-mono">{formatBytes(connectionStatus.bytes_sent)}</span>
              </span>
              <span>
                RX: <span className="text-green-400 font-mono">{formatBytes(connectionStatus.bytes_received)}</span>
              </span>
            </div>
          </>
        )}
      </div>

      {/* Right side - Configuration and app info */}
      <div className="flex items-center space-x-4 text-gray-400">
        <div className="flex items-center space-x-2">
          <Settings2 size={12} />
          <span className="font-mono">{getConfigSummary()}</span>
        </div>
        
        <div className="text-gray-500">
          Serial Debug Assistant v1.0.0
        </div>
      </div>
    </div>
  );
};

export default StatusBar;