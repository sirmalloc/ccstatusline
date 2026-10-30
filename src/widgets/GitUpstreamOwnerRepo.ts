import type { RemoteInfo } from '../utils/git-remote';

import { GitRemoteWidgetBase } from './shared/git-remote-widget-base';

export class GitUpstreamOwnerRepoWidget extends GitRemoteWidgetBase {
    protected readonly remote = 'upstream';
    protected readonly previewText = 'upstream-owner/upstream-repo';
    protected readonly previewUrl = 'https://github.com/upstream-owner/upstream-repo';

    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the upstream remote as owner/repo'; }
    getDisplayName(): string { return 'Git Upstream Owner/Repo'; }

    protected formatRemote(remote: RemoteInfo): string {
        return `${remote.owner}/${remote.repo}`;
    }
}
