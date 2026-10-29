import {
    describe,
    expect,
    it
} from 'vitest';

import {
    buildIdeFileUrl,
    encodeGitRefForUrlPath,
    renderOsc8Link
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

describe('renderOsc8Link', () => {
    it('links text to a URL', () => {
        expect(renderOsc8Link('https://github.com/o/r', 'repo')).toBe('\x1b]8;;https://github.com/o/r\x1b\\repo\x1b]8;;\x1b\\');
    });

    it('links a URL with non-ASCII characters as it is', () => {
        expect(renderOsc8Link('https://example.com/café', 'repo')).toBe('\x1b]8;;https://example.com/café\x1b\\repo\x1b]8;;\x1b\\');
    });

    // A URL from a remote or a PR could otherwise end the sequence early and start its own
    it.each([
        ['an escape sequence', 'https://x/\x1b]52;c;AAAA\x07'],
        ['a space', 'https://x/a b'],
        ['an 8-bit control', 'https://x/\x9c']
    ])('prints just the text when the URL holds %s', (_label, url) => {
        expect(renderOsc8Link(url, 'repo')).toBe('repo');
    });
});
