import * as os from 'node:os';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { CurrentWorkingDirWidget } from '../CurrentWorkingDir';

describe('CurrentWorkingDirWidget', () => {
    const widget = new CurrentWorkingDirWidget();
    const defaultHomeDir = '/Users/alice';
    let mockHomedir: { mockReturnValue: (value: string) => void };

    beforeEach(() => {
        vi.restoreAllMocks();
        mockHomedir = vi.spyOn(os, 'homedir').mockReturnValue(defaultHomeDir);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const createContext = (cwd?: string, isPreview = false): RenderContext => ({
        data: cwd ? { cwd } : undefined,
        isPreview
    });

    const defaultSettings: Settings = {
        version: 3,
        lines: [],
        flexMode: 'full',
        compactThreshold: 60,
        colorLevel: 2,
        defaultPadding: ' ',
        inheritSeparatorColors: false,
        globalBold: false,
        minimalistMode: false,
        powerline: {
            enabled: false,
            separators: [],
            separatorInvertBackground: [],
            startCaps: [],
            endCaps: [],
            autoAlign: false,
            continueThemeAcrossLines: false
        }
    };

    const createItem = (
        metadata?: Record<string, string>,
        rawValue = false
    ): WidgetItem => ({
        id: 'test',
        type: 'current-working-dir',
        backgroundColor: 'bgBlue',
        rawValue,
        metadata
    });

    describe('abbreviateHome', () => {
        it('should replace home directory with ~ when enabled', () => {
            mockHomedir.mockReturnValue(defaultHomeDir);
            const item = createItem({ abbreviateHome: 'true' }, true);
            const result = widget.render(
                item,
                createContext(`${defaultHomeDir}/Documents/Projects`),
                defaultSettings
            );
            expect(result).toBe('~/Documents/Projects');
        });

        it('should not replace home directory when disabled', () => {
            const item = createItem(undefined, true);
            const result = widget.render(
                item,
                createContext(`${defaultHomeDir}/Documents/Projects`),
                defaultSettings
            );
            expect(result).toBe(`${defaultHomeDir}/Documents/Projects`);
        });

        it('should not modify paths outside home directory', () => {
            const item = createItem({ abbreviateHome: 'true' }, true);
            const result = widget.render(
                item,
                createContext('/var/log/app'),
                defaultSettings
            );
            expect(result).toBe('/var/log/app');
        });

        it('should not abbreviate non-home sibling paths with shared prefix', () => {
            mockHomedir.mockReturnValue('/Users/al');

            const item = createItem({ abbreviateHome: 'true' }, true);
            const result = widget.render(
                item,
                createContext('/Users/alex/project'),
                defaultSettings
            );

            expect(result).toBe('/Users/alex/project');
        });

        it('should combine with segments option', () => {
            mockHomedir.mockReturnValue(defaultHomeDir);
            const item = createItem({ abbreviateHome: 'true', segments: '2' }, true);
            const result = widget.render(
                item,
                createContext(`${defaultHomeDir}/Documents/Projects/my-project`),
                defaultSettings
            );
            expect(result).toBe('~/.../Projects/my-project');
        });

        it('should show correct preview when abbreviateHome is enabled', () => {
            const item = createItem({ abbreviateHome: 'true' }, true);
            const result = widget.render(
                item,
                createContext(undefined, true),
                defaultSettings
            );
            expect(result).toBe('~/Documents/Projects/my-project');
        });

        it('should show correct preview when abbreviateHome and segments are enabled', () => {
            const item = createItem({ abbreviateHome: 'true', segments: '2' }, true);
            const result = widget.render(
                item,
                createContext(undefined, true),
                defaultSettings
            );
            expect(result).toBe('~/.../Projects/my-project');
        });

        it('should show correct preview when abbreviateHome and one segment are enabled', () => {
            const item = createItem({ abbreviateHome: 'true', segments: '1' }, true);
            const result = widget.render(
                item,
                createContext(undefined, true),
                defaultSettings
            );
            expect(result).toBe('~/.../my-project');
        });

        it('should preserve windows path separators when combining home abbreviation and segments', () => {
            mockHomedir.mockReturnValue('C:\\Users\\alice');

            const item = createItem({ abbreviateHome: 'true', segments: '2' }, true);
            const result = widget.render(
                item,
                createContext('C:\\Users\\alice\\Documents\\Projects\\app'),
                defaultSettings
            );

            expect(result).toBe('~\\...\\Projects\\app');
        });
    });

    describe('getEditorDisplay', () => {
        it('should show ~ modifier when abbreviateHome is enabled', () => {
            const item = createItem({ abbreviateHome: 'true' });
            const display = widget.getEditorDisplay(item);
            expect(display.modifierText).toBe('(~)');
        });

        it('should show ~ and segments modifiers combined', () => {
            const item = createItem({ abbreviateHome: 'true', segments: '2' });
            const display = widget.getEditorDisplay(item);
            expect(display.modifierText).toBe('(~, segments: 2)');
        });

        it('should not show ~ modifier when fishStyle is enabled', () => {
            const item = createItem({ fishStyle: 'true' });
            const display = widget.getEditorDisplay(item);
            expect(display.modifierText).toBe('(fish-style)');
        });

        it('should show basename modifier when basename is only', () => {
            const item = createItem({ basename: 'only' });
            const display = widget.getEditorDisplay(item);
            expect(display.modifierText).toBe('(basename)');
        });

        it('should show basename full modifier when basename is first', () => {
            const item = createItem({ basename: 'first' });
            const display = widget.getEditorDisplay(item);
            expect(display.modifierText).toBe('(basename full)');
        });
    });

    describe('basename mode', () => {
        it('should render only the final directory name in "only" mode', () => {
            const item = createItem({ basename: 'only' }, true);
            const result = widget.render(
                item,
                createContext('/home/chris/src/ccstatusline'),
                defaultSettings
            );
            expect(result).toBe('ccstatusline');
        });

        it('should render basename then parent path in "first" mode', () => {
            const item = createItem({ basename: 'first' }, true);
            const result = widget.render(
                item,
                createContext('/home/chris/src/ccstatusline'),
                defaultSettings
            );
            expect(result).toBe('ccstatusline /home/chris/src');
        });

        it('should abbreviate the parent home dir in "first" mode when abbreviateHome is on', () => {
            mockHomedir.mockReturnValue('/home/chris');
            const item = createItem({ basename: 'first', abbreviateHome: 'true' }, true);
            const result = widget.render(
                item,
                createContext('/home/chris/src/ccstatusline'),
                defaultSettings
            );
            expect(result).toBe('ccstatusline ~/src');
        });
    });

    describe('handleEditorAction', () => {
        it('should enable abbreviateHome and disable fishStyle', () => {
            const item = createItem({ fishStyle: 'true' });
            const result = widget.handleEditorAction('toggle-abbreviate-home', item);
            expect(result?.metadata?.abbreviateHome).toBe('true');
            expect(result?.metadata?.fishStyle).toBeUndefined();
        });

        it('should disable abbreviateHome when toggled off', () => {
            const item = createItem({ abbreviateHome: 'true' });
            const result = widget.handleEditorAction('toggle-abbreviate-home', item);
            expect(result?.metadata?.abbreviateHome).toBeUndefined();
        });

        it('should enable fishStyle and disable abbreviateHome', () => {
            const item = createItem({ abbreviateHome: 'true' });
            const result = widget.handleEditorAction('toggle-fish-style', item);
            expect(result?.metadata?.fishStyle).toBe('true');
            expect(result?.metadata?.abbreviateHome).toBeUndefined();
        });

        it('should cycle basename mode off → only → first → off', () => {
            const off = createItem();
            const toOnly = widget.handleEditorAction('cycle-basename', off);
            expect(toOnly?.metadata?.basename).toBe('only');

            const toFirst = toOnly && widget.handleEditorAction('cycle-basename', toOnly);
            expect(toFirst?.metadata?.basename).toBe('first');

            const backToOff = toFirst && widget.handleEditorAction('cycle-basename', toFirst);
            expect(backToOff?.metadata?.basename).toBeUndefined();
        });

        it('should clear fishStyle and segments when entering basename mode', () => {
            const item = createItem({ fishStyle: 'true', segments: '2' });
            const result = widget.handleEditorAction('cycle-basename', item);
            expect(result?.metadata?.basename).toBe('only');
            expect(result?.metadata?.fishStyle).toBeUndefined();
            expect(result?.metadata?.segments).toBeUndefined();
        });
    });

    describe('getCustomKeybinds', () => {
        it('should include home ~ keybind', () => {
            const keybinds = widget.getCustomKeybinds();
            const homeKeybind = keybinds.find(k => k.key === 'h');
            expect(homeKeybind).toBeDefined();
            expect(homeKeybind?.label).toBe('(h)ome ~');
            expect(homeKeybind?.action).toBe('toggle-abbreviate-home');
        });
    });
});