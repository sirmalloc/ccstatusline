export const IDE_LINK_MODES = [
    'vscode',
    'cursor'
] as const;

export type IdeLinkMode = (typeof IDE_LINK_MODES)[number];

export function renderOsc8Link(url: string, text: string): string {
    return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

function parseGitHubRepositoryPath(pathname: string): string | null {
    const trimmedPath = pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
    const segments = trimmedPath.split('/').filter(Boolean);

    if (segments.length !== 2) {
        return null;
    }

    return `${segments[0]}/${segments[1]}`;
}

/**
 * Converts a git remote URL to a GitHub HTTPS base URL.
 * Handles SSH, HTTPS, and ssh:// URL formats.
 * Returns null if the remote is not a GitHub URL.
 */
export function parseGitHubBaseUrl(remoteUrl: string): string | null {
    const trimmed = remoteUrl.trim();
    if (trimmed.length === 0) {
        return null;
    }

    const sshMatch = /^(?:[^@]+@)?github\.com:([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(trimmed);
    if (sshMatch?.[1]) {
        return `https://github.com/${sshMatch[1]}`;
    }

    try {
        const parsedUrl = new URL(trimmed);
        const supportedProtocols = new Set([
            'http:',
            'https:',
            'ssh:',
            'git:'
        ]);

        if (parsedUrl.hostname.toLowerCase() !== 'github.com' || !supportedProtocols.has(parsedUrl.protocol)) {
            return null;
        }

        const repoPath = parseGitHubRepositoryPath(parsedUrl.pathname);
        if (!repoPath) {
            return null;
        }

        return `https://github.com/${repoPath}`;
    } catch {
        return null;
    }
}

export function encodeGitRefForUrlPath(ref: string): string {
    return ref
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
}

function encodeFilePathForUri(path: string): string {
    return path
        .replace(/\\/g, '/')
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
}

export function buildIdeFileUrl(filePath: string, ideLinkMode: IdeLinkMode): string {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const uncMatch = /^\/\/([^/]+)(\/.*)?$/.exec(normalizedPath);
    if (uncMatch?.[1]) {
        const encodedPath = encodeFilePathForUri(uncMatch[2] ?? '/');
        return `${ideLinkMode}://file//${uncMatch[1]}${encodedPath}`;
    }

    const driveMatch = /^([A-Za-z]:)(\/.*)?$/.exec(normalizedPath);
    if (driveMatch?.[1]) {
        const encodedPath = encodeFilePathForUri(driveMatch[2] ?? '/');
        return `${ideLinkMode}://file/${driveMatch[1]}${encodedPath}`;
    }

    return `${ideLinkMode}://file${encodeFilePathForUri(normalizedPath)}`;
}