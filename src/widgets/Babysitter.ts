import {
    existsSync,
    readFileSync,
    readdirSync
} from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

interface BabysitterState {
    active: boolean;
    iteration: number;
    maxIterations: number;
    runId: string;
}

function findBabysitterStateDir(): string | null {
    const pluginCacheDir = join(homedir(), '.claude', 'plugins', 'cache', 'a5c-ai', 'babysitter');
    try {
        const versions = readdirSync(pluginCacheDir);
        if (versions.length === 0)
            return null;
        // Use the latest version directory (highest semver)
        const latest = versions.sort().pop();
        if (!latest)
            return null;
        return join(pluginCacheDir, latest, 'skills', 'babysit', 'state');
    } catch {
        return null;
    }
}

function parseBabysitterState(sessionId: string): BabysitterState | null {
    const stateDir = findBabysitterStateDir();
    if (!stateDir)
        return null;

    const stateFile = join(stateDir, `${sessionId}.md`);
    if (!existsSync(stateFile))
        return null;

    try {
        const content = readFileSync(stateFile, 'utf-8');

        // Parse YAML frontmatter between --- delimiters
        const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(content);
        if (!frontmatterMatch?.[1])
            return null;

        const frontmatter = frontmatterMatch[1];
        const getValue = (key: string): string | undefined => {
            const match = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(frontmatter);
            return match?.[1]?.trim().replace(/^["']|["']$/g, '');
        };

        const active = getValue('active');
        if (active !== 'true')
            return null;

        const iteration = parseInt(getValue('iteration') ?? '', 10);
        const maxIterations = parseInt(getValue('max_iterations') ?? '', 10);

        if (isNaN(iteration) || isNaN(maxIterations))
            return null;

        return {
            active: true,
            iteration,
            maxIterations,
            runId: getValue('run_id') ?? ''
        };
    } catch {
        return null;
    }
}

export class BabysitterWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows babysitter run status and iteration progress when active'; }
    getDisplayName(): string { return 'Babysitter'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '#3/256' : '\u{1F916} Babysitter #3/256';
        }

        const sessionId = context.data?.session_id;
        if (!sessionId)
            return null;

        const state = parseBabysitterState(sessionId);
        if (!state)
            return null;

        const progress = `#${state.iteration}/${state.maxIterations}`;
        return item.rawValue ? progress : `\u{1F916} Babysitter ${progress}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}