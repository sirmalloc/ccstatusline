import type { RemoteInfo } from '../utils/git-remote';

import { GitRemoteWidgetBase } from './shared/git-remote-widget-base';

export class GitUpstreamRepoWidget extends GitRemoteWidgetBase {
    protected readonly remote = 'upstream';
    protected readonly previewText = 'upstream-repo';
    protected readonly previewUrl = 'https://github.com/upstream-owner/upstream-repo';

    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the upstream remote repository name'; }
    getDisplayName(): string { return 'Git Upstream Repo'; }

    protected formatRemote(remote: RemoteInfo): string {
        return remote.repo;
    }
}
