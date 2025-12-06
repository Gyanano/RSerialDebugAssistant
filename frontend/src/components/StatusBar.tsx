import React from 'react';
import { Activity, Clock, Settings2 } from 'lucide-react';
import { ConnectionStatus, SerialConfig } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../i18n';

interface StatusBarProps {
  connectionStatus: ConnectionStatus;
  selectedPort: string;
  config: SerialConfig;
}

const StatusBar: React.FC<StatusBarProps> = ({ connectionStatus, selectedPort, config }) => {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatConnectionTime = (timestamp: string | null) => {
    if (!timestamp) return t('statusBar.notConnected');

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
      return `${t('statusBar.connectedTo')} ${connectionStatus.port_name}`;
    } else if (selectedPort) {
      return `${t('statusBar.readyToConnect')} ${selectedPort}`;
    } else {
      return t('statusBar.noPortSelected');
    }
  };

  const getStatusColor = () => {
    if (connectionStatus.is_connected) {
      return colors.success;
    } else if (selectedPort) {
      return colors.warning;
    } else {
      return colors.textTertiary;
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
    <div
      className="h-7 px-3 flex items-center justify-between text-[11px] select-none z-20"
      style={{
        backgroundColor: colors.bgSidebar,
        borderTop: `1px solid ${colors.borderDark}`,
        color: colors.textTertiary
      }}
    >
      {/* Left side - Connection status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1.5">
          <Activity size={12} style={{ color: getStatusColor() }} />
          <span style={{ color: getStatusColor() }}>{getStatusText()}</span>
        </div>

        {connectionStatus.is_connected && (
          <>
            <div className="w-px h-3" style={{ backgroundColor: colors.border }}></div>
            <span>{formatConnectionTime(connectionStatus.connection_time)}</span>
          </>
        )}
      </div>

      {/* Right side - Configuration and app info */}
      <div className="flex items-center space-x-3" style={{ color: colors.textTertiary }}>
        <span className="font-mono">{getConfigSummary()}</span>
        <div className="w-px h-3" style={{ backgroundColor: colors.border }}></div>
        <span>v1.2.0</span>
      </div>
    </div>
  );
};

export default StatusBar;