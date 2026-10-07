import { GitStatusFlagWidget } from './shared/git-status-widget';

export class GitStagedWidget extends GitStatusFlagWidget {
    protected readonly flag = 'staged';
    protected readonly defaultSymbol = '+';

    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows + when there are staged changes'; }
    getDisplayName(): string { return 'Git Staged'; }
}
