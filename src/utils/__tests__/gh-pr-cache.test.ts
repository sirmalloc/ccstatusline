import * as childProcess from 'child_process';
import * as fs from 'fs';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type MockInstance
} from 'vitest';

import { fetchPrData } from '../gh-pr-cache';

let mockExecFileSync: MockInstance<typeof childProcess.execFileSync>;
let mockExistsSync: MockInstance<typeof fs.existsSync>;
let mockMkdirSync: MockInstance<typeof fs.mkdirSync>;
let mockReadFileSync: MockInstance<typeof fs.readFileSync>;
let mockStatSync: MockInstance<typeof fs.statSync>;
let mockWriteFileSync: MockInstance<typeof fs.writeFileSync>;

const cacheFiles = new Map<string, string>();
let currentRef = 'feature/cache-a';
const ghResponses: (string | Error)[] = [];

function mockGitAndGh(): void {
    mockExecFileSync.mockImplementation((cmd, args) => {
        const commandArgs = args ?? [];

        if (cmd === 'git' && commandArgs[0] === 'branch')
            return `${currentRef}\n`;
        if (cmd === 'git' && commandArgs[0] === 'rev-parse')
            return 'abc123\n';
        if (cmd === 'gh' && commandArgs[0] === '--version')
            return 'gh version 2.0.0\n';
        if (cmd === 'gh' && commandArgs[0] === 'pr') {
            const response = ghResponses.shift();
            if (response instanceof Error)
                throw response;
            return response ?? '';
        }

        throw new Error(`Unexpected command: ${cmd} ${commandArgs.join(' ')}`);
    });
}

describe('gh-pr-cache', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        cacheFiles.clear();
        ghResponses.length = 0;
        currentRef = 'feature/cache-a';

        mockExecFileSync = vi.spyOn(childProcess, 'execFileSync');
        mockExistsSync = vi.spyOn(fs, 'existsSync');
        mockMkdirSync = vi.spyOn(fs, 'mkdirSync');
        mockReadFileSync = vi.spyOn(fs, 'readFileSync');
        mockStatSync = vi.spyOn(fs, 'statSync');
        mockWriteFileSync = vi.spyOn(fs, 'writeFileSync');

        mockExistsSync.mockImplementation(filePath => cacheFiles.has(String(filePath)));
        mockMkdirSync.mockImplementation(() => undefined);
        mockReadFileSync.mockImplementation(filePath => cacheFiles.get(String(filePath)) ?? '');
        mockStatSync.mockImplementation(() => ({ mtimeMs: Date.now() }) as fs.Stats);
        mockWriteFileSync.mockImplementation((filePath, content) => {
            const normalizedContent = typeof content === 'string'
                ? content
                : Buffer.isBuffer(content)
                    ? content.toString('utf8')
                    : '';
            cacheFiles.set(String(filePath), normalizedContent);
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('negative-caches failed gh PR lookups', () => {
        mockGitAndGh();
        ghResponses.push(new Error('no pull request found'));

        expect(fetchPrData('/tmp/repo')).toBeNull();

        const ghCallsAfterFirstRender = mockExecFileSync.mock.calls.filter(
            ([cmd]) => cmd === 'gh'
        );
        expect(ghCallsAfterFirstRender).toHaveLength(2);
        expect(mockWriteFileSync).toHaveBeenCalledWith(expect.any(String), '', 'utf-8');

        expect(fetchPrData('/tmp/repo')).toBeNull();

        const ghCallsAfterSecondRender = mockExecFileSync.mock.calls.filter(
            ([cmd]) => cmd === 'gh'
        );
        expect(ghCallsAfterSecondRender).toHaveLength(2);
    });

    it('uses a different cache entry for each checked-out branch', () => {
        mockGitAndGh();
        ghResponses.push(JSON.stringify({
            number: 123,
            url: 'https://github.com/owner/repo/pull/123',
            title: 'First PR',
            state: 'OPEN',
            reviewDecision: ''
        }));

        expect(fetchPrData('/tmp/repo')).toEqual({
            number: 123,
            url: 'https://github.com/owner/repo/pull/123',
            title: 'First PR',
            state: 'OPEN',
            reviewDecision: ''
        });

        currentRef = 'feature/cache-b';
        ghResponses.push(JSON.stringify({
            number: 456,
            url: 'https://github.com/owner/repo/pull/456',
            title: 'Second PR',
            state: 'OPEN',
            reviewDecision: 'APPROVED'
        }));

        expect(fetchPrData('/tmp/repo')).toEqual({
            number: 456,
            url: 'https://github.com/owner/repo/pull/456',
            title: 'Second PR',
            state: 'OPEN',
            reviewDecision: 'APPROVED'
        });

        const writtenCachePaths = mockWriteFileSync.mock.calls.map(call => String(call[0]));
        expect(writtenCachePaths[0]).not.toBe(writtenCachePaths[1]);

        currentRef = 'feature/cache-a';
        expect(fetchPrData('/tmp/repo')).toEqual({
            number: 123,
            url: 'https://github.com/owner/repo/pull/123',
            title: 'First PR',
            state: 'OPEN',
            reviewDecision: ''
        });

        const ghPrCalls = mockExecFileSync.mock.calls.filter(
            ([cmd, args]) => cmd === 'gh' && Array.isArray(args) && args[0] === 'pr'
        );
        expect(ghPrCalls).toHaveLength(2);
    });
});