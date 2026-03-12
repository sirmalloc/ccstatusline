export function renderOsc8Link(url: string, text: string): string {
    return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

/**
 * Converts a git remote URL to a GitHub HTTPS base URL.
 * Handles both SSH (git@github.com:owner/repo.git) and HTTPS formats.
 * Returns null if the remote is not a GitHub URL.
 */
export function parseGitHubBaseUrl(remoteUrl: string): string | null {
    const trimmed = remoteUrl.trim();

    // SSH format: git@github.com:owner/repo.git
    const sshMatch = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/.exec(trimmed);
    if (sshMatch?.[1]) {
        return `https://github.com/${sshMatch[1]}`;
    }

    // HTTPS format: https://github.com/owner/repo.git
    const httpsMatch = /^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/.exec(trimmed);
    if (httpsMatch?.[1]) {
        return `https://github.com/${httpsMatch[1]}`;
    }

    return null;
}