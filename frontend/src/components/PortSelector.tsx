import React from 'react';
import { RefreshCw, Plug, PlugZap } from 'lucide-react';
import { SerialPortInfo, ConnectionStatus } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../i18n';

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
  const { colors } = useTheme();
  const { t } = useTranslation();

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
      return connectionStatus.is_connected ? `${t('portSelector.disconnect')}...` : `${t('portSelector.connect')}...`;
    }
    return connectionStatus.is_connected ? t('portSelector.disconnect') : t('portSelector.connect');
  };

  const getConnectionButtonClass = () => {
    if (connectionStatus.is_connected) {
      return 'btn-danger w-full';
    }
    return 'btn-primary w-full';
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('portSelector.connection')}</span>
        <button
          onClick={onRefresh}
          className="p-1 rounded transition-colors"
          style={{ color: colors.textSecondary }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.bgHover;
            e.currentTarget.style.color = colors.textPrimary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = colors.textSecondary;
          }}
          disabled={isLoading}
          title={t('portSelector.refresh')}
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div>
        <select
          value={selectedPort}
          onChange={handlePortChange}
          className="w-full text-sm py-1.5 pl-2 pr-8 rounded-[6px] focus:outline-none focus:ring-2 shadow-inner"
          style={{
            backgroundColor: colors.bgInput,
            border: `1px solid ${colors.border}`,
            color: colors.textPrimary,
            '--tw-ring-color': `${colors.accent}80`
          } as React.CSSProperties}
          disabled={connectionStatus.is_connected || isLoading || ports.length === 0}
        >
          {ports.length === 0 ? (
            <option value="" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>{t('portSelector.noPortsAvailable')}</option>
          ) : (
            ports.map((port) => (
              <option key={port.port_name} value={port.port_name} style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>
                {port.port_name} - {port.description || t('portSelector.unknownDevice')}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="flex items-center space-x-2">
        <button
          onClick={handleConnectionToggle}
          disabled={!selectedPort || isLoading}
          className="flex-1 text-sm font-medium py-1 px-3 rounded-[6px] shadow-macos-btn transition-all active:scale-[0.98] flex items-center justify-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: connectionStatus.is_connected ? colors.danger : colors.accent,
            color: '#ffffff'
          }}
        >
          {connectionStatus.is_connected ? (
            <PlugZap size={12} />
          ) : (
            <Plug size={12} />
          )}
          <span>{getConnectionButtonText()}</span>
        </button>
        <div
          className="flex items-center space-x-1.5 px-2 py-1 rounded-[6px]"
          style={{ backgroundColor: colors.bgInput, border: `1px solid ${colors.borderLight}` }}
        >
          {getStatusIndicator()}
          <span className="text-xs" style={{ color: colors.textSecondary }}>
            {connectionStatus.is_connected ? t('portSelector.online') : t('portSelector.offline')}
          </span>
        </div>
      </div>

      {selectedPort && !connectionStatus.is_connected && (
        <div
          className="mt-2 p-3 rounded-[6px]"
          style={{ backgroundColor: colors.buttonSecondaryBg, border: `1px solid ${colors.borderLight}` }}
        >
          <h4 className="font-medium text-xs mb-2" style={{ color: colors.textSecondary }}>{t('portSelector.portInformation')}</h4>
          {(() => {
            const portInfo = ports.find(p => p.port_name === selectedPort);
            if (!portInfo) return null;

            return (
              <div className="space-y-1 text-xs" style={{ color: colors.textTertiary }}>
                <div>{t('portSelector.type')}: {portInfo.port_type}</div>
                {portInfo.manufacturer && (
                  <div>{t('portSelector.manufacturer')}: {portInfo.manufacturer}</div>
                )}
                {portInfo.product && (
                  <div>{t('portSelector.product')}: {portInfo.product}</div>
                )}
                {portInfo.serial_number && (
                  <div>{t('portSelector.serial')}: {portInfo.serial_number}</div>
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