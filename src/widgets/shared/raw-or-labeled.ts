import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

import { removeMetadataKeys } from './metadata';

const LABEL_METADATA_KEY = 'label';
export const EDIT_LABEL_ACTION = 'edit-label';

// 'l' would be the natural mnemonic, but the reset timers already bind it to
// (l)ocale
const LABEL_KEYBIND: CustomKeybind = {
    key: 'b',
    label: 'la(b)el…',
    action: EDIT_LABEL_ACTION
};

/** The item's label override, or the widget's default label for its current mode. */
export function getLabel(item: WidgetItem, defaultLabel: string): string {
    return item.metadata?.[LABEL_METADATA_KEY] ?? defaultLabel;
}

// An override matching the default is dropped so untouched items stay minimal.
// An empty override is kept: it means "no label" rather than "default".
export function setLabel(item: WidgetItem, defaultLabel: string, value: string): WidgetItem {
    if (value === defaultLabel) {
        return removeMetadataKeys(item, [LABEL_METADATA_KEY]);
    }

    return {
        ...item,
        metadata: {
            ...item.metadata,
            [LABEL_METADATA_KEY]: value
        }
    };
}

export function formatRawOrLabeledValue(item: WidgetItem, labelPrefix: string, value: string): string {
    return item.rawValue ? value : `${getLabel(item, labelPrefix)}${value}`;
}

export function getLabelKeybind(): CustomKeybind {
    return LABEL_KEYBIND;
}

export function getLabelModifierText(item: WidgetItem): string | undefined {
    const label = item.metadata?.[LABEL_METADATA_KEY];
    return label === undefined ? undefined : `(label: "${label}")`;
}
