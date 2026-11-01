import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDescriptor,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import { renderOsc8Link } from '../utils/hyperlink';
import { isSafeHyperlinkUrl } from '../utils/terminal-sanitize';

export function isValidHttpUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

export function toEditorMetadata(widget: WidgetItem): { url: string; text: string } {
    const url = widget.metadata?.url ?? '';
    const text = widget.metadata?.text ?? '';
    return { url, text };
}

export function buildMetadata(widget: WidgetItem, urlValue: string, textValue: string): WidgetItem {
    const metadata = { ...(widget.metadata ?? {}) };
    const trimmedUrl = urlValue.trim();
    const trimmedText = textValue.trim();

    if (trimmedUrl.length > 0) {
        metadata.url = trimmedUrl;
    } else {
        delete metadata.url;
    }

    if (trimmedText.length > 0) {
        metadata.text = trimmedText;
    } else {
        delete metadata.text;
    }

    if (Object.keys(metadata).length === 0) {
        const { metadata, ...rest } = widget;
        return rest;
    }

    return {
        ...widget,
        metadata
    };
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

        // The parsed form percent-encodes what a link can't carry as is
        return renderOsc8Link(isSafeHyperlinkUrl(url) ? url : new URL(url).href, displayText);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'u', label: '(u)rl', action: 'edit-url' },
            { key: 'e', label: '(e)dit text', action: 'edit-text' }
        ];
    }

    renderEditor(props: WidgetEditorProps): WidgetEditorDescriptor {
        return { kind: 'link', props };
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean {
        return true;
    }
}
