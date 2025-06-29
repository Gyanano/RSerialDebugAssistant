import React, { useRef, useEffect } from 'react';
import { Send, Type, Hash } from 'lucide-react';
import { DataFormat } from '../types';

interface SendPanelProps {
  value: string;
  onChange: (value: string) => void;
  format: DataFormat;
  onFormatChange: (format: DataFormat) => void;
  onSend: () => void;
  disabled: boolean;
}

const SendPanel: React.FC<SendPanelProps> = ({
  value,
  onChange,
  format,
  onFormatChange,
  onSend,
  disabled,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSend();
      }
    }
  };

  const handleSendClick = () => {
    if (!disabled && value.trim()) {
      onSend();
    }
  };

  const getPlaceholderText = () => {
    if (format === 'Text') {
      return 'Type your message here... (Ctrl+Enter to send)';
    } else {
      return 'Enter hex data (e.g., 48 65 6C 6C 6F or 48656C6C6F)...';
    }
  };

  const getByteCount = () => {
    if (format === 'Text') {
      return new TextEncoder().encode(value).length;
    } else {
      const cleanHex = value.replace(/\s/g, '');
      return Math.floor(cleanHex.length / 2);
    }
  };

  const insertCommonHex = (hexValue: string) => {
    const newValue = value ? `${value} ${hexValue}` : hexValue;
    onChange(newValue);
    // Focus back to textarea
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const commonHexValues = [
    { label: 'CR', value: '0D', description: 'Carriage Return' },
    { label: 'LF', value: '0A', description: 'Line Feed' },
    { label: 'CRLF', value: '0D 0A', description: 'CR + LF' },
    { label: 'NULL', value: '00', description: 'Null byte' },
    { label: 'ESC', value: '1B', description: 'Escape' },
    { label: 'SPACE', value: '20', description: 'Space character' },
  ];

  return (
    <div className="bg-gray-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Send size={16} className="text-gray-400" />
          <h3 className="font-semibold text-white">Send Data</h3>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400">Format:</span>
          <button
            onClick={() => onFormatChange('Text')}
            className={`flex items-center space-x-1 px-3 py-1 rounded text-xs transition-colors ${
              format === 'Text'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
            }`}
            disabled={disabled}
          >
            <Type size={12} />
            <span>Text</span>
          </button>
          <button
            onClick={() => onFormatChange('Hex')}
            className={`flex items-center space-x-1 px-3 py-1 rounded text-xs transition-colors ${
              format === 'Hex'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
            }`}
            disabled={disabled}
          >
            <Hash size={12} />
            <span>Hex</span>
          </button>
        </div>
      </div>

      <div className="flex space-x-4">
        {/* Text Input */}
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholderText()}
            className="w-full h-24 resize-none input-field font-mono text-sm"
            disabled={disabled}
          />
          
          <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
            <div>
              {format === 'Text' && (
                <span>Characters: {value.length}</span>
              )}
              <span className="ml-4">Bytes: {getByteCount()}</span>
            </div>
            <div>
              <kbd className="px-1 py-0.5 bg-gray-700 rounded text-xs">Ctrl</kbd>
              {' + '}
              <kbd className="px-1 py-0.5 bg-gray-700 rounded text-xs">Enter</kbd>
              {' to send'}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="w-48 space-y-3">
          <button
            onClick={handleSendClick}
            disabled={disabled || !value.trim()}
            className="btn-primary w-full"
          >
            <div className="flex items-center justify-center space-x-2">
              <Send size={16} />
              <span>Send</span>
            </div>
          </button>

          {format === 'Hex' && (
            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-2">Quick Insert:</h4>
              <div className="grid grid-cols-2 gap-1">
                {commonHexValues.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => insertCommonHex(item.value)}
                    className="text-xs bg-gray-600 hover:bg-gray-500 px-2 py-1 rounded font-mono transition-colors"
                    disabled={disabled}
                    title={item.description}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!disabled && (
            <div className="text-xs text-gray-400 space-y-1">
              <div>💡 Tips:</div>
              <div>• Use Ctrl+Enter to send</div>
              <div>• {format === 'Text' ? 'Switch to Hex for binary data' : 'Use spaces to separate hex bytes'}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SendPanel;