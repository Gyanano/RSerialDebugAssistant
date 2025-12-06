import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Send, ChevronDown, Edit2, Check, X, Trash2, Play, Square, RefreshCw } from 'lucide-react';
import { QuickCommand, QuickCommandList, LineEnding } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../i18n';

const LOOP_INTERVAL_KEY = 'quickCommandLoopInterval';
const DEFAULT_LOOP_INTERVAL = 1000;
const MIN_LOOP_INTERVAL = 50;
const MAX_LOOP_INTERVAL = 60000;

interface QuickCommandPanelProps {
  lists: QuickCommandList[];
  currentListId: string;
  onListsChange: (lists: QuickCommandList[]) => void;
  onCurrentListChange: (listId: string) => void;
  onSendCommand: (content: string, isHex: boolean, lineEnding: LineEnding) => void;
  onSendSelected: (commands: QuickCommand[]) => void;
  disabled: boolean;
}

const MAX_COMMANDS = 600;
const INITIAL_COMMANDS = 20;

const createEmptyCommand = (): QuickCommand => ({
  id: crypto.randomUUID(),
  selected: false,
  isHex: false,
  content: '',
  lineEnding: 'None',
});

const createEmptyList = (name: string): QuickCommandList => ({
  id: crypto.randomUUID(),
  name,
  commands: Array.from({ length: INITIAL_COMMANDS }, createEmptyCommand),
});

