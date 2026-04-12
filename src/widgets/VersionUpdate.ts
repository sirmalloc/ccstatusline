import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { listValidTipFiles, compareSemver } from '../utils/tips';

export class VersionUpdateWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows version range of available tip files'; }
    getDisplayName(): string { return 'Version Update'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'v1.0.0 \u2192 v2.0.0' : 'Tips: v1.0.0 \u2192 v2.0.0';
        }

        const valid = listValidTipFiles(settings);
        if (valid.length === 0) {
            return null;
        }

        valid.sort((a, b) => compareSemver(a.version, b.version));
        const oldest = valid[0]!.version;
        const newest = valid[valid.length - 1]!.version;

        const text = oldest === newest
            ? `v${newest}`
            : `v${oldest} \u2192 v${newest}`;
        return item.rawValue ? text : `Tips: ${text}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
