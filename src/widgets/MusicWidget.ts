import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class MusicWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows currently playing music track with rotating phrases and emojis'; }
    getDisplayName(): string { return 'Music'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            const phrase = this.getRandomPhrase();
            return item.rawValue ? 'Song Name by Artist' : `${phrase}: Song Name by Artist`;
        }

        // Only works on macOS
        if (os.platform() !== 'darwin')
            return null;

        const musicInfo = this.getMusicInfo();
        if (!musicInfo)
            return null;

        if (item.rawValue)
            return musicInfo;

        const phrase = this.getRandomPhrase();
        return `${phrase}: ${musicInfo}`;
    }

    private getMusicInfo(): string | null {
        const platform = os.platform();

        if (platform === 'darwin') {
            // macOS: use JXA with MRNowPlayingRequest via osascript (dist/bin only)
            try {
                const jxaPath = __filename.includes('dist')
                    ? path.join(__dirname, 'bin', 'macos-nowplaying.jxa.js')
                    : path.join(__dirname, '..', '..', 'dist', 'bin', 'macos-nowplaying.jxa.js');

                if (fs.existsSync(jxaPath)) {
                    const jxaResult = execSync(`osascript -l JavaScript "${jxaPath}"`, {
                        encoding: 'utf8',
                        stdio: ['pipe', 'pipe', 'ignore'],
                        timeout: 2000
                    }).trim();

                    if (jxaResult)
                        return jxaResult;
                }
            } catch {
                // Do nothing
            }

            return null;
        } else if (platform === 'win32') {
            // Windows: Empty block for future implementation
            // TODO: Could use Windows Media Player API or other music player APIs
            return null;
        } else if (platform === 'linux') {
            // Linux: Empty block for future implementation
            // TODO: Could use D-Bus to query MPRIS2-compliant media players
            return null;
        }

        return null;
    }

    private getRandomPhrase(): string {
        const phrases = ['🎵 now playing', '🎶 grooving to', '🎧 vibing to', '🎤 jamming to', '🔥 bumping'] as const;
        // Rotate through phrases every 10 seconds
        const phraseIndex = Math.floor(Date.now() / 1000 / 10) % phrases.length;
        const phrase = phrases[phraseIndex];
        return phrase ?? phrases[0];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}