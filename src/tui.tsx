import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import chalk from 'chalk';
import { loadSettings, saveSettings, type Settings, type StatusItem, type StatusItemType } from './config';
import { isInstalled, installStatusLine, uninstallStatusLine, getExistingStatusLine } from './claude-settings';

interface StatusLinePreviewProps {
  items: StatusItem[];
  terminalWidth: number;
}

const StatusLinePreview: React.FC<StatusLinePreviewProps> = ({ items, terminalWidth }) => {
  const width = 80; // Status line is always 80 chars max
  const elements: string[] = [];
  let hasFlexSeparator = false;
  
  items.forEach(item => {
    switch (item.type) {
      case 'model':
        const modelColor = (chalk as any)[item.color || 'cyan'] || chalk.cyan;
        elements.push(modelColor('Model: Claude'));
        break;
      case 'git-branch':
        const branchColor = (chalk as any)[item.color || 'magenta'] || chalk.magenta;
        elements.push(branchColor('⎇ main'));
        break;
      case 'tokens-input':
        const inputColor = (chalk as any)[item.color || 'yellow'] || chalk.yellow;
        elements.push(inputColor('In: 15.2k'));
        break;
      case 'tokens-output':
        const outputColor = (chalk as any)[item.color || 'green'] || chalk.green;
        elements.push(outputColor('Out: 3.4k'));
        break;
      case 'tokens-cached':
        const cachedColor = (chalk as any)[item.color || 'blue'] || chalk.blue;
        elements.push(cachedColor('Cached: 12k'));
        break;
      case 'tokens-total':
        const totalColor = (chalk as any)[item.color || 'white'] || chalk.white;
        elements.push(totalColor('Total: 30.6k'));
        break;
      case 'context-length':
        const ctxColor = (chalk as any)[item.color || 'cyan'] || chalk.cyan;
        elements.push(ctxColor('Ctx: 18.6k'));
        break;
      case 'context-percentage':
        const ctxPctColor = (chalk as any)[item.color || 'cyan'] || chalk.cyan;
        elements.push(ctxPctColor('Ctx: 9.3%'));
        break;
      case 'separator':
        elements.push(chalk.dim(' | '));
        break;
      case 'flex-separator':
        elements.push('FLEX');
        hasFlexSeparator = true;
        break;
    }
  });
  
  // Build the status line with flex separator support
  let statusLine = '';
  if (hasFlexSeparator) {
    const parts: string[][] = [[]];
    let currentPart = 0;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type === 'flex-separator') {
        currentPart++;
        parts[currentPart] = [];
      } else {
        const element = elements[i];
        if (element !== 'FLEX') {
          parts[currentPart].push(element);
        }
      }
    }
    
    // Calculate total length of all non-flex content
    const partLengths = parts.map(part => {
      const joined = part.join('');
      return joined.replace(/\x1b\[[0-9;]*m/g, '').length;
    });
    const totalContentLength = partLengths.reduce((sum, len) => sum + len, 0);
    
    // Calculate space to distribute among flex separators
    const flexCount = parts.length - 1; // Number of flex separators
    const totalSpace = Math.max(0, width - totalContentLength);
    const spacePerFlex = flexCount > 0 ? Math.floor(totalSpace / flexCount) : 0;
    const extraSpace = flexCount > 0 ? totalSpace % flexCount : 0;
    
    // Build the status line with distributed spacing
    statusLine = '';
    for (let i = 0; i < parts.length; i++) {
      statusLine += parts[i].join('');
      if (i < parts.length - 1) {
        // Add flex spacing
        const spaces = spacePerFlex + (i < extraSpace ? 1 : 0);
        statusLine += ' '.repeat(spaces);
      }
    }
  } else {
    statusLine = elements.filter(e => e !== 'FLEX').join('');
  }
  
  // Build the Claude Code input box - account for ink's padding
  const boxWidth = Math.min(terminalWidth - 4, process.stdout.columns - 4 || 76);
  const topLine = chalk.dim('╭' + '─'.repeat(Math.max(0, boxWidth - 2)) + '╮');
  const middleLine = chalk.dim('│') + ' > ' + ' '.repeat(Math.max(0, boxWidth - 5)) + chalk.dim('│');
  const bottomLine = chalk.dim('╰' + '─'.repeat(Math.max(0, boxWidth - 2)) + '╯');
  
  return (
    <Box flexDirection="column">
      <Text>{topLine}</Text>
      <Text>{middleLine}</Text>
      <Text>{bottomLine}</Text>
      <Text>{statusLine}</Text>
    </Box>
  );
};

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ message, onConfirm, onCancel }) => {
  const items = [
    { label: '✅ Yes', value: 'yes' },
    { label: '❌ No', value: 'no' },
  ];
  
  return (
    <Box flexDirection="column">
      <Text>{message}</Text>
      <Box marginTop={1}>
        <SelectInput 
          items={items} 
          onSelect={(item) => item.value === 'yes' ? onConfirm() : onCancel()} 
        />
      </Box>
    </Box>
  );
};

