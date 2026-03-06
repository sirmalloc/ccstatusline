import type { WidgetItem } from '../../types/Widget';

export function isMetadataFlagEnabled(item: WidgetItem, key: string): boolean {
    return item.metadata?.[key] === 'true';
}

export function toggleMetadataFlag(item: WidgetItem, key: string): WidgetItem {
    return {
        ...item,
        metadata: {
            ...item.metadata,
            [key]: (!isMetadataFlagEnabled(item, key)).toString()
        }
    };
}