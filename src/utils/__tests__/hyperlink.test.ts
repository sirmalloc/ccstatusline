import {
    describe,
    expect,
    it
} from 'vitest';

import {
    buildIdeFileUrl,
    encodeGitRefForUrlPath,
    parseGitHubBaseUrl
} from '../hyperlink';

describe('parseGitHubBaseUrl', () => {
    it('supports scp-style SSH remotes', () => {
        expect(parseGitHubBaseUrl('git@github.com:owner/repo.git')).toBe('https://github.com/owner/repo');
    });

    it('supports ssh URL remotes', () => {
        expect(parseGitHubBaseUrl('ssh://git@github.com/owner/repo.git')).toBe('https://github.com/owner/repo');
    });

    it('supports credentialed HTTPS remotes', () => {
        expect(parseGitHubBaseUrl('https://token@github.com/owner/repo.git')).toBe('https://github.com/owner/repo');
    });

    it('rejects non-GitHub remotes', () => {
        expect(parseGitHubBaseUrl('https://gitlab.com/owner/repo.git')).toBeNull();
    });
});

describe('encodeGitRefForUrlPath', () => {
    it('encodes reserved characters while preserving branch separators', () => {
        expect(encodeGitRefForUrlPath('feature/issue#1')).toBe('feature/issue%231');
    });
});

describe('buildIdeFileUrl', () => {
    it('builds encoded IDE links for POSIX paths', () => {
        expect(buildIdeFileUrl('/Users/example/my repo#1', 'cursor')).toBe('cursor://file/Users/example/my%20repo%231');
    });

    it('builds IDE links for Windows drive-letter paths', () => {
        expect(buildIdeFileUrl('C:/Work/my repo#1', 'vscode')).toBe('vscode://file/C:/Work/my%20repo%231');
    });

    it('builds IDE links for UNC paths', () => {
        expect(buildIdeFileUrl('\\\\server\\share\\my repo', 'cursor')).toBe('cursor://file//server/share/my%20repo');
    });
});