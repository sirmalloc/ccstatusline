import type { RenderContext } from '../types/RenderContext';
import type { Widget, WidgetEditorDisplay, WidgetItem } from '../types/Widget';

export class VersionWidget implements Widget {
    getDefaultColor(): string {
        return 'gray';
    }
    getDescription(): string {
        return 'Shows Claude Code CLI version number';
    }
    getDisplayName(): string {
        return 'Version';
    }
    getEditorDisplay(): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext): string | null {
        if (context.isPreview) {
            return item.rawValue ? '1.0.0' : 'v1.0.0';
        } else if (context.data?.version) {
            return item.rawValue ? context.data.version : `v${context.data.version}`;
        }
        return null;
    }

    supportsRawValue(): boolean {
        return true;
    }
    supportsColors(): boolean {
        return true;
    }
}