const QuickCommandPanel: React.FC<QuickCommandPanelProps> = ({
  lists,
  currentListId,
  onListsChange,
  onCurrentListChange,
  onSendCommand,
  onSendSelected,
  disabled,
}) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [isListDropdownOpen, setIsListDropdownOpen] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Loop sending state
  const [isLooping, setIsLooping] = useState(false);
  const [loopInterval, setLoopInterval] = useState(() => {
    const saved = localStorage.getItem(LOOP_INTERVAL_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_LOOP_INTERVAL;
  });
  const [iterationCount, setIterationCount] = useState(0);
  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);

  const currentList = lists.find(l => l.id === currentListId) || lists[0];
  const lineEndingOptions: { value: LineEnding; label: string }[] = [
    { value: 'None', label: t('quickCommand.endingNone') },
    { value: '\\r', label: '\\r' },
    { value: '\\n', label: '\\n' },
    { value: '\\r\\n', label: '\\r\\n' },
  ];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsListDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Stop loop when disabled (disconnected)
  useEffect(() => {
    if (disabled && isLooping) {
      stopLoop();
    }
  }, [disabled]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (loopTimerRef.current) {
        clearInterval(loopTimerRef.current);
      }
    };
  }, []);

  const stopLoop = useCallback(() => {
    if (loopTimerRef.current) {
      clearInterval(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    setIsLooping(false);
    setIterationCount(0);
  }, []);

  const handleLoopIntervalChange = (value: string) => {
    let numValue = parseInt(value, 10);
    if (isNaN(numValue)) numValue = DEFAULT_LOOP_INTERVAL;
    numValue = Math.max(MIN_LOOP_INTERVAL, Math.min(MAX_LOOP_INTERVAL, numValue));
    setLoopInterval(numValue);
    localStorage.setItem(LOOP_INTERVAL_KEY, numValue.toString());
  };

  const startLoop = () => {
    const selectedCommands = currentList.commands.filter(c => c.selected && c.content.trim());
    if (selectedCommands.length === 0 || disabled) return;

    // Send immediately (first iteration)
    onSendSelected(selectedCommands);
    setIterationCount(1);
    setIsLooping(true);

    // Schedule subsequent iterations
    loopTimerRef.current = setInterval(() => {
      const cmds = currentList.commands.filter(c => c.selected && c.content.trim());
      if (cmds.length > 0) {
        onSendSelected(cmds);
        setIterationCount(prev => prev + 1);
      }
    }, loopInterval);
  };

  const updateCurrentList = (updatedCommands: QuickCommand[]) => {
    const updatedLists = lists.map(list =>
      list.id === currentListId ? { ...list, commands: updatedCommands } : list
    );
    onListsChange(updatedLists);
  };

  const handleCommandChange = (index: number, field: keyof QuickCommand, value: any) => {
    const updatedCommands = [...currentList.commands];
    updatedCommands[index] = { ...updatedCommands[index], [field]: value };
    updateCurrentList(updatedCommands);
  };

  const handleAddMoreCommands = () => {
    if (currentList.commands.length >= MAX_COMMANDS) return;
    const newCommands = Array.from(
      { length: Math.min(20, MAX_COMMANDS - currentList.commands.length) },
      createEmptyCommand
    );
    updateCurrentList([...currentList.commands, ...newCommands]);
  };

  const handleSendSingle = (command: QuickCommand) => {
    if (!command.content.trim() || disabled) return;
    onSendCommand(command.content, command.isHex, command.lineEnding);
  };

  const handleSendAllSelected = () => {
    const selectedCommands = currentList.commands.filter(c => c.selected && c.content.trim());
    if (selectedCommands.length === 0 || disabled) return;
    onSendSelected(selectedCommands);
  };

  const handleCreateNewList = () => {
    const newList = createEmptyList(`List ${lists.length + 1}`);
    onListsChange([...lists, newList]);
    onCurrentListChange(newList.id);
    setIsListDropdownOpen(false);
  };

  const handleDeleteList = (listId: string) => {
    if (lists.length <= 1) return; // Keep at least one list
    const updatedLists = lists.filter(l => l.id !== listId);
    onListsChange(updatedLists);
    if (currentListId === listId) {
      onCurrentListChange(updatedLists[0].id);
    }
  };

  const handleStartEditName = (list: QuickCommandList) => {
    setEditingListId(list.id);
    setEditingName(list.name);
  };

  const handleSaveEditName = () => {
    if (!editingListId || !editingName.trim()) return;
    const updatedLists = lists.map(list =>
      list.id === editingListId ? { ...list, name: editingName.trim() } : list
    );
    onListsChange(updatedLists);
    setEditingListId(null);
    setEditingName('');
  };

  const handleCancelEditName = () => {
    setEditingListId(null);
    setEditingName('');
  };

  const handleSelectAll = () => {
    const allSelected = currentList.commands.every(c => c.selected);
    const updatedCommands = currentList.commands.map(c => ({ ...c, selected: !allSelected }));
    updateCurrentList(updatedCommands);
  };

  const selectedCount = currentList.commands.filter(c => c.selected && c.content.trim()).length;

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: colors.bgSidebar }}>
      {/* Command List */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto scrollbar-thin min-h-0"
      >
        {/* Header Row */}
        <div
          className="sticky top-0 z-10 flex items-center px-3 py-1.5 text-xs font-medium"
          style={{
            backgroundColor: colors.bgSurface,
            borderBottom: `1px solid ${colors.borderLight}`,
            color: colors.textTertiary
          }}
        >
          <div className="w-7 flex justify-center">
            <input
              type="checkbox"
              checked={currentList.commands.length > 0 && currentList.commands.every(c => c.selected)}
              onChange={handleSelectAll}
              className="w-3.5 h-3.5 rounded cursor-pointer"
              style={{ accentColor: colors.accent }}
              title={t('quickCommand.selectAll')}
            />
          </div>
          <div className="w-12 text-center">HEX</div>
          <div className="flex-1 text-center">{t('quickCommand.command')}</div>
          <div className="w-20 text-center">{t('quickCommand.ending')}</div>
          <div className="w-12 text-center">{t('quickCommand.send')}</div>
        </div>

        {/* Command Rows */}
        {currentList.commands.map((command, index) => (
          <div
            key={command.id}
            className="flex items-center px-3 py-1 group"
            style={{
              borderBottom: `1px solid ${colors.borderLight}`,
              backgroundColor: command.selected ? `${colors.accent}10` : 'transparent'
            }}
          >
            {/* Selection Checkbox */}
            <div className="w-7 flex justify-center">
              <input
                type="checkbox"
                checked={command.selected}
                onChange={(e) => handleCommandChange(index, 'selected', e.target.checked)}
                className="w-3.5 h-3.5 rounded cursor-pointer"
                style={{ accentColor: colors.accent }}
              />
            </div>

            {/* HEX Toggle */}
            <div className="w-12 flex justify-center">
              <button
                onClick={() => handleCommandChange(index, 'isHex', !command.isHex)}
                className="px-1.5 py-0.5 text-xs font-mono rounded transition-colors"
                style={{
                  backgroundColor: command.isHex ? colors.accent : colors.bgInput,
                  color: command.isHex ? '#ffffff' : colors.textTertiary,
                  border: `1px solid ${command.isHex ? colors.accent : colors.border}`
                }}
                disabled={disabled}
              >
                HEX
              </button>
            </div>

            {/* Command Input */}
            <div className="flex-1 px-2">
              <input
                type="text"
                value={command.content}
                onChange={(e) => handleCommandChange(index, 'content', e.target.value)}
                placeholder={command.isHex ? t('quickCommand.hexPlaceholder') : t('quickCommand.textPlaceholder')}
                className="w-full px-2 py-1 text-sm font-mono rounded focus:outline-none focus:ring-1"
                style={{
                  backgroundColor: colors.bgInput,
                  border: `1px solid ${colors.border}`,
                  color: colors.textPrimary,
                  '--tw-ring-color': colors.accent
                } as React.CSSProperties}
                disabled={disabled}
              />
            </div>

            {/* Line Ending Dropdown */}
            <div className="w-20 flex justify-center">
              <select
                value={command.lineEnding}
                onChange={(e) => handleCommandChange(index, 'lineEnding', e.target.value as LineEnding)}
                className="w-full px-1 py-1 text-xs rounded focus:outline-none"
                style={{
                  backgroundColor: colors.bgInput,
                  border: `1px solid ${colors.border}`,
                  color: colors.textSecondary
                }}
                disabled={disabled}
              >
                {lineEndingOptions.map(opt => (
                  <option key={opt.value} value={opt.value} style={{ backgroundColor: colors.bgSidebar }}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Send Button with Index */}
            <div className="w-12 flex justify-center">
              <button
                onClick={() => handleSendSingle(command)}
                disabled={disabled || !command.content.trim()}
                className="px-2 py-1 text-xs font-medium rounded transition-all"
                style={{
                  backgroundColor: !disabled && command.content.trim() ? colors.accent : colors.bgSurface,
                  color: !disabled && command.content.trim() ? '#ffffff' : colors.textTertiary,
                  opacity: disabled || !command.content.trim() ? 0.5 : 1,
                  cursor: disabled || !command.content.trim() ? 'not-allowed' : 'pointer'
                }}
                title={`${t('quickCommand.sendCommand')} #${index + 1}`}
              >
                {index + 1}
              </button>
            </div>
          </div>
        ))}

        {/* Add More Button */}
        {currentList.commands.length < MAX_COMMANDS && (
          <div className="flex justify-center py-3">
            <button
              onClick={handleAddMoreCommands}
              className="flex items-center space-x-1.5 px-4 py-1.5 text-xs rounded-md transition-colors"
              style={{
                backgroundColor: colors.bgInput,
                border: `1px solid ${colors.border}`,
                color: colors.textSecondary
              }}
            >
              <Plus size={14} />
              <span>{t('quickCommand.addMore')} ({currentList.commands.length}/{MAX_COMMANDS})</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{
          borderTop: `1px solid ${colors.borderDark}`,
          backgroundColor: colors.bgSurface
        }}
      >
        {/* List Selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsListDropdownOpen(!isListDropdownOpen)}
            className="flex items-center space-x-2 px-3 py-1.5 text-sm rounded-md transition-colors"
            style={{
              backgroundColor: colors.bgInput,
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary
            }}
          >
            <span className="max-w-32 truncate">{currentList.name}</span>
            <ChevronDown size={14} style={{ color: colors.textTertiary }} />
          </button>

          {/* Dropdown Menu */}
          {isListDropdownOpen && (
            <div
              className="absolute bottom-full left-0 mb-1 w-56 rounded-lg shadow-lg overflow-hidden z-50"
              style={{
                backgroundColor: colors.bgSidebar,
                border: `1px solid ${colors.border}`
              }}
            >
              <div className="max-h-48 overflow-y-auto">
                {lists.map(list => (
                  <div
                    key={list.id}
                    className="flex items-center px-3 py-2 cursor-pointer group"
                    style={{
                      backgroundColor: list.id === currentListId ? `${colors.accent}20` : 'transparent'
                    }}
                    onClick={() => {
                      if (editingListId !== list.id) {
                        onCurrentListChange(list.id);
                        setIsListDropdownOpen(false);
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (list.id !== currentListId) {
                        e.currentTarget.style.backgroundColor = colors.bgHover;
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = list.id === currentListId ? `${colors.accent}20` : 'transparent';
                    }}
                  >
                    {editingListId === list.id ? (
                      <div className="flex-1 flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1 px-2 py-0.5 text-sm rounded focus:outline-none"
                          style={{
                            backgroundColor: colors.bgInput,
                            border: `1px solid ${colors.accent}`,
                            color: colors.textPrimary
                          }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEditName();
                            if (e.key === 'Escape') handleCancelEditName();
                          }}
                        />
                        <button onClick={handleSaveEditName} className="p-1 rounded" style={{ color: colors.success }}>
                          <Check size={14} />
                        </button>
                        <button onClick={handleCancelEditName} className="p-1 rounded" style={{ color: colors.error }}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 text-sm truncate" style={{ color: colors.textPrimary }}>
                          {list.name}
                        </span>
                        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditName(list);
                            }}
                            className="p-1 rounded hover:bg-opacity-20"
                            style={{ color: colors.textTertiary }}
                            title={t('quickCommand.rename')}
                          >
                            <Edit2 size={12} />
                          </button>
                          {lists.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteList(list.id);
                              }}
                              className="p-1 rounded hover:bg-opacity-20"
                              style={{ color: colors.error }}
                              title={t('quickCommand.delete')}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Create New List */}
              <div
                className="flex items-center space-x-2 px-3 py-2 cursor-pointer"
                style={{
                  borderTop: `1px solid ${colors.border}`,
                  color: colors.accent
                }}
                onClick={handleCreateNewList}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Plus size={14} />
                <span className="text-sm">{t('quickCommand.newList')}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right side controls */}
        <div className="flex items-center space-x-2">
          {/* Loop Interval Input */}
          <div className="flex items-center space-x-1">
            <input
              type="number"
              value={loopInterval}
              onChange={(e) => handleLoopIntervalChange(e.target.value)}
              onBlur={(e) => handleLoopIntervalChange(e.target.value)}
              min={MIN_LOOP_INTERVAL}
              max={MAX_LOOP_INTERVAL}
              disabled={disabled || isLooping}
              className="w-16 px-2 py-1 text-xs font-mono rounded focus:outline-none focus:ring-1 text-center"
              style={{
                backgroundColor: colors.bgInput,
                border: `1px solid ${colors.border}`,
                color: colors.textPrimary,
                '--tw-ring-color': colors.accent,
                opacity: isLooping ? 0.5 : 1
              } as React.CSSProperties}
              title={t('quickCommand.loopIntervalTitle')}
            />
            <span className="text-xs" style={{ color: colors.textTertiary }}>ms</span>
          </div>

          {/* Loop Status Indicator */}
          {isLooping && (
            <div
              className="flex items-center space-x-1 px-2 py-1 rounded text-xs"
              style={{
                backgroundColor: `${colors.accent}20`,
                color: colors.accent
              }}
            >
              <RefreshCw size={12} className="animate-spin" />
              <span>{t('quickCommand.loop')}: {iterationCount}</span>
            </div>
          )}

          {/* Loop Send / Stop Button */}
          {isLooping ? (
            <button
              onClick={stopLoop}
              className="flex items-center space-x-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all"
              style={{
                backgroundColor: colors.error,
                color: '#ffffff',
                cursor: 'pointer'
              }}
            >
              <Square size={14} />
              <span>{t('quickCommand.stop')}</span>
            </button>
          ) : (
            <button
              onClick={startLoop}
              disabled={disabled || selectedCount === 0}
              className="flex items-center space-x-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all"
              style={{
                backgroundColor: !disabled && selectedCount > 0 ? colors.success : colors.bgSurface,
                color: !disabled && selectedCount > 0 ? '#ffffff' : colors.textTertiary,
                opacity: disabled || selectedCount === 0 ? 0.5 : 1,
                cursor: disabled || selectedCount === 0 ? 'not-allowed' : 'pointer'
              }}
              title={t('quickCommand.loopSendTitle')}
            >
              <RefreshCw size={14} />
              <span>{t('quickCommand.loopSend')}</span>
            </button>
          )}

          {/* Send Selected Button */}
          <button
            onClick={handleSendAllSelected}
            disabled={disabled || selectedCount === 0 || isLooping}
            className="flex items-center space-x-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all"
            style={{
              backgroundColor: !disabled && selectedCount > 0 && !isLooping ? colors.accent : colors.bgSurface,
              color: !disabled && selectedCount > 0 && !isLooping ? '#ffffff' : colors.textTertiary,
              opacity: disabled || selectedCount === 0 || isLooping ? 0.5 : 1,
              cursor: disabled || selectedCount === 0 || isLooping ? 'not-allowed' : 'pointer'
            }}
          >
            <Play size={14} />
            <span>{t('quickCommand.listSend')} {selectedCount > 0 ? `(${selectedCount})` : ''}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickCommandPanel;
