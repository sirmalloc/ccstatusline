import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getClaudeAccountEmail } from '../utils/claude-account-email';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const LABEL = 'Account: ';

export class ClaudeAccountEmailWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Displays the email of the currently logged-in Claude account'; }
    getDisplayName(): string { return 'Claude Account Email'; }
    getCategory(): string { return 'Session'; }
    getLabelPrefix(): string { return LABEL; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, this.getLabelPrefix(), 'you@example.com');
        }

        const email = getClaudeAccountEmail();
        if (email === null) {
            return null;
        }

        return formatRawOrLabeledValue(item, this.getLabelPrefix(), email);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
