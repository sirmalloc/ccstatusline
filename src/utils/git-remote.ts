import type { RenderContext } from '../types/RenderContext';

import { runGit } from './git';

export interface RemoteInfo {
    name: string;
    url: string;
    host: string;
    owner: string;
    repo: string;
}

export interface ForkStatus {
    isFork: boolean;
    origin: RemoteInfo | null;
    upstream: RemoteInfo | null;
}

/**
 * Extract owner and repo from a git remote URL.
 * Supports SSH, HTTPS, git://, and ssh:// formats.
 * Works with any git host (GitHub, GHES, GHEC, GitLab, etc.)
 *
 * Examples:
 * - git@github.com:owner/repo.git
 * - https://github.com/owner/repo.git
 * - git@github.service.anz:owner/repo.git
 * - ssh://git@github.com/owner/repo.git
 * - git://github.com/owner/repo
 */
export function parseRemoteUrl(url: string): { host: string; owner: string; repo: string } | null {
    const trimmed = url.trim();
    if (trimmed.length === 0) {
        return null;
    }

    // SSH format: git@host:owner/repo.git or user@host:owner/repo.git
    const sshMatch = !trimmed.includes('://')
        ? /^(?:[^@]+@)?([^:]+):(.+?)(?:\.git)?\/?$/.exec(trimmed)
        : null;
    if (sshMatch?.[1] && sshMatch[2]) {
        const pathSegments = sshMatch[2].split('/').filter(Boolean);
        const repo = pathSegments.at(-1);
        const owner = pathSegments.slice(0, -1).join('/');

        if (!owner || !repo) {
            return null;
        }

        return {
            host: sshMatch[1],
            owner,
            repo
        };
    }

    // URL format: https://host/owner/repo.git, ssh://git@host/owner/repo.git, git://host/owner/repo
    try {
        const parsedUrl = new URL(trimmed);
        const supportedProtocols = new Set(['http:', 'https:', 'ssh:', 'git:']);

        if (!supportedProtocols.has(parsedUrl.protocol)) {
            return null;
        }

        // Remove leading/trailing slashes and .git suffix
        const pathname = parsedUrl.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
        const segments = pathname.split('/').filter(Boolean);

        const repo = segments.at(-1);
        const owner = segments.slice(0, -1).join('/');

        if (!owner || !repo) {
            return null;
        }

        return {
            host: parsedUrl.hostname,
            owner,
            repo
        };
    } catch {
        return null;
    }
}

/**
 * Get information about a specific remote.
 */
export function getRemoteInfo(remoteName: string, context: RenderContext): RemoteInfo | null {
    const url = runGit(`remote get-url ${remoteName}`, context);
    if (!url) {
        return null;
    }

    const parsed = parseRemoteUrl(url);
    if (!parsed) {
        return null;
    }

    return {
        name: remoteName,
        url,
        host: parsed.host,
        owner: parsed.owner,
        repo: parsed.repo
    };
}

function getTrackingRemoteName(context: RenderContext): string | null {
    const upstreamRef = runGit('rev-parse --abbrev-ref --symbolic-full-name @{upstream}', context);
    if (!upstreamRef) {
        return null;
    }

    const remotes = listRemotes(context)
        .slice()
        .sort((left, right) => right.length - left.length);

    return remotes.find(remote => upstreamRef === remote || upstreamRef.startsWith(`${remote}/`)) ?? null;
}

/**
 * Get upstream info for widgets.
 * Prefer a literal "upstream" remote when it exists, otherwise fall back to the
 * current branch's tracking remote.
 */
export function getUpstreamRemoteInfo(context: RenderContext): RemoteInfo | null {
    const namedUpstream = getRemoteInfo('upstream', context);
    if (namedUpstream) {
        return namedUpstream;
    }

    const trackingRemoteName = getTrackingRemoteName(context);
    if (!trackingRemoteName) {
        return null;
    }

    return getRemoteInfo(trackingRemoteName, context);
}

/**
 * Get fork status by checking origin and upstream remotes.
 * A repository is considered a fork if:
 * 1. Both origin and upstream remotes exist
 * 2. They point to different owner/repo combinations
 */
export function getForkStatus(context: RenderContext): ForkStatus {
    const origin = getRemoteInfo('origin', context);
    const upstream = getRemoteInfo('upstream', context);

    const isFork = Boolean(
        origin
        && upstream
        && (origin.owner !== upstream.owner || origin.repo !== upstream.repo)
    );

    return {
        isFork,
        origin,
        upstream
    };
}

/**
 * List all remote names.
 */
export function listRemotes(context: RenderContext): string[] {
    const output = runGit('remote', context);
    if (!output) {
        return [];
    }

    return output.split('\n').filter(Boolean);
}

/**
 * Build a web URL for a repository on GitHub-like hosts.
 * Returns null if the host doesn't appear to be GitHub-like.
 */
export function buildRepoWebUrl(remote: RemoteInfo): string {
    // Assume HTTPS for the web URL
    return `https://${remote.host}/${remote.owner}/${remote.repo}`;
}