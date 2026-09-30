import React from 'react';

import type { WidgetEditorDescriptor } from '../../../types/Widget';

import { CurrentWorkingDirEditor } from './CurrentWorkingDirEditor';
import { CustomCommandEditor } from './CustomCommandEditor';
import { CustomSymbolEditor } from './CustomSymbolEditor';
import { CustomTextEditor } from './CustomTextEditor';
import { LinkEditor } from './LinkEditor';
import { MaxWidthEditor } from './MaxWidthEditor';
import { SkillsEditor } from './SkillsEditor';
import { SpeedWindowEditor } from './SpeedWindowEditor';
import { SymbolSlotsEditor } from './SymbolSlotsEditor';
import { UsageLocaleEditor } from './UsageLocaleEditor';
import { UsageTimezoneEditor } from './UsageTimezoneEditor';

// Widgets name their editor with a plain descriptor (Widget.renderEditor) so
// widget modules stay free of ink/React on the status line render path; the
// components live here, reached only through the lazily imported TUI.
export function renderWidgetEditor(editor: WidgetEditorDescriptor): React.ReactElement {
    const { props } = editor;
    switch (editor.kind) {
        case 'current-working-dir': return <CurrentWorkingDirEditor {...props} />;
        case 'custom-command': return <CustomCommandEditor {...props} />;
        case 'custom-symbol': return <CustomSymbolEditor {...props} />;
        case 'custom-text': return <CustomTextEditor {...props} />;
        case 'link': return <LinkEditor {...props} />;
        case 'max-width': return <MaxWidthEditor {...props} />;
        case 'skills': return <SkillsEditor {...props} />;
        case 'speed-window': return <SpeedWindowEditor {...props} />;
        case 'symbol-slots': return <SymbolSlotsEditor {...props} slots={editor.slots} />;
        case 'usage-locale': return <UsageLocaleEditor {...props} />;
        case 'usage-timezone': return <UsageTimezoneEditor {...props} />;
    }
}
