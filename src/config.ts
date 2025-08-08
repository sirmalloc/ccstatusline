import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

// Ensure fs.promises compatibility
const readFile = fs.promises?.readFile || promisify(fs.readFile);
const writeFile = fs.promises?.writeFile || promisify(fs.writeFile);
const mkdir = fs.promises?.mkdir || promisify(fs.mkdir);

export type StatusItemType = 'model' | 'git-branch' | 'separator' | 'flex-separator' | 
  'tokens-input' | 'tokens-output' | 'tokens-cached' | 'tokens-total' | 'context-length' | 'context-percentage';

export interface StatusItem {
  id: string;
  type: StatusItemType;
  color?: string;
}

export interface Settings {
  items: StatusItem[];
  colors: {
    model: string;
    gitBranch: string;
    separator: string;
  };
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'ccstatusline');
const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json');

export const DEFAULT_SETTINGS: Settings = {
  items: [
    { id: '1', type: 'model', color: 'cyan' },
    { id: '2', type: 'separator' },
    { id: '3', type: 'git-branch', color: 'magenta' },
  ],
  colors: {
    model: 'cyan',
    gitBranch: 'magenta',
    separator: 'dim',
  },
};

export async function loadSettings(): Promise<Settings> {
  try {
    // Use Node.js-compatible file reading
    if (!fs.existsSync(SETTINGS_PATH)) {
      return DEFAULT_SETTINGS;
    }
    
    const content = await readFile(SETTINGS_PATH, 'utf-8');
    const loaded = JSON.parse(content);
    
    // Migrate old format if needed
    if (loaded.elements || loaded.layout) {
      return migrateOldSettings(loaded);
    }
    
    return { ...DEFAULT_SETTINGS, ...loaded };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function migrateOldSettings(old: any): Settings {
  const items: StatusItem[] = [];
  let id = 1;
  
  if (old.elements?.model) {
    items.push({ id: String(id++), type: 'model', color: old.colors?.model });
  }
  
  if (items.length > 0 && old.elements?.gitBranch) {
    items.push({ id: String(id++), type: 'separator' });
  }
  
  if (old.elements?.gitBranch) {
    items.push({ id: String(id++), type: 'git-branch', color: old.colors?.gitBranch });
  }
  
  if (old.layout?.expandingSeparators) {
    // Replace regular separators with flex separators
    items.forEach(item => {
      if (item.type === 'separator') {
        item.type = 'flex-separator';
      }
    });
  }
  
  return {
    items,
    colors: old.colors || DEFAULT_SETTINGS.colors,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  // Ensure config directory exists
  await mkdir(CONFIG_DIR, { recursive: true });
  
  // Write settings using Node.js-compatible API
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}