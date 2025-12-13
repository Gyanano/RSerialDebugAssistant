import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, ChevronDown, Edit2, Check, X, Trash2, Play, Square, RefreshCw } from 'lucide-react';
import { QuickCommand, QuickCommandList, LineEnding } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../i18n';
import { getTextEncoding, textToHex, hexToText } from '../utils/encoding';

// shadcn components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

// Format hex input: filter non-hex chars, add spaces every 2 chars
const formatHexInput = (input: string): string => {
  // Remove all spaces first
  const withoutSpaces = input.replace(/\s/g, '');

  // Filter to only valid hex characters (0-9, A-F, a-f) and convert to uppercase
  const hexOnly = withoutSpaces.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();

  // Add space after every 2 characters
  const pairs: string[] = [];
  for (let i = 0; i < hexOnly.length; i += 2) {
    pairs.push(hexOnly.substring(i, i + 2));
  }

  return pairs.join(' ');
};

const createEmptyCommand = (): QuickCommand => ({
  id: crypto.randomUUID(),
  name: '',
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

  // Track which command index is currently being converted (for disabling input during async conversion)
  const [convertingIndex, setConvertingIndex] = useState<number | null>(null);

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
    const command = currentList.commands[index];
    let processedValue = value;

    // If changing content in hex mode, apply hex formatting
    if (field === 'content' && command.isHex) {
      processedValue = formatHexInput(value);
    }

    const updatedCommands = [...currentList.commands];
    updatedCommands[index] = { ...updatedCommands[index], [field]: processedValue };
    updateCurrentList(updatedCommands);
  };

  // Handle hex toggle with automatic text↔hex conversion
  const handleHexToggle = useCallback(async (index: number) => {
    const command = currentList.commands[index];
    const newIsHex = !command.isHex;

    // Skip conversion if content is empty
    if (!command.content.trim()) {
      handleCommandChange(index, 'isHex', newIsHex);
      return;
    }

    setConvertingIndex(index);
    try {
      const encoding = getTextEncoding();
      let newContent: string;

      if (newIsHex) {
        // Converting text to hex
        newContent = await textToHex(command.content, encoding);
      } else {
        // Converting hex to text
        newContent = await hexToText(command.content, encoding);
      }

      const updatedCommands = [...currentList.commands];
      updatedCommands[index] = { ...updatedCommands[index], isHex: newIsHex, content: newContent };
      updateCurrentList(updatedCommands);
    } catch (error) {
      console.error('Error converting format:', error);
      // Still toggle the mode even if conversion fails
      handleCommandChange(index, 'isHex', newIsHex);
    } finally {
      setConvertingIndex(null);
    }
  }, [currentList.commands, currentListId, lists, onListsChange]);

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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Checkbox
                      checked={currentList.commands.length > 0 && currentList.commands.every(c => c.selected)}
                      onCheckedChange={handleSelectAll}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('quickCommand.selectAll')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="w-24 text-center">{t('quickCommand.name')}</div>
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
              <Checkbox
                checked={command.selected}
                onCheckedChange={(checked) => handleCommandChange(index, 'selected', checked)}
              />
            </div>

            {/* Name Input */}
            <div className="w-24 px-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Input
                      type="text"
                      value={command.name || ''}
                      onChange={(e) => handleCommandChange(index, 'name', e.target.value)}
                      placeholder=""
                      className="w-full h-7 px-1.5 text-xs"
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('quickCommand.namePlaceholder')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* HEX Toggle */}
            <div className="w-12 flex justify-center">
              <Button
                variant={command.isHex ? 'default' : 'secondary'}
                size="sm"
                className="px-1.5 py-0.5 h-6 text-xs font-mono"
                onClick={() => handleHexToggle(index)}
                disabled={convertingIndex === index}
              >
                HEX
              </Button>
            </div>

            {/* Command Input */}
            <div className="flex-1 px-2">
              <Input
                type="text"
                value={command.content}
                onChange={(e) => handleCommandChange(index, 'content', e.target.value)}
                placeholder={command.isHex ? t('quickCommand.hexPlaceholder') : t('quickCommand.textPlaceholder')}
                className="w-full h-7 text-sm font-mono"
                disabled={convertingIndex === index}
              />
            </div>

            {/* Line Ending Dropdown */}
            <div className="w-20 flex justify-center">
              <Select
                value={command.lineEnding}
                onValueChange={(value) => handleCommandChange(index, 'lineEnding', value as LineEnding)}
              >
                <SelectTrigger className="h-7 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lineEndingOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Send Button with Index */}
            <div className="w-12 flex justify-center">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={!disabled && command.content.trim() ? 'default' : 'secondary'}
                      size="sm"
                      className="px-2 py-1 h-6 text-xs font-medium"
                      onClick={() => handleSendSingle(command)}
                      disabled={disabled || !command.content.trim()}
                    >
                      {index + 1}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{`${t('quickCommand.sendCommand')} #${index + 1}`}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        ))}

        {/* Add More Button */}
        {currentList.commands.length < MAX_COMMANDS && (
          <div className="flex justify-center py-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddMoreCommands}
              className="flex items-center space-x-1.5 text-xs"
            >
              <Plus size={14} />
              <span>{t('quickCommand.addMore')} ({currentList.commands.length}/{MAX_COMMANDS})</span>
            </Button>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsListDropdownOpen(!isListDropdownOpen)}
            className="flex items-center space-x-2"
          >
            <span className="max-w-32 truncate">{currentList.name}</span>
            <ChevronDown size={14} />
          </Button>

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
                        <Input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1 h-7 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEditName();
                            if (e.key === 'Escape') handleCancelEditName();
                          }}
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleSaveEditName}>
                          <Check size={14} style={{ color: colors.success }} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCancelEditName}>
                          <X size={14} style={{ color: colors.error }} />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 text-sm truncate" style={{ color: colors.textPrimary }}>
                          {list.name}
                        </span>
                        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartEditName(list);
                                  }}
                                >
                                  <Edit2 size={12} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t('quickCommand.rename')}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {lists.length > 1 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteList(list.id);
                                    }}
                                  >
                                    <Trash2 size={12} style={{ color: colors.error }} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t('quickCommand.delete')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Input
                    type="number"
                    value={loopInterval}
                    onChange={(e) => handleLoopIntervalChange(e.target.value)}
                    onBlur={(e) => handleLoopIntervalChange(e.target.value)}
                    min={MIN_LOOP_INTERVAL}
                    max={MAX_LOOP_INTERVAL}
                    disabled={disabled || isLooping}
                    className="w-24 h-7 text-xs font-mono text-center"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('quickCommand.loopIntervalTitle')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
            <Button
              variant="destructive"
              size="sm"
              onClick={stopLoop}
              className="flex items-center space-x-2"
            >
              <Square size={14} />
              <span>{t('quickCommand.stop')}</span>
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={startLoop}
                    disabled={disabled || selectedCount === 0}
                    className="flex items-center space-x-2"
                  >
                    <RefreshCw size={14} />
                    <span>{t('quickCommand.loopSend')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('quickCommand.loopSendTitle')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Send Selected Button */}
          <Button
            variant="default"
            size="sm"
            onClick={handleSendAllSelected}
            disabled={disabled || selectedCount === 0 || isLooping}
            className="flex items-center space-x-2"
          >
            <Play size={14} />
            <span>{t('quickCommand.listSend')} {selectedCount > 0 ? `(${selectedCount})` : ''}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default QuickCommandPanel;
