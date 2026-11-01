import type {
    WidgetEditorDescriptor,
    WidgetEditorProps
} from '../../types/Widget';

export const TIMEZONE_EDITOR_ACTION = 'edit-timezone';

export function renderUsageTimezoneEditor(props: WidgetEditorProps): WidgetEditorDescriptor {
    return { kind: 'usage-timezone', props };
}
