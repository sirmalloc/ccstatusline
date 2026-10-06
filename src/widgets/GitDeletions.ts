import type { WidgetItem } from '../types/Widget';
import type { GitChangeCounts } from '../utils/git';

import { GitLineCountWidget } from './shared/git-count-widget';
import {
    getSlotSymbol,
    type SymbolSlot
} from './shared/symbol-override';

const DELETIONS_SLOT: SymbolSlot = { id: 'symbolDeletions', label: 'Deletions', defaultSymbol: '-' };

export class GitDeletionsWidget extends GitLineCountWidget {
    protected readonly zeroLabel = 'when the deletion count is zero';
    protected readonly slots = [DELETIONS_SLOT];

    getDefaultColor(): string { return 'red'; }
    getDescription(): string { return 'Shows git deletions count'; }
    getDisplayName(): string { return 'Git Deletions'; }

    protected isZero(changes: GitChangeCounts): boolean {
        return changes.deletions === 0;
    }

    protected formatCounts(item: WidgetItem, changes: GitChangeCounts): string {
        return `${getSlotSymbol(item, DELETIONS_SLOT)}${changes.deletions}`;
    }
}
