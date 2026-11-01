import type {
    WidgetEditorDescriptor,
    WidgetEditorProps
} from '../../types/Widget';

export const LOCALE_EDITOR_ACTION = 'edit-locale';

export function renderUsageLocaleEditor(props: WidgetEditorProps): WidgetEditorDescriptor {
    return { kind: 'usage-locale', props };
}
