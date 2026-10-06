import { GitFileCountWidget } from './shared/git-count-widget';

export class GitStagedFilesWidget extends GitFileCountWidget {
    protected readonly field = 'staged';
    protected readonly label = 'S:';
    protected readonly zeroLabel = 'when the staged file count is zero';
    protected readonly previewCounts = 3;

    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows count of staged files'; }
    getDisplayName(): string { return 'Git Staged Files'; }
}