interface MainMenuProps {
  onSelect: (value: string) => void;
  isClaudeInstalled: boolean;
  hasChanges: boolean;
}

const MainMenu: React.FC<MainMenuProps> = ({ onSelect, isClaudeInstalled, hasChanges }) => {
  const items = [
    { label: '📝 Edit Status Line Items', value: 'items' },
    { label: '🎨 Configure Colors', value: 'colors' },
    { label: isClaudeInstalled ? '🗑️  Uninstall from Claude Code' : '📦 Install to Claude Code', value: 'install' },
  ];
  
  if (hasChanges) {
    items.push(
      { label: '💾 Save & Exit', value: 'save' },
      { label: '❌ Exit without saving', value: 'exit' }
    );
  } else {
    items.push({ label: '🚪 Exit', value: 'exit' });
  }
  
  return (
    <Box flexDirection="column">
      <Text bold>Main Menu</Text>
      <Box marginTop={1}>
        <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      </Box>
    </Box>
  );
};

interface ItemsEditorProps {
  items: StatusItem[];
  onUpdate: (items: StatusItem[]) => void;
  onBack: () => void;
}

const ItemsEditor: React.FC<ItemsEditorProps> = ({ items, onUpdate, onBack }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [moveMode, setMoveMode] = useState(false);
  
  useInput((input, key) => {
    if (moveMode) {
      // In move mode, use up/down to move the selected item
      if (key.upArrow && selectedIndex > 0) {
        const newItems = [...items];
        [newItems[selectedIndex], newItems[selectedIndex - 1]] = 
          [newItems[selectedIndex - 1], newItems[selectedIndex]];
        onUpdate(newItems);
        setSelectedIndex(selectedIndex - 1);
      } else if (key.downArrow && selectedIndex < items.length - 1) {
        const newItems = [...items];
        [newItems[selectedIndex], newItems[selectedIndex + 1]] = 
          [newItems[selectedIndex + 1], newItems[selectedIndex]];
        onUpdate(newItems);
        setSelectedIndex(selectedIndex + 1);
      } else if (key.escape || key.return) {
        // Exit move mode
        setMoveMode(false);
      }
    } else {
      // Normal mode
      if (key.upArrow) {
        setSelectedIndex(Math.max(0, selectedIndex - 1));
      } else if (key.downArrow) {
        setSelectedIndex(Math.min(items.length - 1, selectedIndex + 1));
      } else if (key.leftArrow && items.length > 0) {
        // Toggle item type backwards
        const types: StatusItemType[] = ['model', 'git-branch', 'separator', 'flex-separator', 
          'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage'];
        const currentType = items[selectedIndex].type;
        const currentIndex = types.indexOf(currentType);
        const prevIndex = currentIndex === 0 ? types.length - 1 : currentIndex - 1;
        const newItems = [...items];
        newItems[selectedIndex] = { ...newItems[selectedIndex], type: types[prevIndex] };
        onUpdate(newItems);
      } else if (key.rightArrow && items.length > 0) {
        // Toggle item type forwards
        const types: StatusItemType[] = ['model', 'git-branch', 'separator', 'flex-separator',
          'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage'];
        const currentType = items[selectedIndex].type;
        const currentIndex = types.indexOf(currentType);
        const nextIndex = (currentIndex + 1) % types.length;
        const newItems = [...items];
        newItems[selectedIndex] = { ...newItems[selectedIndex], type: types[nextIndex] };
        onUpdate(newItems);
      } else if (key.return && items.length > 0) {
        // Enter move mode
        setMoveMode(true);
      } else if (input === 'a') {
        // Add item at end
        const newItem: StatusItem = {
          id: Date.now().toString(),
          type: 'separator',
        };
        onUpdate([...items, newItem]);
      } else if (input === 'i') {
        // Insert item after selected
        const newItem: StatusItem = {
          id: Date.now().toString(),
          type: 'separator',
        };
        const newItems = [...items];
        newItems.splice(selectedIndex + 1, 0, newItem);
        onUpdate(newItems);
        setSelectedIndex(selectedIndex + 1);
      } else if (input === 'd' && items.length > 0) {
        // Delete selected item
        const newItems = items.filter((_, i) => i !== selectedIndex);
        onUpdate(newItems);
        if (selectedIndex >= newItems.length && selectedIndex > 0) {
          setSelectedIndex(selectedIndex - 1);
        }
      } else if (key.escape) {
        onBack();
      }
    }
  });
  
  const getItemDisplay = (item: StatusItem) => {
    switch (item.type) {
      case 'model':
        return chalk.cyan('Model');
      case 'git-branch':
        return chalk.magenta('Git Branch');
      case 'separator':
        return chalk.dim('Separator |');
      case 'flex-separator':
        return chalk.yellow('Flex Separator ─────');
      case 'tokens-input':
        return chalk.yellow('Tokens Input');
      case 'tokens-output':
        return chalk.green('Tokens Output');
      case 'tokens-cached':
        return chalk.blue('Tokens Cached');
      case 'tokens-total':
        return chalk.white('Tokens Total');
      case 'context-length':
        return chalk.cyan('Context Length');
      case 'context-percentage':
        return chalk.cyan('Context %');
    }
  };
  
  return (
    <Box flexDirection="column">
      <Text bold>Edit Status Line Items {moveMode && <Text color="yellow">[MOVE MODE]</Text>}</Text>
      {moveMode ? (
        <Text dim>↑↓ to move item, ESC or Enter to exit move mode</Text>
      ) : (
        <Text dim>↑↓ select, ←→ change type, Enter to move, (a)dd, (i)nsert, (d)elete, ESC back</Text>
      )}
      <Box marginTop={1} flexDirection="column">
        {items.length === 0 ? (
          <Text dim>No items. Press 'a' to add one.</Text>
        ) : (
          items.map((item, index) => (
            <Box key={item.id}>
              <Text color={index === selectedIndex ? (moveMode ? 'yellow' : 'green') : undefined}>
                {index === selectedIndex ? (moveMode ? '◆ ' : '▶ ') : '  '}
                {index + 1}. {getItemDisplay(item)}
              </Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
};

interface ColorMenuProps {
  items: StatusItem[];
  onUpdate: (items: StatusItem[]) => void;
  onBack: () => void;
}

const ColorMenu: React.FC<ColorMenuProps> = ({ items, onUpdate, onBack }) => {
  const colorableItems = items.filter(item => 
    ['model', 'git-branch', 'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage'].includes(item.type)
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Handle ESC key
  useInput((input, key) => {
    if (key.escape) {
      onBack();
    }
  });
  
  if (colorableItems.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>Configure Colors</Text>
        <Text dim marginTop={1}>No colorable items in the status line.</Text>
        <Text dim>Add a Model or Git Branch item first.</Text>
        <Text marginTop={1}>Press any key to go back...</Text>
        {useInput(() => onBack())}
      </Box>
    );
  }
  
  const getItemLabel = (item: StatusItem) => {
    switch (item.type) {
      case 'model': return 'Model';
      case 'git-branch': return 'Git Branch';
      case 'tokens-input': return 'Tokens Input';
      case 'tokens-output': return 'Tokens Output';
      case 'tokens-cached': return 'Tokens Cached';
      case 'tokens-total': return 'Tokens Total';
      case 'context-length': return 'Context Length';
      case 'context-percentage': return 'Context Percentage';
      default: return item.type;
    }
  };
  
  // Create menu items with colored labels
  const menuItems = colorableItems.map((item, index) => {
    const color = item.color || 'white';
    const colorFunc = (chalk as any)[color] || chalk.white;
    return {
      label: colorFunc(`${getItemLabel(item)} #${index + 1}`),
      value: item.id,
    };
  });
  menuItems.push({ label: '← Back', value: 'back' });
  
  const handleSelect = (selected: { value: string }) => {
    if (selected.value === 'back') {
      onBack();
    } else {
      // Cycle through colors
      const newItems = items.map(item => {
        if (item.id === selected.value) {
          const currentColorIndex = colors.indexOf(item.color || 'white');
          const nextColor = colors[(currentColorIndex + 1) % colors.length];
          return { ...item, color: nextColor };
        }
        return item;
      });
      onUpdate(newItems);
    }
  };
  
  const handleHighlight = (item: { value: string }) => {
    if (item.value !== 'back') {
      const itemIndex = colorableItems.findIndex(i => i.id === item.value);
      if (itemIndex !== -1) {
        setSelectedIndex(itemIndex);
      }
    }
  };
  
  // Color list for cycling
  const colors = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
                  'gray', 'redBright', 'greenBright', 'yellowBright', 'blueBright',
                  'magentaBright', 'cyanBright', 'whiteBright'];
  
  // Get current color for selected item (if a valid colorable item is selected)
  const selectedItem = selectedIndex < colorableItems.length ? colorableItems[selectedIndex] : null;
  const currentColor = selectedItem ? (selectedItem.color || 'white') : 'white';
  const colorIndex = colors.indexOf(currentColor);
  const colorNumber = colorIndex === -1 ? 8 : colorIndex + 1; // Default to white (8) if not found
  const colorDisplay = (chalk as any)[currentColor] ? (chalk as any)[currentColor](currentColor) : chalk.white(currentColor);
  
  return (
    <Box flexDirection="column">
      <Text bold>Configure Colors</Text>
      <Text dim>↑↓ to select item, Enter to cycle color, ESC to go back</Text>
      {selectedItem && (
        <Text marginTop={1}>
          Current color ({colorNumber}/{colors.length}): {colorDisplay}
        </Text>
      )}
      <Box marginTop={1}>
        <SelectInput 
          items={menuItems} 
          onSelect={handleSelect}
          onHighlight={handleHighlight}
          initialIndex={selectedIndex}
        />
      </Box>
    </Box>
  );
};

const App: React.FC = () => {
  const { exit } = useApp();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [screen, setScreen] = useState<'main' | 'items' | 'colors' | 'confirm'>('main');
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; action: () => Promise<void> } | null>(null);
  const [isClaudeInstalled, setIsClaudeInstalled] = useState(false);
  const [terminalWidth, setTerminalWidth] = useState(process.stdout.columns || 80);
  
  useEffect(() => {
    loadSettings().then(loadedSettings => {
      setSettings(loadedSettings);
      setOriginalSettings(JSON.parse(JSON.stringify(loadedSettings))); // Deep copy
    });
    isInstalled().then(setIsClaudeInstalled);
    
    const handleResize = () => {
      setTerminalWidth(process.stdout.columns || 80);
    };
    
    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);
  
  // Check for changes whenever settings update
  useEffect(() => {
    if (settings && originalSettings) {
      const hasAnyChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);
      setHasChanges(hasAnyChanges);
    }
  }, [settings, originalSettings]);
  
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  });
  
  if (!settings) {
    return <Text>Loading settings...</Text>;
  }
  
  const handleInstallUninstall = async () => {
    if (isClaudeInstalled) {
      // Uninstall
      setConfirmDialog({
        message: 'This will remove ccstatusline from ~/.claude/settings.json. Continue?',
        action: async () => {
          await uninstallStatusLine();
          setIsClaudeInstalled(false);
          setScreen('main');
          setConfirmDialog(null);
        }
      });
      setScreen('confirm');
    } else {
      // Always ask for consent before modifying Claude settings
      const existing = await getExistingStatusLine();
      let message: string;
      
      if (existing && existing !== 'npx ccstatusline') {
        message = `This will modify ~/.claude/settings.json\n\nA status line is already configured: "${existing}"\nReplace it with ccstatusline?`;
      } else if (existing === 'npx ccstatusline') {
        message = 'ccstatusline is already installed in ~/.claude/settings.json\nReinstall it?';
      } else {
        message = 'This will modify ~/.claude/settings.json to add ccstatusline.\nContinue?';
      }
      
      setConfirmDialog({
        message,
        action: async () => {
          await installStatusLine();
          setIsClaudeInstalled(true);
          setScreen('main');
          setConfirmDialog(null);
        }
      });
      setScreen('confirm');
    }
  };
  
  const handleMainMenuSelect = async (value: string) => {
    switch (value) {
      case 'items':
        setScreen('items');
        break;
      case 'colors':
        setScreen('colors');
        break;
      case 'install':
        await handleInstallUninstall();
        break;
      case 'save':
        await saveSettings(settings);
        setOriginalSettings(JSON.parse(JSON.stringify(settings))); // Update original after save
        setHasChanges(false);
        exit();
        break;
      case 'exit':
        exit();
        break;
    }
  };
  
  const updateItems = (items: StatusItem[]) => {
    setSettings({ ...settings, items });
  };
  
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">🎨 CCStatusline Configuration</Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text dim>Preview:</Text>
      </Box>
      <StatusLinePreview items={settings.items} terminalWidth={terminalWidth} />
      
      <Box marginTop={2}>
        {screen === 'main' && <MainMenu onSelect={handleMainMenuSelect} isClaudeInstalled={isClaudeInstalled} hasChanges={hasChanges} />}
        {screen === 'items' && (
          <ItemsEditor 
            items={settings.items}
            onUpdate={updateItems}
            onBack={() => setScreen('main')} 
          />
        )}
        {screen === 'colors' && (
          <ColorMenu 
            items={settings.items}
            onUpdate={updateItems}
            onBack={() => setScreen('main')} 
          />
        )}
        {screen === 'confirm' && confirmDialog && (
          <ConfirmDialog
            message={confirmDialog.message}
            onConfirm={confirmDialog.action}
            onCancel={() => {
              setScreen('main');
              setConfirmDialog(null);
            }}
          />
        )}
      </Box>
    </Box>
  );
};

export function runTUI() {
  render(<App />);
}