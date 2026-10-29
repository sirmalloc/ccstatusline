import type { RemoteInfo } from '../utils/git-remote';

import { GitRemoteWidgetBase } from './shared/git-remote-widget-base';

export class GitOriginOwnerWidget extends GitRemoteWidgetBase {
    protected readonly remote = 'origin';
    protected readonly previewText = 'owner';
    protected readonly previewUrl = 'https://github.com/owner/repo';

    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows the origin remote owner/organization'; }
    getDisplayName(): string { return 'Git Origin Owner'; }

    protected formatRemote(remote: RemoteInfo): string {
        return remote.owner;
    }
}
