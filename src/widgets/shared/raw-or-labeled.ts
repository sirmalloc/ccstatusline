import type { WidgetItem } from '../../types/Widget';

export function formatRawOrLabeledValue(item: WidgetItem, labelPrefix: string, value: string): string {
    return item.rawValue ? value : `${labelPrefix}${value}`;
}