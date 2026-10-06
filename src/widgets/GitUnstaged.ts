import { GitStatusFlagWidget } from './shared/git-status-widget';

export class GitUnstagedWidget extends GitStatusFlagWidget {
    protected readonly flag = 'unstaged';
    protected readonly defaultSymbol = '*';

    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows * when there are unstaged changes'; }
    getDisplayName(): string { return 'Git Unstaged'; }
}
