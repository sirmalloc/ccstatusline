import * as os from 'node:os';
import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { CurrentWorkingDirWidget } from '../CurrentWorkingDir';

describe('CurrentWorkingDirWidget', () => {
    const widget = new CurrentWorkingDirWidget();
    const homeDir = os.homedir();

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
        powerline: {
            enabled: false,
            separators: [],
            separatorInvertBackground: [],
            startCaps: [],
            endCaps: [],
            autoAlign: false
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
            const item = createItem({ abbreviateHome: 'true' }, true);
            const result = widget.render(
                item,
                createContext(`${homeDir}/Documents/Projects`),
                defaultSettings
            );
            expect(result).toBe('~/Documents/Projects');
        });

        it('should not replace home directory when disabled', () => {
            const item = createItem(undefined, true);
            const result = widget.render(
                item,
                createContext(`${homeDir}/Documents/Projects`),
                defaultSettings
            );
            expect(result).toBe(`${homeDir}/Documents/Projects`);
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

        it('should combine with segments option', () => {
            const item = createItem({ abbreviateHome: 'true', segments: '2' }, true);
            const result = widget.render(
                item,
                createContext(`${homeDir}/Documents/Projects/my-project`),
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