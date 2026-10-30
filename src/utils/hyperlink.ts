import { isSafeHyperlinkUrl } from './terminal-sanitize';

export const IDE_LINK_MODES = [
    'vscode',
    'cursor'
] as const;

export type IdeLinkMode = (typeof IDE_LINK_MODES)[number];

// A URL holding control characters (from a remote, a PR or settings) could end
// the sequence early and start one of its own, so it gets no link
export function renderOsc8Link(url: string, text: string): string {
    if (!isSafeHyperlinkUrl(url)) {
        return text;
    }

    return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

export function encodeGitRefForUrlPath(ref: string): string {
    return ref
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
}

// URL file paths preserve separator slashes and encode every character with
// URI meaning inside a path segment.
function encodeFilePathForUri(path: string, normalizeSeparators = false): string {
    const pathToEncode = normalizeSeparators ? path.replace(/\\/g, '/') : path;
    return pathToEncode
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
}

function normalizeFilePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

function encodeUncHost(host: string): string | null {
    // The host belongs to a URL authority, not a path segment. Reject syntax
    // that could start a URL component instead of silently serializing it.
    if (!host || /[\x00-\x20\x7f-\x9f#?%\\]/.test(host)) {
        return null;
    }

    try {
        const parsed = new URL(`file://${host}/`);
        if (parsed.protocol !== 'file:'
            || parsed.username
            || parsed.password
            || parsed.port
            || parsed.pathname !== '/'
            || parsed.search
            || parsed.hash
            || !parsed.hostname) {
            return null;
        }
        return parsed.host;
    } catch {
        return null;
    }
}

export function buildFileUrl(filePath: string): string | null {
    if (!filePath || /^[A-Za-z]:$/.test(filePath)) {
        return null;
    }

    const isUncPath = /^\\\\[^\\]/.test(filePath) || /^\/\/[^/]/.test(filePath);
    const isWindowsDrivePath = /^[A-Za-z]:[\\/]/.test(filePath);
    if (isUncPath) {
        try {
            const normalizedPath = normalizeFilePath(filePath);
            const uncMatch = /^\/\/([^/]+)(\/.*)?$/.exec(normalizedPath);
            const host = uncMatch?.[1] ? encodeUncHost(uncMatch[1]) : null;
            return host ? `file://${host}${encodeFilePathForUri(uncMatch?.[2] ?? '/', true)}` : null;
        } catch {
            return null;
        }
    }

    if (isWindowsDrivePath) {
        try {
            const normalizedPath = normalizeFilePath(filePath);
            const driveMatch = /^([A-Za-z]:)(\/.*)?$/.exec(normalizedPath);
            return driveMatch?.[1]
                ? `file:///${driveMatch[1]}${encodeFilePathForUri(driveMatch[2] ?? '/')}`
                : null;
        } catch {
            return null;
        }
    }

    // A POSIX filename may contain backslashes. Keep them as part of the same
    // path segment and let URI encoding emit %5C.
    if (!filePath.startsWith('/')) {
        return null;
    }

    try {
        return `file://${encodeFilePathForUri(filePath)}`;
    } catch {
        return null;
    }
}

export function buildIdeFileUrl(filePath: string, ideLinkMode: IdeLinkMode): string {
    const isUncPath = /^\\\\[^\\]/.test(filePath) || /^\/\/[^/]/.test(filePath);
    const isWindowsDrivePath = /^[A-Za-z]:[\\/]/.test(filePath);
    // Backslashes are separators only in Windows paths; POSIX filenames need %5C.
    const normalizedPath = isUncPath || isWindowsDrivePath ? normalizeFilePath(filePath) : filePath;
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
