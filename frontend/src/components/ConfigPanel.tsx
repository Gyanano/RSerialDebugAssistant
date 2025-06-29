import React, { useState } from 'react';
import { Settings, Edit3, X } from 'lucide-react';
import { SerialConfig, DataBits, Parity, StopBits, FlowControl } from '../types';

interface ConfigPanelProps {
  config: SerialConfig;
  onChange: (config: SerialConfig) => void;
  disabled: boolean;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, onChange, disabled }) => {
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
    <div className="p-4">
      <div className="flex items-center space-x-2 mb-4">
        <Settings size={16} className="text-gray-400" />
        <h3 className="font-semibold text-white">Configuration</h3>
      </div>

      <div className="space-y-4">
        {/* Baud Rate */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Baud Rate
          </label>
          <div className="flex items-center space-x-2">
            {isCustomBaudRate ? (
              <input
                type="number"
                value={customBaudRate}
                onChange={handleCustomBaudRateChange}
                className="input-field flex-1"
                disabled={disabled}
                placeholder="9600"
                min="1"
              />
            ) : (
              <select
                value={config.baud_rate}
                onChange={handleBaudRateSelectChange}
                className="select-field flex-1"
                disabled={disabled}
              >
                {baudRateOptions.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={toggleCustomBaudRate}
              className="p-2 bg-gray-600 hover:bg-gray-500 text-gray-300 rounded transition-colors"
              disabled={disabled}
              title={isCustomBaudRate ? "Switch to preset values" : "Enter custom baud rate"}
            >
              {isCustomBaudRate ? <X size={16} /> : <Edit3 size={16} />}
            </button>
          </div>
        </div>

        {/* Data Bits */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Data Bits
          </label>
          <select
            value={config.data_bits}
            onChange={(e) => updateConfig('data_bits', e.target.value as DataBits)}
            className="select-field"
            disabled={disabled}
          >
            <option value="Five">5</option>
            <option value="Six">6</option>
            <option value="Seven">7</option>
            <option value="Eight">8</option>
          </select>
        </div>

        {/* Parity */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Parity
          </label>
          <select
            value={config.parity}
            onChange={(e) => updateConfig('parity', e.target.value as Parity)}
            className="select-field"
            disabled={disabled}
          >
            <option value="None">None</option>
            <option value="Odd">Odd</option>
            <option value="Even">Even</option>
            <option value="Mark">Mark</option>
            <option value="Space">Space</option>
          </select>
        </div>

        {/* Stop Bits */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Stop Bits
          </label>
          <select
            value={config.stop_bits}
            onChange={(e) => updateConfig('stop_bits', e.target.value as StopBits)}
            className="select-field"
            disabled={disabled}
          >
            <option value="One">1</option>
            <option value="OnePointFive">1.5</option>
            <option value="Two">2</option>
          </select>
        </div>

        {/* Flow Control */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Flow Control
          </label>
          <select
            value={config.flow_control}
            onChange={(e) => updateConfig('flow_control', e.target.value as FlowControl)}
            className="select-field"
            disabled={disabled}
          >
            <option value="None">None</option>
            <option value="Software">Software (XON/XOFF)</option>
            <option value="Hardware">Hardware (RTS/CTS)</option>
          </select>
        </div>

        {/* Timeout */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Timeout (ms)
          </label>
          <input
            type="number"
            value={config.timeout}
            onChange={(e) => updateConfig('timeout', parseInt(e.target.value) || 1000)}
            className="input-field"
            disabled={disabled}
            min="1"
            max="10000"
            placeholder="1000"
          />
        </div>

        {disabled && (
          <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
            <p className="text-xs text-yellow-400">
              Disconnect to modify configuration
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigPanel;