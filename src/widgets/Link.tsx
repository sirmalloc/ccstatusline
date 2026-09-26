import React from 'react';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import { renderOsc8Link } from '../utils/hyperlink';

import { lazyEditor } from './shared/lazy-editor';

export function isValidHttpUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function getLinkLabel(item: WidgetItem): { url: string; label: string } {
    const url = item.metadata?.url?.trim() ?? '';
    const metadataText = item.metadata?.text?.trim();
    const label = metadataText && metadataText.length > 0
        ? metadataText
        : (url.length > 0 ? url : 'no url');

    return { url, label };
}

function withEmojiPrefix(label: string, rawValue?: boolean): string {
    return rawValue ? label : `🔗 ${label}`;
}

export class LinkWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Displays a clickable terminal hyperlink using OSC 8'; }
    getDisplayName(): string { return 'Link'; }
    getCategory(): string { return 'Custom'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const { url, label } = getLinkLabel(item);
        const metadataText = item.metadata?.text?.trim();
        const hasCustomText = Boolean(metadataText && metadataText.length > 0);
        const text = withEmojiPrefix(label, item.rawValue);
        const shortUrl = hasCustomText && url.length > 0
            ? (url.length > 28 ? `${url.substring(0, 25)}...` : url)
            : null;

        return {
            displayText: `${this.getDisplayName()} (${text})`,
            modifierText: shortUrl ? `(${shortUrl})` : undefined
        };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const { url, label } = getLinkLabel(item);
        const displayText = withEmojiPrefix(label, item.rawValue);

        if (!url || !isValidHttpUrl(url)) {
            return displayText;
        }

        return renderOsc8Link(url, displayText);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'u', label: '(u)rl', action: 'edit-url' },
            { key: 'e', label: '(e)dit text', action: 'edit-text' }
        ];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return <LinkEditor {...props} />;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean {
        return true;
    }
}

const LinkEditor = lazyEditor(() => import('./editors/LinkEditor'));
