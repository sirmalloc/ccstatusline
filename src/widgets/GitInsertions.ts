import type { WidgetItem } from '../types/Widget';
import type { GitChangeCounts } from '../utils/git';

import { GitLineCountWidget } from './shared/git-count-widget';
import {
    getSlotSymbol,
    type SymbolSlot
} from './shared/symbol-override';

const INSERTIONS_SLOT: SymbolSlot = { id: 'symbolInsertions', label: 'Insertions', defaultSymbol: '+' };

export class GitInsertionsWidget extends GitLineCountWidget {
    protected readonly zeroLabel = 'when the insertion count is zero';
    protected readonly slots = [INSERTIONS_SLOT];

    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows git insertions count'; }
    getDisplayName(): string { return 'Git Insertions'; }

    protected isZero(changes: GitChangeCounts): boolean {
        return changes.insertions === 0;
    }

    protected formatCounts(item: WidgetItem, changes: GitChangeCounts): string {
        return `${getSlotSymbol(item, INSERTIONS_SLOT)}${changes.insertions}`;
    }
}
