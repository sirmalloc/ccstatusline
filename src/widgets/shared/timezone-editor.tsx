import React from 'react';

import type { WidgetEditorProps } from '../../types/Widget';

import { lazyEditor } from './lazy-editor';

export const TIMEZONE_EDITOR_ACTION = 'edit-timezone';

export function renderUsageTimezoneEditor(props: WidgetEditorProps): React.ReactElement {
    return <UsageTimezoneEditor {...props} />;
}

export const UsageTimezoneEditor = lazyEditor(() => import('../editors/UsageTimezoneEditor'));
