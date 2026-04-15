import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const TTL_SECONDS = 295; // 5 min minus 5s safety margin
const STATE_DIR = path.join(os.homedir(), '.claude', 'state');

interface TimerFile {
    timestamp: string;
    session_id: string;
    stopped: boolean | null;
}

function readTimerFile(sessionId: string): TimerFile | null {
    const filePath = path.join(STATE_DIR, `cache-timer-${sessionId}.json`);
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as TimerFile;
    } catch {
        return null;
    }
}

function getRemainingSeconds(timestamp: string): number {
    const ts = new Date(timestamp).getTime();
    const now = Date.now();
    const elapsedSeconds = (now - ts) / 1000;
    return TTL_SECONDS - elapsedSeconds;
}

function formatCountdown(remaining: number): string {
    if (remaining <= 0) return 'COLD';
    const m = Math.floor(remaining / 60);
    const s = Math.floor(remaining % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function getIcon(remaining: number): string {
    if (remaining <= 0) return '❄️';
    const pct = remaining / TTL_SECONDS;
    if (pct > 0.5) return '🟢';
    if (pct > 0.2) return '🟡';
    return '🔴';
}

export class CacheTimerWidget implements Widget {
    getDefaultColor(): string { return 'brightCyan'; }
    getDescription(): string { return 'Shows time remaining on the 5-minute prompt cache TTL'; }
    getDisplayName(): string { return 'Cache Timer'; }
    getCategory(): string { return 'Session'; }

    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Cache: ', '🟢 4:52');
        }

        const sessionId = context.data?.session_id;
        if (!sessionId) return null;

        const timer = readTimerFile(sessionId);
        if (!timer) return null;

        if (timer.stopped === false) {
            return formatRawOrLabeledValue(item, 'Cache: ', '🔥 HOT');
        }

        if (!timer.timestamp) return null;

        const remaining = getRemainingSeconds(timer.timestamp);
        const icon = getIcon(remaining);
        const countdown = formatCountdown(remaining);

        return formatRawOrLabeledValue(item, 'Cache: ', `${icon} ${countdown}`);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
