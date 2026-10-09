import { GitFileCountWidget } from './shared/git-count-widget';

export class GitUnstagedFilesWidget extends GitFileCountWidget {
    protected readonly field = 'unstaged';
    protected readonly label = 'M:';
    protected readonly zeroLabel = 'when the unstaged file count is zero';
    protected readonly previewCounts = 2;

    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows count of unstaged files'; }
    getDisplayName(): string { return 'Git Unstaged Files'; }
}
