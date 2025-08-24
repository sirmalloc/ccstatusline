import { execSync } from 'child_process';
import * as os from 'os';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class SpotifyWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows currently playing Spotify track with rotating phrases and emojis (Mac only)'; }
    getDisplayName(): string { return 'Spotify'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            const phrase = this.getRandomPhrase();
            const emoji = this.getRandomEmoji();
            return item.rawValue ? 'Song Name by Artist' : `${phrase}: Song Name by Artist ${emoji}`;
        }

        // Only works on macOS
        if (os.platform() !== 'darwin') {
            return null;
        }

        const spotifyInfo = this.getSpotifyInfo();
        if (!spotifyInfo) {
            return null;
        }

        if (item.rawValue) {
            return spotifyInfo;
        }

        const phrase = this.getRandomPhrase();
        const emoji = this.getRandomEmoji();
        return `${phrase}: ${spotifyInfo} ${emoji}`;
    }

    private getSpotifyInfo(): string | null {
        try {
            const script = `tell application "Spotify"
                if it is running and player state is playing then
                    get name of current track & " by " & artist of current track
                end if
            end tell`;

            const result = execSync(`osascript -e '${script}'`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                timeout: 2000
            }).trim();

            return result || null;
        } catch {
            return null;
        }
    }

    private getRandomPhrase(): string {
        const phrases = ['🎵 now playing', '🎶 grooving to', '🎧 vibing to', '🎤 jamming to', '🔥 bumping'] as const;
        // Rotate through phrases every 10 seconds
        const phraseIndex = Math.floor(Date.now() / 1000 / 10) % phrases.length;
        const phrase = phrases[phraseIndex];
        return phrase ?? phrases[0];
    }

    private getRandomEmoji(): string {
        const emojis = ['🎼', '🎹', '🥁', '🎸', '🎺', '🎷', '🎻', '✨', '💫', '🌟'] as const;
        // Rotate through emojis every 8 seconds
        const emojiIndex = Math.floor(Date.now() / 1000 / 8) % emojis.length;
        const emoji = emojis[emojiIndex];
        return emoji ?? emojis[0];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}