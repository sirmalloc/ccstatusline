import * as fs from 'node:fs';
import * as path from 'node:path';
import { isValidElement } from 'react';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { renderWidgetEditor } from '..';
import { DEFAULT_SETTINGS } from '../../../../types/Settings';
import {
    getAllWidgetTypes,
    getWidget
} from '../../../../utils/widgets';

const WIDGETS_DIR = path.resolve(__dirname, '../../../../widgets');

function listSourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return entry.name === '__tests__' ? [] : listSourceFiles(fullPath);
        }
        return /\.tsx?$/.test(entry.name) ? [fullPath] : [];
    });
}

describe('renderWidgetEditor', () => {
    it('maps every editor a widget names for its keybinds to a React element', () => {
        let editorCount = 0;

        for (const type of getAllWidgetTypes(DEFAULT_SETTINGS)) {
            const widget = getWidget(type);
            if (!widget?.renderEditor) {
                continue;
            }

            const item = { id: type, type };
            for (const keybind of widget.getCustomKeybinds?.(item) ?? []) {
                const editor = widget.renderEditor({
                    widget: item,
                    onComplete: vi.fn(),
                    onCancel: vi.fn(),
                    action: keybind.action
                });
                if (editor) {
                    editorCount++;
                    expect(isValidElement(renderWidgetEditor(editor))).toBe(true);
                }
            }
        }

        expect(editorCount).toBeGreaterThan(0);
    });
});

describe('widget modules', () => {
    // The status line render path loads every widget module; ink/React (and
    // yoga's WASM) must only load with the TUI, so editor components live in
    // tui/components/widget-editors and widgets return editor descriptors.
    it('do not import ink or React at runtime', () => {
        const offenders = listSourceFiles(WIDGETS_DIR).filter((file) => {
            const source = fs.readFileSync(file, 'utf8');
            return /^import (?!type )[^;]*from '(ink|react)';/m.test(source);
        });

        expect(offenders.map(file => path.relative(WIDGETS_DIR, file))).toEqual([]);
    });
});
