import * as childProcess from 'child_process';
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
import { DockerContainersWidget } from '../DockerContainers';

describe('DockerContainersWidget', () => {
    const widget = new DockerContainersWidget();
    let mockExecSync: {
        mockImplementation: (fn: () => never) => void;
        mockReturnValue: (value: string) => void;
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        mockExecSync = vi.spyOn(childProcess, 'execSync');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('metadata', () => {
        it('should return correct display name', () => {
            expect(widget.getDisplayName()).toBe('Docker Containers');
        });

        it('should return correct description', () => {
            expect(widget.getDescription()).toBe('Lists Docker containers and their status');
        });

        it('should return blue as default color', () => {
            expect(widget.getDefaultColor()).toBe('blue');
        });

        it('should return Environment category', () => {
            expect(widget.getCategory()).toBe('Environment');
        });

        it('should support raw value', () => {
            expect(widget.supportsRawValue()).toBe(true);
        });

        it('should support colors', () => {
            const item: WidgetItem = { id: 'docker', type: 'docker-containers' };
            expect(widget.supportsColors(item)).toBe(true);
        });
    });

    describe('preview mode', () => {
        it('should return sample with prefix in preview mode', () => {
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = { id: 'docker', type: 'docker-containers' };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('🐳 tc-server▲ tc-agent-1▲ db■');
        });

        it('should return sample without prefix when rawValue is true', () => {
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = { id: 'docker', type: 'docker-containers', rawValue: true };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('tc-server▲ tc-agent-1▲ db■');
        });
    });

    describe('rendering', () => {
        it('should render running and exited containers with symbols', () => {
            mockExecSync.mockReturnValue('tc-server|running\ntc-agent-1|running\ndb|exited\n');

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'docker', type: 'docker-containers' };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('🐳 tc-server▲ tc-agent-1▲ db■');
        });

        it('should render paused and restarting states', () => {
            mockExecSync.mockReturnValue('c1|paused\nc2|restarting\nc3|dead\nc4|created\n');

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'docker', type: 'docker-containers', rawValue: true };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('c1◐ c2↻ c3✗ c4◌');
        });

        it('should handle unknown state with fallback symbol', () => {
            mockExecSync.mockReturnValue('c1|weird-state\n');

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'docker', type: 'docker-containers', rawValue: true };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('c1?');
        });

        it('should handle empty container list', () => {
            mockExecSync.mockReturnValue('');

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'docker', type: 'docker-containers' };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('🐳 (none)');
        });

        it('should return empty string for empty list in raw mode', () => {
            mockExecSync.mockReturnValue('');

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'docker', type: 'docker-containers', rawValue: true };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('');
        });

        it('should be case-insensitive for state names', () => {
            mockExecSync.mockReturnValue('c1|Running\nc2|EXITED\n');

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'docker', type: 'docker-containers', rawValue: true };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('c1▲ c2■');
        });
    });

    describe('error handling', () => {
        it('should return [No docker] when docker is not installed', () => {
            mockExecSync.mockImplementation(() => {
                const err = new Error('not found') as Error & { code?: string };
                err.code = 'ENOENT';
                throw err;
            });

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'docker', type: 'docker-containers' };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('[No docker]');
        });

        it('should return [Docker timeout] on timeout', () => {
            mockExecSync.mockImplementation(() => {
                const err = new Error('timeout') as Error & { code?: string };
                err.code = 'ETIMEDOUT';
                throw err;
            });

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'docker', type: 'docker-containers' };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('[Docker timeout]');
        });

        it('should return [Docker down] when daemon is unreachable', () => {
            mockExecSync.mockImplementation(() => {
                throw new Error('Cannot connect to the Docker daemon');
            });

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'docker', type: 'docker-containers' };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBe('[Docker down]');
        });

        it('should return null errors in raw mode', () => {
            mockExecSync.mockImplementation(() => {
                const err = new Error('not found') as Error & { code?: string };
                err.code = 'ENOENT';
                throw err;
            });

            const context: RenderContext = {};
            const item: WidgetItem = { id: 'docker', type: 'docker-containers', rawValue: true };

            const result = widget.render(item, context, DEFAULT_SETTINGS);

            expect(result).toBeNull();
        });
    });
});
