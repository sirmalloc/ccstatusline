import { spawnSync } from 'child_process';
import * as os from 'os';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { openExternalUrl } from '../open-url';

vi.mock('child_process', () => ({ spawnSync: vi.fn() }));

const mockSpawnSync = spawnSync as unknown as {
    mock: { calls: unknown[][] };
    mockReturnValue: (value: unknown) => void;
    mockReturnValueOnce: (value: unknown) => void;
};

describe('openExternalUrl', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it('uses open on macOS', () => {
        vi.spyOn(os, 'platform').mockReturnValue('darwin');
        mockSpawnSync.mockReturnValue({ status: 0 });

        const result = openExternalUrl('https://github.com/sirmalloc/ccstatusline');

        expect(result).toEqual({ success: true });
        expect(mockSpawnSync.mock.calls[0]?.[0]).toBe('open');
        expect(mockSpawnSync.mock.calls[0]?.[1]).toEqual(['https://github.com/sirmalloc/ccstatusline']);
    });

    it('uses cmd start on Windows', () => {
        vi.spyOn(os, 'platform').mockReturnValue('win32');
        mockSpawnSync.mockReturnValue({ status: 0 });

        const result = openExternalUrl('https://github.com/sirmalloc/ccstatusline');

        expect(result).toEqual({ success: true });
        expect(mockSpawnSync.mock.calls[0]?.[0]).toBe('cmd');
        expect(mockSpawnSync.mock.calls[0]?.[1]).toEqual(['/c', 'start', '', 'https://github.com/sirmalloc/ccstatusline']);
    });

    it('uses xdg-open on Linux when available', () => {
        vi.spyOn(os, 'platform').mockReturnValue('linux');
        mockSpawnSync.mockReturnValue({ status: 0 });

        const result = openExternalUrl('https://github.com/sirmalloc/ccstatusline');

        expect(result).toEqual({ success: true });
        expect(mockSpawnSync.mock.calls[0]?.[0]).toBe('xdg-open');
        expect(mockSpawnSync.mock.calls[0]?.[1]).toEqual(['https://github.com/sirmalloc/ccstatusline']);
    });

    it('falls back to gio open when xdg-open fails', () => {
        vi.spyOn(os, 'platform').mockReturnValue('linux');
        mockSpawnSync.mockReturnValueOnce({ status: 1 });
        mockSpawnSync.mockReturnValueOnce({ status: 0 });

        const result = openExternalUrl('https://github.com/sirmalloc/ccstatusline');

        expect(result).toEqual({ success: true });
        expect(mockSpawnSync.mock.calls.length).toBe(2);
        expect(mockSpawnSync.mock.calls[0]?.[0]).toBe('xdg-open');
        expect(mockSpawnSync.mock.calls[1]?.[0]).toBe('gio');
        expect(mockSpawnSync.mock.calls[1]?.[1]).toEqual(['open', 'https://github.com/sirmalloc/ccstatusline']);
    });

    it('returns failure when Linux openers fail', () => {
        vi.spyOn(os, 'platform').mockReturnValue('linux');
        mockSpawnSync.mockReturnValueOnce({ status: 1 });
        mockSpawnSync.mockReturnValueOnce({ status: 2 });

        const result = openExternalUrl('https://github.com/sirmalloc/ccstatusline');

        expect(result.success).toBe(false);
        expect(result.error).toContain('xdg-open failed');
        expect(result.error).toContain('gio open failed');
    });

    it('rejects non-http URL protocols', () => {
        const result = openExternalUrl('file:///tmp/ccstatusline');

        expect(result).toEqual({
            success: false,
            error: 'Only http(s) URLs are supported'
        });
        expect(mockSpawnSync.mock.calls.length).toBe(0);
    });

    it('rejects malformed URLs', () => {
        const result = openExternalUrl('not-a-valid-url');

        expect(result).toEqual({
            success: false,
            error: 'Invalid URL'
        });
        expect(mockSpawnSync.mock.calls.length).toBe(0);
    });

    it('returns command spawn error details', () => {
        vi.spyOn(os, 'platform').mockReturnValue('darwin');
        mockSpawnSync.mockReturnValue({ error: new Error('spawn failed') });

        const result = openExternalUrl('https://github.com/sirmalloc/ccstatusline');

        expect(result).toEqual({
            success: false,
            error: 'spawn failed'
        });
    });

    it('preserves status-based error formatting when signal is present', () => {
        vi.spyOn(os, 'platform').mockReturnValue('darwin');
        mockSpawnSync.mockReturnValue({
            status: null,
            signal: 'SIGTERM'
        });

        const result = openExternalUrl('https://github.com/sirmalloc/ccstatusline');

        expect(result).toEqual({
            success: false,
            error: 'Command exited with status null'
        });
    });

    it('returns unsupported platform error', () => {
        vi.spyOn(os, 'platform').mockReturnValue('freebsd');

        const result = openExternalUrl('https://github.com/sirmalloc/ccstatusline');

        expect(result).toEqual({
            success: false,
            error: 'Unsupported platform: freebsd'
        });
        expect(mockSpawnSync.mock.calls.length).toBe(0);
    });
});