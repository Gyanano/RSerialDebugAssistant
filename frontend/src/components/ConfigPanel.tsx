import React, { useState } from 'react';
import { Settings, Edit3, X } from 'lucide-react';
import { SerialConfig, DataBits, Parity, StopBits, FlowControl } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../i18n';

interface ConfigPanelProps {
  config: SerialConfig;
  onChange: (config: SerialConfig) => void;
  disabled: boolean;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, onChange, disabled }) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [isCustomBaudRate, setIsCustomBaudRate] = useState(false);
  const [customBaudRate, setCustomBaudRate] = useState('9600');

  const updateConfig = <K extends keyof SerialConfig>(key: K, value: SerialConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  // 预设的波特率选项
  const baudRateOptions = [
    300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 56000, 
    57600, 115200, 128000, 230400, 256000, 460800, 512000, 750000, 
    921600, 1500000, 2000000
  ];

  const handleBaudRateSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value)) {
      updateConfig('baud_rate', value);
    }
  };

  const handleCustomBaudRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomBaudRate(value);
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue > 0) {
      updateConfig('baud_rate', numValue);
    }
  };

  const toggleCustomBaudRate = () => {
    if (isCustomBaudRate) {
      // 切换回下拉框模式，设置默认值为115200
      setIsCustomBaudRate(false);
      updateConfig('baud_rate', 115200);
    } else {
      // 切换到自定义模式，设置默认值为9600
      setIsCustomBaudRate(true);
      setCustomBaudRate('9600');
      updateConfig('baud_rate', 9600);
    }
  };

  return (
    <div className="p-4 space-y-5">
      {/* Baud Rate Group */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('configPanel.communication')}</span>
        </div>

        <div>
          <label className="block text-xs mb-1 ml-1" style={{ color: colors.textSecondary }}>
            {t('configPanel.baudRate')}
          </label>
          <div className="flex items-center space-x-2">
            {isCustomBaudRate ? (
              <input
                type="number"
                value={customBaudRate}
                onChange={handleCustomBaudRateChange}
                className="flex-1 text-sm px-3 py-2 rounded-[6px] focus:outline-none focus:ring-2 shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: colors.bgInput,
                  border: `1px solid ${colors.border}`,
                  color: colors.textPrimary,
                  '--tw-ring-color': `${colors.accent}80`
                } as React.CSSProperties}
                disabled={disabled}
                placeholder="9600"
                min="1"
              />
            ) : (
              <select
                value={config.baud_rate}
                onChange={handleBaudRateSelectChange}
                className="flex-1 text-sm px-3 py-2 rounded-[6px] focus:outline-none focus:ring-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: colors.buttonSecondaryBg,
                  border: `1px solid transparent`,
                  color: colors.textPrimary,
                  '--tw-ring-color': `${colors.accent}80`
                } as React.CSSProperties}
                disabled={disabled}
              >
                {baudRateOptions.map((rate) => (
                  <option key={rate} value={rate} style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>
                    {rate}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={toggleCustomBaudRate}
              className="p-2 rounded-[6px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: colors.buttonSecondaryBg,
                border: `1px solid ${colors.borderLight}`,
                color: colors.textSecondary
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.buttonSecondaryHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = colors.buttonSecondaryBg}
              disabled={disabled}
              title={isCustomBaudRate ? t('configPanel.switchToPreset') : t('configPanel.enterCustomBaudRate')}
            >
              {isCustomBaudRate ? <X size={14} /> : <Edit3 size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* Parameters Group */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>{t('configPanel.parameters')}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1 ml-1" style={{ color: colors.textSecondary }}>
              {t('configPanel.dataBits')}
            </label>
            <select
              value={config.data_bits}
              onChange={(e) => updateConfig('data_bits', e.target.value as DataBits)}
              className="w-full text-sm px-3 py-2 rounded-[6px] focus:outline-none focus:ring-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: colors.buttonSecondaryBg,
                border: `1px solid transparent`,
                color: colors.textPrimary,
                '--tw-ring-color': `${colors.accent}80`
              } as React.CSSProperties}
              disabled={disabled}
            >
              <option value="Five" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>5</option>
              <option value="Six" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>6</option>
              <option value="Seven" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>7</option>
              <option value="Eight" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>8</option>
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1 ml-1" style={{ color: colors.textSecondary }}>
              {t('configPanel.stopBits')}
            </label>
            <select
              value={config.stop_bits}
              onChange={(e) => updateConfig('stop_bits', e.target.value as StopBits)}
              className="w-full text-sm px-3 py-2 rounded-[6px] focus:outline-none focus:ring-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: colors.buttonSecondaryBg,
                border: `1px solid transparent`,
                color: colors.textPrimary,
                '--tw-ring-color': `${colors.accent}80`
              } as React.CSSProperties}
              disabled={disabled}
            >
              <option value="One" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>1</option>
              <option value="OnePointFive" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>1.5</option>
              <option value="Two" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>2</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs mb-1 ml-1" style={{ color: colors.textSecondary }}>
            {t('configPanel.parity')}
          </label>
          <select
            value={config.parity}
            onChange={(e) => updateConfig('parity', e.target.value as Parity)}
            className="w-full text-sm px-3 py-2 rounded-[6px] focus:outline-none focus:ring-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: colors.buttonSecondaryBg,
              border: `1px solid transparent`,
              color: colors.textPrimary,
              '--tw-ring-color': `${colors.accent}80`
            } as React.CSSProperties}
            disabled={disabled}
          >
            <option value="None" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>{t('configPanel.parityNone')}</option>
            <option value="Odd" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>{t('configPanel.parityOdd')}</option>
            <option value="Even" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>{t('configPanel.parityEven')}</option>
            <option value="Mark" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>{t('configPanel.parityMark')}</option>
            <option value="Space" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>{t('configPanel.paritySpace')}</option>
          </select>
        </div>

        <div>
          <label className="block text-xs mb-1 ml-1" style={{ color: colors.textSecondary }}>
            {t('configPanel.flowControl')}
          </label>
          <select
            value={config.flow_control}
            onChange={(e) => updateConfig('flow_control', e.target.value as FlowControl)}
            className="w-full text-sm px-3 py-2 rounded-[6px] focus:outline-none focus:ring-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: colors.buttonSecondaryBg,
              border: `1px solid transparent`,
              color: colors.textPrimary,
              '--tw-ring-color': `${colors.accent}80`
            } as React.CSSProperties}
            disabled={disabled}
          >
            <option value="None" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>{t('configPanel.flowControlNone')}</option>
            <option value="Software" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>{t('configPanel.flowControlSoftware')}</option>
            <option value="Hardware" style={{ backgroundColor: colors.bgSidebar, color: colors.textPrimary }}>{t('configPanel.flowControlHardware')}</option>
          </select>
        </div>

        <div>
          <label className="block text-xs mb-1 ml-1" style={{ color: colors.textSecondary }}>
            {t('configPanel.timeout')}
          </label>
          <input
            type="number"
            value={config.timeout}
            onChange={(e) => updateConfig('timeout', parseInt(e.target.value) || 1000)}
            className="w-full text-sm px-3 py-2 rounded-[6px] focus:outline-none focus:ring-2 shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: colors.bgInput,
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              '--tw-ring-color': `${colors.accent}80`
            } as React.CSSProperties}
            disabled={disabled}
            min="1"
            max="10000"
            placeholder="1000"
          />
        </div>
      </div>

      {disabled && (
        <div
          className="p-3 rounded-[6px]"
          style={{
            backgroundColor: `${colors.warning}20`,
            border: `1px solid ${colors.warning}30`
          }}
        >
          <p className="text-xs" style={{ color: colors.warning }}>
            {t('configPanel.disconnectToModify')}
          </p>
        </div>
      )}
    </div>
  );
};

export default ConfigPanel;