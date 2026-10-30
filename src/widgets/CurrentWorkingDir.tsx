import {
    Box,
    Text,
    useInput
} from 'ink';
import * as os from 'node:os';
import React, { useState } from 'react';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import type { IdeLinkMode } from '../utils/hyperlink';
import {
    IDE_LINK_MODES,
    buildFileUrl,
    buildIdeFileUrl,
    renderOsc8Link
} from '../utils/hyperlink';
import { shouldInsertInput } from '../utils/input-guards';

import { BlinkingCursor } from './shared/BlinkingCursor';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    SYMBOL_OVERRIDE_ACTION,
    formatSymbolPrefix,
    getSymbolKeybind,
    renderSymbolOverrideEditor
} from './shared/symbol-override';

const LABEL = 'cwd: ';
const LINK_KEY = 'linkTo';
const CYCLE_LINK_ACTION = 'cycle-link';
const CWD_LINK_MODES = ['file', ...IDE_LINK_MODES] as const;
type CwdLinkMode = (typeof CWD_LINK_MODES)[number];
const LINK_MODE_LABELS: Record<CwdLinkMode, string> = {
    file: 'file',
    vscode: 'VS Code',
    cursor: 'Cursor'
};

export class CurrentWorkingDirWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows the current working directory'; }
    getDisplayName(): string { return 'Current Working Dir'; }
    getCategory(): string { return 'Environment'; }
    getLabelPrefix(): string { return LABEL; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const segments = item.metadata?.segments ? Number.parseInt(item.metadata.segments, 10) : undefined;
        const fishStyle = item.metadata?.fishStyle === 'true';
        const abbreviateHome = item.metadata?.abbreviateHome === 'true';
        const linkMode = this.getLinkMode(item);
        const modifiers: string[] = [];

        if (abbreviateHome) {
            modifiers.push('~');
        }

        if (fishStyle) {
            modifiers.push('fish-style');
        } else if (segments && segments > 0) {
            modifiers.push(`segments: ${segments}`);
        }

        if (linkMode) {
            modifiers.push(`link: ${LINK_MODE_LABELS[linkMode]}`);
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_LINK_ACTION) {
            return this.cycleLinkMode(item);
        }

        if (action === 'toggle-abbreviate-home') {
            const currentAbbreviateHome = item.metadata?.abbreviateHome === 'true';
            const newAbbreviateHome = !currentAbbreviateHome;

            if (newAbbreviateHome) {
                // When enabling abbreviateHome, disable fishStyle (mutually exclusive)
                const { fishStyle, ...restMetadata } = item.metadata ?? {};
                return {
                    ...item,
                    metadata: {
                        ...restMetadata,
                        abbreviateHome: 'true'
                    }
                };
            } else {
                // When disabling abbreviateHome
                const { abbreviateHome, ...restMetadata } = item.metadata ?? {};

                return {
                    ...item,
                    metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
                };
            }
        }

        if (action === 'toggle-fish-style') {
            const currentFishStyle = item.metadata?.fishStyle === 'true';
            const newFishStyle = !currentFishStyle;

            // Toggle fish style and clear segments
            if (newFishStyle) {
                // When enabling fish-style, clear segments and abbreviateHome (mutually exclusive)
                const { segments, abbreviateHome, ...restMetadata } = item.metadata ?? {};
                return {
                    ...item,
                    metadata: {
                        ...restMetadata,
                        fishStyle: 'true'
                    }
                };
            } else {
                // When disabling fish-style
                const { fishStyle, ...restMetadata } = item.metadata ?? {};

                return {
                    ...item,
                    metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
                };
            }
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const segments = item.metadata?.segments ? Number.parseInt(item.metadata.segments, 10) : undefined;
        const fishStyle = item.metadata?.fishStyle === 'true';
        const abbreviateHome = item.metadata?.abbreviateHome === 'true';
        const symbolPrefix = formatSymbolPrefix(item, '');
        const linkMode = this.getLinkMode(item);

        if (context.isPreview) {
            let previewPath: string;
            const fullPreviewPath = '/Users/example/Documents/Projects/my-project';

            if (fishStyle) {
                previewPath = '~/D/P/my-project';
            } else {
                previewPath = abbreviateHome ? '~/Documents/Projects/my-project' : fullPreviewPath;
                if (segments && segments > 0) {
                    previewPath = this.keepLastSegments(previewPath, segments);
                }
            }

            const text = `${symbolPrefix}${formatRawOrLabeledValue(item, this.getLabelPrefix(), previewPath)}`;
            const linkTarget = linkMode ? this.buildLinkTarget(fullPreviewPath, linkMode) : null;
            return linkTarget ? renderOsc8Link(linkTarget, text) : text;
        }

        const cwd = context.data?.cwd;
        if (!cwd)
            return null;

        let displayPath = cwd;

        if (fishStyle) {
            displayPath = this.abbreviatePath(cwd);
        } else {
            // Apply home abbreviation first if enabled
            if (abbreviateHome) {
                displayPath = this.abbreviateHomeDir(displayPath);
            }

            // Then apply segments truncation
            if (segments && segments > 0) {
                displayPath = this.keepLastSegments(displayPath, segments);
            }
        }

        const text = `${symbolPrefix}${formatRawOrLabeledValue(item, this.getLabelPrefix(), displayPath)}`;
        const linkTarget = linkMode ? this.buildLinkTarget(cwd, linkMode) : null;
        return linkTarget ? renderOsc8Link(linkTarget, text) : text;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ome ~', action: 'toggle-abbreviate-home' },
            { key: 's', label: '(s)egments', action: 'edit-segments' },
            { key: 'f', label: '(f)ish style', action: 'toggle-fish-style' },
            { key: 'l', label: '(l)ink mode', action: CYCLE_LINK_ACTION },
            getSymbolKeybind()
        ];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        if (props.action === SYMBOL_OVERRIDE_ACTION) {
            return renderSymbolOverrideEditor(props, '');
        }
        return <CurrentWorkingDirEditor {...props} />;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }

    private getLinkMode(item: WidgetItem): CwdLinkMode | null {
        const configuredMode = item.metadata?.[LINK_KEY];
        return configuredMode && CWD_LINK_MODES.includes(configuredMode as CwdLinkMode)
            ? configuredMode as CwdLinkMode
            : null;
    }

    private cycleLinkMode(item: WidgetItem): WidgetItem {
        const currentMode = this.getLinkMode(item);
        const currentIndex = currentMode ? CWD_LINK_MODES.indexOf(currentMode) : -1;
        const nextMode = currentIndex === CWD_LINK_MODES.length - 1
            ? null
            : (CWD_LINK_MODES[currentIndex + 1] ?? null);
        const {
            [LINK_KEY]: removedLink,
            ...restMetadata
        } = item.metadata ?? {};

        return {
            ...item,
            metadata: nextMode
                ? { ...restMetadata, [LINK_KEY]: nextMode }
                : (Object.keys(restMetadata).length > 0 ? restMetadata : undefined)
        };
    }

    private buildLinkTarget(path: string, linkMode: CwdLinkMode): string | null {
        try {
            if (linkMode === 'file') {
                return buildFileUrl(path);
            }

            return this.isAbsoluteFilePath(path)
                ? buildIdeFileUrl(path, linkMode satisfies IdeLinkMode)
                : null;
        } catch {
            // The cwd comes from session input. A malformed Unicode path should
            // keep the widget visible without enabling a broken link.
            return null;
        }
    }

    private isAbsoluteFilePath(path: string): boolean {
        return path.startsWith('/')
            || /^[A-Za-z]:[\\/]/.test(path)
            || /^\\\\[^\\]/.test(path);
    }

    private keepLastSegments(path: string, segments: number): string {
        // Support both POSIX ('/') and Windows ('\\') separators; preserve original separator in output
        const useBackslash = path.includes('\\') && !path.includes('/');
        const outSep = useBackslash ? '\\' : '/';
        const pathParts = path.split(/[\\/]+/);

        // Remove empty strings from splitting (e.g., leading slash or UNC leading separators)
        const filteredParts = pathParts.filter(part => part !== '');

        // Preserve ~ prefix when combined with segments; it stands for the home
        // directory, so it isn't one of the segments
        const prefix = filteredParts[0] === '~' ? `~${outSep}` : '';
        const pathSegments = prefix ? filteredParts.slice(1) : filteredParts;

        if (pathSegments.length <= segments) {
            return path;
        }

        // Take the last N segments and join with the detected separator
        return prefix + '...' + outSep + pathSegments.slice(-segments).join(outSep);
    }

    private abbreviateHomeDir(path: string): string {
        const homeDir = os.homedir();
        if (path === homeDir) {
            return '~';
        }

        if (path.startsWith(homeDir)) {
            const boundaryChar = path[homeDir.length];
            if (boundaryChar !== '/' && boundaryChar !== '\\') {
                return path;
            }
            return '~' + path.slice(homeDir.length);
        }
        return path;
    }

    private abbreviatePath(path: string): string {
        const useBackslash = path.includes('\\') && !path.includes('/');
        const sep = useBackslash ? '\\' : '/';

        // Replace home directory with ~ (only on a path-segment boundary)
        const normalizedPath = this.abbreviateHomeDir(path);

        // Split path into parts
        const parts = normalizedPath.split(/[\\/]+/).filter(part => part !== '');

        // Keep first and last parts full, abbreviate middle parts
        const abbreviated = parts.map((part, index) => {
            if (index === 0 || index === parts.length - 1) {
                return part;  // Keep full
            }

            // Hidden directories keep the dot
            if (part.startsWith('.') && part.length > 1) {
                return '.' + (part[1] ?? '');
            }

            return part[0];  // Only first letter for others
        });

        // Rebuild path
        if (normalizedPath.startsWith('~')) {
            return abbreviated.join(sep);
        } else if (normalizedPath.startsWith('/')) {
            return sep + abbreviated.join(sep);
        } else {
            return abbreviated.join(sep);
        }
    }
}

const CurrentWorkingDirEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
    const [segmentsInput, setSegmentsInput] = useState(widget.metadata?.segments ?? '');

    useInput((input, key) => {
        if (action === 'edit-segments') {
            if (key.return) {
                const segments = Number.parseInt(segmentsInput, 10);
                if (!Number.isNaN(segments) && segments > 0) {
                    onComplete({
                        ...widget,
                        metadata: {
                            ...widget.metadata,
                            segments: segments.toString()
                        }
                    });
                } else {
                    // Clear segments if blank or invalid
                    const { segments, ...restMetadata } = widget.metadata ?? {};
                    onComplete({
                        ...widget,
                        metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
                    });
                }
            } else if (key.escape) {
                onCancel();
            } else if (key.backspace) {
                setSegmentsInput(segmentsInput.slice(0, -1));
            } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
                setSegmentsInput(segmentsInput + input);
            }
        }
    });

    if (action === 'edit-segments') {
        return (
            <Box flexDirection='column'>
                <Box>
                    <Text>Enter number of segments to display (blank for full path): </Text>
                    <Text>{segmentsInput}</Text>
                    <BlinkingCursor>{' '}</BlinkingCursor>
                </Box>
                <Text dimColor>Press Enter to save, ESC to cancel</Text>
            </Box>
        );
    }

    return <Text>Unknown editor mode</Text>;
};
