import { execSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

const STATE_SYMBOLS: Record<string, string> = {
    running: '▲',
    exited: '■',
    paused: '◐',
    restarting: '↻',
    created: '◌',
    removing: '◌',
    dead: '✗'
};

function symbolFor(state: string): string {
    return STATE_SYMBOLS[state.toLowerCase()] ?? '?';
}

interface DockerContainer {
    name: string;
    state: string;
}

function parseContainers(output: string): DockerContainer[] {
    const containers: DockerContainer[] = [];
    for (const line of output.split('\n')) {
        if (!line)
            continue;
        const [name, state] = line.split('|');
        if (!name || !state)
            continue;
        containers.push({ name, state });
    }
    return containers;
}

export class DockerContainersWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Lists Docker containers and their status'; }
    getDisplayName(): string { return 'Docker Containers'; }
    getCategory(): string { return 'Environment'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            const sample = 'tc-server▲ tc-agent-1▲ db■';
            return item.rawValue ? sample : `🐳 ${sample}`;
        }

        let output: string;
        try {
            output = execSync('docker ps -a --format "{{.Names}}|{{.State}}"', {
                encoding: 'utf8',
                timeout: 2000,
                stdio: ['ignore', 'pipe', 'ignore'],
                env: process.env
            }).trim();
        } catch (error) {
            if (error instanceof Error) {
                const execError = error as Error & { code?: string };
                if (execError.code === 'ENOENT') {
                    return item.rawValue ? null : '[No docker]';
                }
                if (execError.code === 'ETIMEDOUT') {
                    return item.rawValue ? null : '[Docker timeout]';
                }
            }
            return item.rawValue ? null : '[Docker down]';
        }

        const containers = parseContainers(output);
        if (containers.length === 0) {
            return item.rawValue ? '' : '🐳 (none)';
        }

        const value = containers
            .map(({ name, state }) => `${name}${symbolFor(state)}`)
            .join(' ');
        return item.rawValue ? value : `🐳 ${value}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
