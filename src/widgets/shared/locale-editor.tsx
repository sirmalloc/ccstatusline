import React from 'react';

import type { WidgetEditorProps } from '../../types/Widget';

import { lazyEditor } from './lazy-editor';

export const LOCALE_EDITOR_ACTION = 'edit-locale';

export function renderUsageLocaleEditor(props: WidgetEditorProps): React.ReactElement {
    return <UsageLocaleEditor {...props} />;
}

export const UsageLocaleEditor = lazyEditor(() => import('../editors/UsageLocaleEditor'));
