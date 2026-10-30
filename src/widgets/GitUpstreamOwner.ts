import type { RemoteInfo } from '../utils/git-remote';

import { GitRemoteWidgetBase } from './shared/git-remote-widget-base';

export class GitUpstreamOwnerWidget extends GitRemoteWidgetBase {
    protected readonly remote = 'upstream';
    protected readonly previewText = 'upstream-owner';
    protected readonly previewUrl = 'https://github.com/upstream-owner/repo';

    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the upstream remote owner/organization'; }
    getDisplayName(): string { return 'Git Upstream Owner'; }

    protected formatRemote(remote: RemoteInfo): string {
        return remote.owner;
    }
}
