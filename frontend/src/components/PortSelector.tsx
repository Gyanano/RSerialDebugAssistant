import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RefreshCw, Plug, PlugZap } from 'lucide-react';
import { SerialPortInfo, ConnectionStatus } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../i18n';

// shadcn components
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

  // Animation state for refresh icon
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [rotation, setRotation] = useState(0);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const refreshCompleteRef = useRef(false);
  const completionTargetRef = useRef<number | null>(null);

  const ROTATION_SPEED = 360; // degrees per second (1 full rotation per second)

  // Handle manual refresh click
  const handleRefreshClick = useCallback(() => {
    if (isLoading) return;

    setIsManualRefreshing(true);
    refreshCompleteRef.current = false;
    completionTargetRef.current = null;
    startTimeRef.current = performance.now();
    setRotation(0);
    onRefresh();
  }, [isLoading, onRefresh]);

  // Animation loop
  useEffect(() => {
    if (!isManualRefreshing) return;

    const animate = (currentTime: number) => {
      const elapsed = (currentTime - startTimeRef.current) / 1000; // seconds
      const currentRotation = elapsed * ROTATION_SPEED;

      // If refresh is complete and we have a completion target
      if (refreshCompleteRef.current && completionTargetRef.current !== null) {
        if (currentRotation >= completionTargetRef.current) {
          // Animation complete - snap to target and stop
          setRotation(completionTargetRef.current);
          setIsManualRefreshing(false);
          animationRef.current = null;
          return;
        }
      }

      setRotation(currentRotation);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isManualRefreshing]);

  // Detect when loading completes during manual refresh
  useEffect(() => {
    if (isManualRefreshing && !isLoading && !refreshCompleteRef.current) {
      refreshCompleteRef.current = true;
      // Calculate the target rotation: next complete full rotation
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
      const currentRotation = elapsed * ROTATION_SPEED;
      const fullRotations = Math.ceil(currentRotation / 360);
      // Ensure at least 1 full rotation
      completionTargetRef.current = Math.max(fullRotations, 1) * 360;
    }
  }, [isLoading, isManualRefreshing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

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

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-1">
        <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textTertiary }}>
          {t('portSelector.connection')}
        </Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleRefreshClick}
                disabled={isLoading || isManualRefreshing}
              >
                <RefreshCw
                  size={12}
                  style={{
                    transform: isManualRefreshing ? `rotate(${rotation}deg)` : undefined,
                  }}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('portSelector.refresh')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div>
        <Select
          value={selectedPort}
          onValueChange={onPortSelect}
          disabled={connectionStatus.is_connected || isLoading || ports.length === 0}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder={ports.length === 0 ? t('portSelector.noPortsAvailable') : t('portSelector.selectPort')} />
          </SelectTrigger>
          <SelectContent>
            {ports.map((port) => (
              <SelectItem key={port.port_name} value={port.port_name}>
                {port.port_name} - {port.description || t('portSelector.unknownDevice')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 overflow-hidden">
        <Button
          variant={connectionStatus.is_connected ? 'destructive' : 'default'}
          className="flex-1 min-w-0 h-8 text-sm"
          onClick={handleConnectionToggle}
          disabled={!selectedPort || isLoading}
        >
          {connectionStatus.is_connected ? (
            <PlugZap size={12} className="mr-1.5 shrink-0" />
          ) : (
            <Plug size={12} className="mr-1.5 shrink-0" />
          )}
          <span className="truncate">{getConnectionButtonText()}</span>
        </Button>
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-md border shrink-0"
          style={{ backgroundColor: colors.bgInput, borderColor: colors.borderLight }}
        >
          {getStatusIndicator()}
          <span className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>
            {connectionStatus.is_connected ? t('portSelector.online') : t('portSelector.offline')}
          </span>
        </div>
      </div>

      {selectedPort && !connectionStatus.is_connected && (
        <Card className="mt-2" style={{ backgroundColor: colors.buttonSecondaryBg, borderColor: colors.borderLight }}>
          <CardContent className="p-3">
            <h4 className="font-medium text-xs mb-2" style={{ color: colors.textSecondary }}>
              {t('portSelector.portInformation')}
            </h4>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PortSelector;
