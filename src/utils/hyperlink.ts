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
