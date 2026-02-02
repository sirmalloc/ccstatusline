import { execSync } from 'child_process';
import os from 'os';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

function formatBytes(bytes: number): string {
    const GB = 1024 ** 3;
    const MB = 1024 ** 2;
    const KB = 1024;

    if (bytes >= GB) return `${(bytes / GB).toFixed(1)}G`;
    if (bytes >= MB) return `${(bytes / MB).toFixed(0)}M`;
    if (bytes >= KB) return `${(bytes / KB).toFixed(0)}K`;
    return `${bytes}B`;
}

// Get memory usage like htop does on macOS (Active + Wired)
function getUsedMemoryMacOS(): number | null {
    try {
        const output = execSync('vm_stat', { encoding: 'utf8' });
        const lines = output.split('\n');

        // Parse page size from first line: "Mach Virtual Memory Statistics: (page size of 16384 bytes)"
        const pageSizeMatch = lines[0].match(/page size of (\d+) bytes/);
        if (!pageSizeMatch) return null;
        const pageSize = parseInt(pageSizeMatch[1], 10);

        // Parse page counts
        let activePages = 0;
        let wiredPages = 0;

        for (const line of lines) {
            const activeMatch = line.match(/Pages active:\s+(\d+)/);
            if (activeMatch) {
                activePages = parseInt(activeMatch[1], 10);
            }
            const wiredMatch = line.match(/Pages wired down:\s+(\d+)/);
            if (wiredMatch) {
                wiredPages = parseInt(wiredMatch[1], 10);
            }
        }

        return (activePages + wiredPages) * pageSize;
    } catch {
        return null;
    }
}

export class FreeMemoryWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows system memory usage (used/total)'; }
    getDisplayName(): string { return 'Memory Usage'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '12.4G/16.0G' : 'Mem: 12.4G/16.0G';
        }

        const total = os.totalmem();
        let used: number;

        if (process.platform === 'darwin') {
            // Use htop-style calculation on macOS
            used = getUsedMemoryMacOS() ?? (total - os.freemem());
        } else {
            // Fallback for other platforms
            used = total - os.freemem();
        }

        const value = `${formatBytes(used)}/${formatBytes(total)}`;

        return item.rawValue ? value : `Mem: ${value}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}