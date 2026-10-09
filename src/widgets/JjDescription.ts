import type { RenderContext } from '../types/RenderContext';
import type { WidgetItem } from '../types/Widget';
import { runJjArgs } from '../utils/jj';

import { JjWidgetBase } from './shared/jj-widget-base';

export class JjDescriptionWidget extends JjWidgetBase {
    protected readonly previewValue = '(no description)';
    protected readonly noJjText = 'no jj';

    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Shows the current jujutsu change description'; }
    getDisplayName(): string { return 'JJ Description'; }

    protected getValue(context: RenderContext): string | null {
        return runJjArgs([
            'log',
            '--no-graph',
            '-r',
            '@',
            '-T',
            'description.first_line()'
        ], context, true);
    }

    protected formatValue(_item: WidgetItem, description: string): string {
        return description.length > 0 ? description : '(no description)';
    }

    supportsRawValue(): boolean { return false; }
}
