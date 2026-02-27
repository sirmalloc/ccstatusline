import { execSync } from 'child_process';
import os from 'os';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { FreeMemoryWidget } from '../FreeMemory';

vi.mock('child_process', () => ({ execSync: vi.fn() }));
vi.mock('os', () => {
    const mockOs = {
        totalmem: vi.fn(),
        freemem: vi.fn(),
        platform: vi.fn()
    };

    return {
        default: mockOs,
        ...mockOs
    };
});

const mockTotalmem = os.totalmem as unknown as {
    mockReturnValue: (value: number) => void;
    mockReset: () => void;
};
const mockFreemem = os.freemem as unknown as {
    mockReturnValue: (value: number) => void;
    mockReset: () => void;
};
const mockPlatform = os.platform as unknown as {
    mockReturnValue: (value: NodeJS.Platform) => void;
    mockReset: () => void;
};
const mockExecSync = execSync as unknown as {
    mockReturnValue: (value: string) => void;
    mockImplementation: (impl: () => never) => void;
    mockReset: () => void;
};

describe('FreeMemoryWidget', () => {
    const widget = new FreeMemoryWidget();

    beforeEach(() => {
        vi.clearAllMocks();
        mockTotalmem.mockReset();
        mockFreemem.mockReset();
        mockPlatform.mockReset();
        mockExecSync.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('metadata', () => {
        it('should return correct display name', () => {
            expect(widget.getDisplayName()).toBe('Memory Usage');
        });

        it('should return correct description', () => {
            expect(widget.getDescription()).toBe('Shows system memory usage (used/total)');
        });

        it('should return cyan as default color', () => {
            expect(widget.getDefaultColor()).toBe('cyan');
        });

        it('should support raw value', () => {
            expect(widget.supportsRawValue()).toBe(true);
        });

        it('should support colors', () => {
            const item: WidgetItem = { id: 'mem', type: 'free-memory' };
            expect(widget.supportsColors(item)).toBe(true);
        });
    });

    describe('preview mode', () => {
        it('should return mock data with label in preview mode', () => {
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = { id: 'mem', type: 'free-memory' };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('Mem: 12.4G/16.0G');
        });

        it('should return mock data without label in preview mode when rawValue is true', () => {
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = { id: 'mem', type: 'free-memory', rawValue: true };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('12.4G/16.0G');
        });
    });

    describe('render on macOS (vm_stat)', () => {
        beforeEach(() => {
            mockPlatform.mockReturnValue('darwin');
            mockTotalmem.mockReturnValue(16 * 1024 ** 3); // 16GB total
        });

        it('should calculate used memory from vm_stat (active + wired)', () => {
            // Page size 16384, active 500000 pages, wired 100000 pages
            // Used = (500000 + 100000) * 16384 = 9,830,400,000 bytes ≈ 9.2G
            mockExecSync.mockReturnValue(`Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                              100000.
Pages active:                            500000.
Pages inactive:                          200000.
Pages speculative:                        10000.
Pages throttled:                              0.
Pages wired down:                        100000.
Pages purgeable:                           5000.
`);

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'mem', type: 'free-memory' };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('Mem: 9.2G/16.0G');
        });

        it('should show raw value without label', () => {
            mockExecSync.mockReturnValue(`Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                              100000.
Pages active:                            500000.
Pages inactive:                          200000.
Pages wired down:                        100000.
`);

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'mem', type: 'free-memory', rawValue: true };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('9.2G/16.0G');
        });

        it('should fallback to os.freemem if vm_stat fails', () => {
            mockExecSync.mockImplementation(() => {
                throw new Error('command not found');
            });
            mockFreemem.mockReturnValue(8 * 1024 ** 3); // 8GB free -> 8GB used

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'mem', type: 'free-memory', rawValue: true };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('8.0G/16.0G');
        });

        it('should fallback if vm_stat output is malformed', () => {
            mockExecSync.mockReturnValue('garbage output');
            mockFreemem.mockReturnValue(4 * 1024 ** 3); // 4GB free -> 12GB used

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'mem', type: 'free-memory', rawValue: true };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('12.0G/16.0G');
        });
    });

    describe('render on non-macOS (os.freemem fallback)', () => {
        beforeEach(() => {
            mockPlatform.mockReturnValue('linux');
        });

        it('should use total - free calculation on Linux', () => {
            mockFreemem.mockReturnValue(8 * 1024 ** 3); // 8GB free
            mockTotalmem.mockReturnValue(16 * 1024 ** 3); // 16GB total -> 8GB used

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'mem', type: 'free-memory' };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('Mem: 8.0G/16.0G');
        });

        it('should handle fractional gigabytes', () => {
            mockFreemem.mockReturnValue(4.5 * 1024 ** 3); // 4.5GB free
            mockTotalmem.mockReturnValue(32 * 1024 ** 3); // 32GB total -> 27.5GB used

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'mem', type: 'free-memory', rawValue: true };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('27.5G/32.0G');
        });

        it('should handle megabyte values', () => {
            mockFreemem.mockReturnValue(512 * 1024 ** 2); // 512MB free
            mockTotalmem.mockReturnValue(1024 * 1024 ** 2); // 1GB total -> 512MB used

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'mem', type: 'free-memory', rawValue: true };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('512M/1.0G');
        });
    });
});