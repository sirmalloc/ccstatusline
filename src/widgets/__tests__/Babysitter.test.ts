import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

vi.mock('fs', () => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn()
}));

vi.mock('os', () => ({ homedir: vi.fn(() => '/home/testuser') }));

import {
    existsSync,
    readFileSync,
    readdirSync
} from 'fs';

import type {
    RenderContext,
    Settings,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { BabysitterWidget } from '../Babysitter';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);

const VALID_STATE = `---
active: true
iteration: 3
max_iterations: 256
run_id: "run-abc123"
started_at: "2026-02-17T14:30:45Z"
last_iteration_at: "2026-02-17T14:35:22Z"
iteration_times: "120,118,125"
---

Build a REST API with authentication`;

const settings: Settings = DEFAULT_SETTINGS;

function makeItem(rawValue = false): WidgetItem {
    return { id: 'babysitter', type: 'babysitter', rawValue };
}

function makeContext(sessionId?: string, isPreview = false): RenderContext {
    return {
        isPreview,
        data: sessionId ? { session_id: sessionId } : undefined
    };
}

function setupMocks(stateContent: string | null) {
    mockReaddirSync.mockReturnValue(['4.0.136'] as unknown as ReturnType<typeof readdirSync>);
    if (stateContent) {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(stateContent);
    } else {
        mockExistsSync.mockReturnValue(false);
    }
}

describe('BabysitterWidget', () => {
    const widget = new BabysitterWidget();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(widget.render(makeItem(), makeContext(undefined, true), settings)).toBe('\u{1F916} Babysitter #3/256');
    });

    it('should render preview with raw value', () => {
        expect(widget.render(makeItem(true), makeContext(undefined, true), settings)).toBe('#3/256');
    });

    it('should return null when no session_id', () => {
        expect(widget.render(makeItem(), makeContext(), settings)).toBeNull();
    });

    it('should return null when state file does not exist', () => {
        setupMocks(null);
        expect(widget.render(makeItem(), makeContext('test-session'), settings)).toBeNull();
    });

    it('should render iteration progress when active', () => {
        setupMocks(VALID_STATE);
        expect(widget.render(makeItem(), makeContext('test-session'), settings)).toBe('\u{1F916} Babysitter #3/256');
    });

    it('should render raw iteration progress', () => {
        setupMocks(VALID_STATE);
        expect(widget.render(makeItem(true), makeContext('test-session'), settings)).toBe('#3/256');
    });

    it('should return null when active is false', () => {
        setupMocks(VALID_STATE.replace('active: true', 'active: false'));
        expect(widget.render(makeItem(), makeContext('test-session'), settings)).toBeNull();
    });

    it('should return null when frontmatter is missing', () => {
        setupMocks('No frontmatter here');
        expect(widget.render(makeItem(), makeContext('test-session'), settings)).toBeNull();
    });

    it('should return null when iteration is not a number', () => {
        setupMocks(VALID_STATE.replace('iteration: 3', 'iteration: abc'));
        expect(widget.render(makeItem(), makeContext('test-session'), settings)).toBeNull();
    });

    it('should return null when plugin directory does not exist', () => {
        mockReaddirSync.mockImplementation(() => { throw new Error('ENOENT'); });
        expect(widget.render(makeItem(), makeContext('test-session'), settings)).toBeNull();
    });

    it('should use latest version directory', () => {
        mockReaddirSync.mockReturnValue(['4.0.100', '4.0.136', '4.0.120'] as unknown as ReturnType<typeof readdirSync>);
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(VALID_STATE);

        widget.render(makeItem(), makeContext('test-session'), settings);

        expect(mockExistsSync).toHaveBeenCalledWith(
            expect.stringContaining('4.0.136')
        );
    });

    it('should have correct metadata', () => {
        expect(widget.getDefaultColor()).toBe('green');
        expect(widget.getDisplayName()).toBe('Babysitter');
        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.supportsColors(makeItem())).toBe(true);
    });
});