import { Box } from 'ink';
import React from 'react';
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import {
    ImportPreviewDialog,
    getImportPreviewKeys
} from '../ImportPreviewDialog';

describe('ImportPreviewDialog helpers', () => {
    it('includes optional settings that exist only in the imported config', () => {
        const current: Settings = { ...DEFAULT_SETTINGS };
        const imported: Settings = {
            ...DEFAULT_SETTINGS,
            defaultSeparator: ' | ',
            overrideForegroundColor: 'green'
        };

        expect('defaultSeparator' in current).toBe(false);
        expect('overrideForegroundColor' in current).toBe(false);
        expect(getImportPreviewKeys(current, imported)).toEqual(
            expect.arrayContaining(['defaultSeparator', 'overrideForegroundColor'])
        );
    });

    it('renders preview rows in the dynamic Ink region', () => {
        const dialog = ImportPreviewDialog({
            validation: {
                status: 'valid',
                data: { ...DEFAULT_SETTINGS, globalBold: true },
                presentKeys: ['version', 'globalBold']
            },
            currentSettings: DEFAULT_SETTINGS,
            onApply: () => undefined,
            onCancel: () => undefined
        }) as React.ReactElement<{ children: React.ReactNode }>;
        const children = React.Children.toArray(dialog.props.children);
        const previewRows = children[2];

        expect(React.isValidElement(previewRows)).toBe(true);
        if (React.isValidElement(previewRows)) {
            expect(previewRows.type).toBe(Box);
        }
    });
});
