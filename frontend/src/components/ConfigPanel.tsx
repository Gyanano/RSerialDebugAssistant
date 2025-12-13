import React, { useState } from 'react';
import { Edit3, X } from 'lucide-react';
import { SerialConfig, DataBits, Parity, StopBits, FlowControl } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../i18n';

// shadcn components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

  const baudRateOptions = [
    300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 56000,
    57600, 115200, 128000, 230400, 256000, 460800, 512000, 750000,
    921600, 1500000, 2000000
  ];

  const handleBaudRateSelectChange = (value: string) => {
    const numValue = parseInt(value);
    if (!isNaN(numValue)) {
      updateConfig('baud_rate', numValue);
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
      setIsCustomBaudRate(false);
      updateConfig('baud_rate', 115200);
    } else {
      setIsCustomBaudRate(true);
      setCustomBaudRate('9600');
      updateConfig('baud_rate', 9600);
    }
  };

  return (
    <div className="p-4 space-y-5">
      {/* Baud Rate Group */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
          {t('configPanel.communication')}
        </Label>

        <div>
          <Label className="block text-xs mb-1 ml-1" style={{ color: colors.textSecondary }}>
            {t('configPanel.baudRate')}
          </Label>
          <div className="flex items-center gap-2">
            {isCustomBaudRate ? (
              <Input
                type="number"
                value={customBaudRate}
                onChange={handleCustomBaudRateChange}
                className="flex-1 h-9"
                disabled={disabled}
                placeholder="9600"
                min={1}
              />
            ) : (
              <Select
                value={config.baud_rate.toString()}
                onValueChange={handleBaudRateSelectChange}
                disabled={disabled}
              >
                <SelectTrigger className="flex-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {baudRateOptions.map((rate) => (
                    <SelectItem key={rate} value={rate.toString()}>
                      {rate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-9 w-9"
                    onClick={toggleCustomBaudRate}
                    disabled={disabled}
                  >
                    {isCustomBaudRate ? <X size={14} /> : <Edit3 size={14} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isCustomBaudRate ? t('configPanel.switchToPreset') : t('configPanel.enterCustomBaudRate')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Parameters Group */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
          {t('configPanel.parameters')}
        </Label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="block text-xs mb-1 ml-1" style={{ color: colors.textSecondary }}>
              {t('configPanel.dataBits')}
            </Label>
            <Select
              value={config.data_bits}
              onValueChange={(v) => updateConfig('data_bits', v as DataBits)}
              disabled={disabled}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Five">5</SelectItem>
                <SelectItem value="Six">6</SelectItem>
                <SelectItem value="Seven">7</SelectItem>
                <SelectItem value="Eight">8</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="block text-xs mb-1 ml-1" style={{ color: colors.textSecondary }}>
              {t('configPanel.stopBits')}
            </Label>
            <Select
              value={config.stop_bits}
              onValueChange={(v) => updateConfig('stop_bits', v as StopBits)}
              disabled={disabled}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="One">1</SelectItem>
                <SelectItem value="OnePointFive">1.5</SelectItem>
                <SelectItem value="Two">2</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="block text-xs mb-1 ml-1" style={{ color: colors.textSecondary }}>
            {t('configPanel.parity')}
          </Label>
          <Select
            value={config.parity}
            onValueChange={(v) => updateConfig('parity', v as Parity)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="None">{t('configPanel.parityNone')}</SelectItem>
              <SelectItem value="Odd">{t('configPanel.parityOdd')}</SelectItem>
              <SelectItem value="Even">{t('configPanel.parityEven')}</SelectItem>
              <SelectItem value="Mark">{t('configPanel.parityMark')}</SelectItem>
              <SelectItem value="Space">{t('configPanel.paritySpace')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="block text-xs mb-1 ml-1" style={{ color: colors.textSecondary }}>
            {t('configPanel.flowControl')}
          </Label>
          <Select
            value={config.flow_control}
            onValueChange={(v) => updateConfig('flow_control', v as FlowControl)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="None">{t('configPanel.flowControlNone')}</SelectItem>
              <SelectItem value="Software">{t('configPanel.flowControlSoftware')}</SelectItem>
              <SelectItem value="Hardware">{t('configPanel.flowControlHardware')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="block text-xs mb-1 ml-1" style={{ color: colors.textSecondary }}>
            {t('configPanel.timeout')}
          </Label>
          <Input
            type="number"
            value={config.timeout}
            onChange={(e) => updateConfig('timeout', parseInt(e.target.value) || 1000)}
            className="h-9"
            disabled={disabled}
            min={1}
            max={10000}
            placeholder="1000"
          />
        </div>
      </div>

      {disabled && (
        <Alert variant="warning" className="py-2">
          <AlertDescription className="text-xs">
            {t('configPanel.disconnectToModify')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default ConfigPanel;
