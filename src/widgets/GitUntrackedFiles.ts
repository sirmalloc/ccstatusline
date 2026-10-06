import { GitFileCountWidget } from './shared/git-count-widget';

export class GitUntrackedFilesWidget extends GitFileCountWidget {
    protected readonly field = 'untracked';
    protected readonly label = '?:';
    protected readonly zeroLabel = 'when the untracked file count is zero';
    protected readonly previewCounts = 1;

    getDefaultColor(): string { return 'red'; }
    getDescription(): string { return 'Shows count of untracked files'; }
    getDisplayName(): string { return 'Git Untracked Files'; }
}
