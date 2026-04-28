import {
    describe,
    expect,
    it
} from 'vitest';

import {
    buildIdeFileUrl,
    encodeGitRefForUrlPath
} from '../hyperlink';

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
