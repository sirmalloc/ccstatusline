import type {
    CustomKeybind,
    WidgetItem
} from '../../../types/Widget';

function isProgressMode(widget: WidgetItem): boolean {
    const mode = widget.metadata?.display;
    return mode === 'progress' || mode === 'progress-short';
}

export function shouldShowCustomKeybind(widget: WidgetItem, keybind: CustomKeybind): boolean {
    if (keybind.action === 'edit-list-limit') {
        return widget.type === 'skills' && widget.metadata?.mode === 'list';
    }

    if (keybind.action === 'toggle-invert') {
        return isProgressMode(widget);
    }

    if (keybind.action === 'toggle-compact') {
        return !isProgressMode(widget);
    }

    return true;
}