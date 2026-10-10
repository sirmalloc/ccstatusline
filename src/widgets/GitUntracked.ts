import { GitStatusFlagWidget } from './shared/git-status-widget';

export class GitUntrackedWidget extends GitStatusFlagWidget {
    protected readonly flag = 'untracked';
    protected readonly defaultSymbol = '?';

    getDefaultColor(): string { return 'red'; }
    getDescription(): string { return 'Shows ? when there are untracked files'; }
    getDisplayName(): string { return 'Git Untracked'; }
}
