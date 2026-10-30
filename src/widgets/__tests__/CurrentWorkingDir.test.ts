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
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    getVisibleText,
    getVisibleWidth
} from '../../utils/ansi';
import {
    buildFileUrl,
    buildIdeFileUrl,
    renderOsc8Link
} from '../../utils/hyperlink';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../../utils/renderer';
import { sanitizeTerminalText } from '../../utils/terminal-sanitize';
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
        defaultPaddingSide: 'both',
        inheritSeparatorColors: false,
        globalBold: false,
        gitCacheTtlSeconds: 5,
        terminalWidthCacheTtlSeconds: 5,
        customCommandCacheTtlSeconds: 5,
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
        rawValue = false,
        character?: string
    ): WidgetItem => ({
        id: 'test',
        type: 'current-working-dir',
        backgroundColor: 'bgBlue',
        rawValue,
        metadata,
        character
    });

    const renderStatusLineForItem = (item: WidgetItem, cwd: string, terminalWidth = 200): string => {
        const settings: Settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 0,
            defaultPadding: ''
        };
        const context = {
            ...createContext(cwd),
            terminalWidth
        };
        const preRenderedLines = preRenderAllWidgets([[item]], settings, context);
        const preRendered = preRenderedLines[0] ?? [];

        return renderStatusLine(
            [item],
            settings,
            context,
            preRendered,
            calculateMaxWidthsFromPreRendered(preRenderedLines, settings)
        );
    };

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

        it.each([
            { path: 'Projects/my-project', segments: '2', expected: '~/Projects/my-project' },
            { path: 'Projects', segments: '1', expected: '~/Projects' }
        ])('should not count ~ as a segment ($segments of ~/$path)', ({ path, segments, expected }) => {
            const item = createItem({ abbreviateHome: 'true', segments }, true);
            const result = widget.render(
                item,
                createContext(`${defaultHomeDir}/${path}`),
                defaultSettings
            );
            expect(result).toBe(expected);
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

    describe('segments preview', () => {
        it.each([
            { segments: '1', expected: '.../my-project' },
            { segments: '2', expected: '.../Projects/my-project' },
            { segments: '3', expected: '.../Documents/Projects/my-project' },
            { segments: '4', expected: '.../example/Documents/Projects/my-project' },
            { segments: '5', expected: '/Users/example/Documents/Projects/my-project' }
        ])('should preview segments=$segments on the sample path', ({ segments, expected }) => {
            const item = createItem({ segments }, true);
            expect(widget.render(item, createContext(undefined, true), defaultSettings)).toBe(expected);
        });

        it.each([
            { segments: '3', expected: '~/Documents/Projects/my-project' },
            { segments: '4', expected: '~/Documents/Projects/my-project' }
        ])('should preview segments=$segments on the sample path after ~', ({ segments, expected }) => {
            const item = createItem({ abbreviateHome: 'true', segments }, true);
            expect(widget.render(item, createContext(undefined, true), defaultSettings)).toBe(expected);
        });
    });

    describe('fishStyle', () => {
        it('should replace home directory with ~ and abbreviate middle segments', () => {
            const item = createItem({ fishStyle: 'true' }, true);
            const result = widget.render(
                item,
                createContext(`${defaultHomeDir}/Documents/Projects/app`),
                defaultSettings
            );

            expect(result).toBe('~/D/P/app');
        });

        it('should not abbreviate non-home sibling paths with shared prefix', () => {
            mockHomedir.mockReturnValue('/Users/al');

            const item = createItem({ fishStyle: 'true' }, true);
            const result = widget.render(
                item,
                createContext('/Users/alex/project'),
                defaultSettings
            );

            expect(result).toBe('/Users/a/project');
        });
    });

    describe('links', () => {
        it('is off by default and leaves the existing output unchanged', () => {
            const item = createItem();
            expect(widget.render(item, createContext('/var/www/site'), defaultSettings)).toBe('cwd: /var/www/site');
        });

        it.each([
            {
                mode: 'file',
                path: '/Users/alice/Documents/我的 项目 #1?%',
                visiblePath: '~/Documents/我的 项目 #1?%',
                buildTarget: buildFileUrl
            },
            {
                mode: 'vscode',
                path: '/Users/alice/Documents/我的 项目 #1?%',
                visiblePath: '~/Documents/我的 项目 #1?%',
                buildTarget: (path: string) => buildIdeFileUrl(path, 'vscode')
            },
            {
                mode: 'cursor',
                path: '/Users/alice/Documents/我的 项目 #1?%',
                visiblePath: '~/Documents/我的 项目 #1?%',
                buildTarget: (path: string) => buildIdeFileUrl(path, 'cursor')
            }
        ])('links the shortened $mode label to the full absolute cwd', ({ mode, path, visiblePath, buildTarget }) => {
            const item = createItem({
                abbreviateHome: 'true',
                segments: '2',
                linkTo: mode
            }, true);

            expect(widget.render(item, createContext(path), defaultSettings)).toBe(
                renderOsc8Link(buildTarget(path) ?? '', visiblePath)
            );
        });

        it('links file-manager URLs with file URL semantics for Windows drive paths', () => {
            const path = 'C:\\Users\\alice\\我的 project#1?%';
            const item = createItem({ linkTo: 'file' }, true);

            expect(widget.render(item, createContext(path), defaultSettings)).toBe(
                renderOsc8Link('file:///C:/Users/alice/%E6%88%91%E7%9A%84%20project%231%3F%25', path)
            );
        });

        it('links file-manager URLs with UNC network semantics', () => {
            const path = '\\\\server\\share\\我的 project#1?%';
            const item = createItem({ linkTo: 'file' }, true);

            expect(widget.render(item, createContext(path), defaultSettings)).toBe(
                renderOsc8Link('file://server/share/%E6%88%91%E7%9A%84%20project%231%3F%25', path)
            );
        });

        it.each([
            { mode: 'file', target: 'file:///tmp/a%5Cb' },
            { mode: 'vscode', target: 'vscode://file/tmp/a%5Cb' },
            { mode: 'cursor', target: 'cursor://file/tmp/a%5Cb' }
        ])('treats literal backslashes in a POSIX cwd as part of the filename in $mode mode', ({ mode, target }) => {
            const path = '/tmp/a\\b';
            const item = createItem({ linkTo: mode }, true);

            expect(widget.render(item, createContext(path), defaultSettings)).toBe(
                renderOsc8Link(target, path)
            );
        });

        it('falls back to the visible label for an invalid UNC server or malformed Unicode', () => {
            const item = createItem({ linkTo: 'file' }, true);
            const malformedUnicode = '/tmp/\uD800';

            expect(widget.render(item, createContext('\\\\server#fragment\\share'), defaultSettings))
                .toBe('\\\\server#fragment\\share');
            expect(widget.render(item, createContext(malformedUnicode), defaultSettings))
                .toBe(malformedUnicode);
        });

        it('keeps incomplete paths visible without creating a bogus target', () => {
            const item = createItem({ linkTo: 'file' }, true);

            expect(widget.render(item, createContext('relative/project'), defaultSettings)).toBe('relative/project');
            expect(widget.render(item, createContext('C:'), defaultSettings)).toBe('C:');
        });

        it('does not create a link for an unknown or inapplicable mode', () => {
            const unknownMode = createItem({ linkTo: 'browser' }, true);
            const ideUnc = createItem({ linkTo: 'vscode' }, true);

            expect(widget.render(unknownMode, createContext('/var/www/site'), defaultSettings)).toBe('/var/www/site');
            expect(widget.render(ideUnc, createContext('relative/project'), defaultSettings)).toBe('relative/project');
        });

        it('does not render a link when cwd is missing', () => {
            const item = createItem({ linkTo: 'file' }, true);
            expect(widget.render(item, createContext(), defaultSettings)).toBeNull();
        });

        it('previews the shortened label and complete file target', () => {
            const item = createItem({
                abbreviateHome: 'true',
                segments: '2',
                linkTo: 'file'
            });

            expect(widget.render(item, createContext(undefined, true), defaultSettings)).toBe(
                renderOsc8Link(
                    buildFileUrl('/Users/example/Documents/Projects/my-project') ?? '',
                    'cwd: ~/.../Projects/my-project'
                )
            );
        });

        it('keeps the visible text shortened in the actual renderer while preserving the full target', () => {
            const path = '/Volumes/External/中文 项目 #1?%/nested/final';
            const item = createItem({
                abbreviateHome: 'false',
                segments: '2',
                fishStyle: 'true',
                linkTo: 'cursor'
            }, true);

            expect(renderStatusLineForItem(item, path)).toBe(
                renderOsc8Link(
                    buildIdeFileUrl(path, 'cursor'),
                    '/Volumes/E/中/n/final'
                )
            );
        });

        it('does not count OSC 8 escapes toward status line width or truncation', () => {
            const item = createItem({ linkTo: 'file' }, true);
            const rendered = renderStatusLineForItem(item, '/var/www/site', 200);
            const visible = getVisibleText(rendered);

            expect(visible).toBe('/var/www/site');
            expect(getVisibleWidth(rendered)).toBe(visible.length);
            expect(getVisibleWidth(rendered)).toBeLessThan(200);
        });

        it('does not let OSC 8 controls in a cwd become part of the hyperlink sequence', () => {
            const path = '/var/www/\x1b]8;;https://evil.test\x1b\\';
            const item = createItem({ linkTo: 'file' }, true);
            const result = widget.render(item, createContext(path), defaultSettings);

            expect(result).toContain('file:///var/www/%1B%5D8%3B%3Bhttps%3A//evil.test%1B%5C');
            const sanitized = sanitizeTerminalText(result ?? '');
            expect(sanitized).toBe(renderOsc8Link(
                'file:///var/www/%1B%5D8%3B%3Bhttps%3A//evil.test%1B%5C',
                '/var/www/\x1b]8;;https://evil.test\x1b\\'
            ));
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

        it('should show the active link mode with existing modifiers', () => {
            expect(widget.getEditorDisplay(createItem({
                abbreviateHome: 'true',
                segments: '2',
                linkTo: 'file'
            })).modifierText).toBe('(~, segments: 2, link: file)');
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

        it('should cycle file, VS Code, Cursor, then off without changing display metadata', () => {
            const base = createItem({ abbreviateHome: 'true', segments: '2' });
            const file = widget.handleEditorAction('cycle-link', base);
            const vscode = widget.handleEditorAction('cycle-link', file ?? base);
            const cursor = widget.handleEditorAction('cycle-link', vscode ?? base);
            const off = widget.handleEditorAction('cycle-link', cursor ?? base);

            expect(file?.metadata).toEqual({ abbreviateHome: 'true', segments: '2', linkTo: 'file' });
            expect(vscode?.metadata?.linkTo).toBe('vscode');
            expect(cursor?.metadata?.linkTo).toBe('cursor');
            expect(off?.metadata).toEqual({ abbreviateHome: 'true', segments: '2' });
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

        it('should expose a (g)lyph symbol-override keybind', () => {
            const keybinds = widget.getCustomKeybinds();
            const glyphKeybind = keybinds.find(k => k.key === 'g');
            expect(glyphKeybind).toBeDefined();
            expect(glyphKeybind?.action).toBe('edit-symbol-override');
        });

        it('should expose the existing-style link cycle keybind without changing other controls', () => {
            expect(widget.getCustomKeybinds()).toContainEqual({
                key: 'l',
                label: '(l)ink mode',
                action: 'cycle-link'
            });
            expect(widget.getCustomKeybinds().map(keybind => keybind.key)).toEqual(['h', 's', 'f', 'l', 'g']);
        });
    });

    describe('glyph symbol override', () => {
        it('renders no glyph prefix by default, leaving the cwd: label intact', () => {
            const item = createItem(undefined, false);
            const result = widget.render(item, createContext('/var/www/site'), defaultSettings);
            expect(result).toBe('cwd: /var/www/site');
        });

        it('prefixes the labeled output with the configured glyph', () => {
            const item = createItem(undefined, false, '📁');
            const result = widget.render(item, createContext('/var/www/site'), defaultSettings);
            expect(result).toBe('📁 cwd: /var/www/site');
        });

        it('keeps the glyph in raw value mode while dropping the cwd: label', () => {
            const item = createItem(undefined, true, '📁');
            const result = widget.render(item, createContext('/var/www/site'), defaultSettings);
            expect(result).toBe('📁 /var/www/site');
        });

        it('composes the glyph with raw value and segment truncation', () => {
            const item = createItem({ segments: '2' }, true, '📁');
            const result = widget.render(item, createContext('/var/www/html/my-project'), defaultSettings);
            expect(result).toBe('📁 .../html/my-project');
        });

        it('shows the glyph in preview mode', () => {
            const item = createItem(undefined, true, '📁');
            const result = widget.render(item, createContext(undefined, true), defaultSettings);
            expect(result).toBe('📁 /Users/example/Documents/Projects/my-project');
        });
    });
});
