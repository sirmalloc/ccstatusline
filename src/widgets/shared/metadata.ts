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

export function removeMetadataKeys(item: WidgetItem, keys: string[]): WidgetItem {
    const nextMetadata = Object.fromEntries(
        Object.entries(item.metadata ?? {}).filter(([key]) => !keys.includes(key))
    );

    return {
        ...item,
        metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined
    };
}