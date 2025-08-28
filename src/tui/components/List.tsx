import type { ForegroundColorName } from 'chalk';
import {
    Box,
    Text,
    useInput,
    type BoxProps
} from 'ink';
import {
    useMemo,
    useState,
    type PropsWithChildren
} from 'react';

interface ListItemType<V = string | number> {
    label: string | React.ComponentType<{ isSelected: boolean }>;
    description?: string;
    value: V;
    props?: BoxProps;
}

interface ListProps<V = string | number> extends BoxProps {
    items: (ListItemType<V> | '-')[];
    onSelect: (value: V | 'back', index: number) => void;
    initialSelection?: number;
    showBackButton?: boolean;
    color?: ForegroundColorName;
}

export function List<V = string | number>({
    items,
    onSelect,
    initialSelection = 0,
    showBackButton,
    color,
    ...boxProps
}: ListProps<V>) {
    const [selectedIndex, setSelectedIndex] = useState(initialSelection);

    const _items = useMemo(() => {
        if (showBackButton) {
            return [...items, '-' as const, { label: '← Back', value: 'back' as V }];
        }
        return items;
    }, [items, showBackButton]);

    const selectableItems = _items.filter(item => item !== '-');
    const selectedItem = selectableItems[selectedIndex];
    const actualIndex = _items.findIndex(item => item === selectedItem);

    useInput((_, key) => {
        if (key.upArrow) {
            const prev = selectedIndex - 1;
            const prevIndex = prev < 0 ? selectableItems.length - 1 : prev; // wrap around

            setSelectedIndex(prevIndex);
            return;
        }

        if (key.downArrow) {
            const next = selectedIndex + 1;
            const nextIndex = next > selectableItems.length - 1 ? 0 : next; // wrap around

            setSelectedIndex(nextIndex);
            return;
        }

        if (key.return && selectedItem) {
            onSelect(selectedItem.value, selectedIndex);
            return;
        }
    });

    return (
        <Box flexDirection='column' {...boxProps}>
            {_items.map((item, index) => {
                if (item === '-') {
                    return <ListSeparator key={index} />;
                }

                const isSelected = index === actualIndex;

                const Label = item.label;

                return (
                    <ListItem
                        key={index}
                        isSelected={isSelected}
                        color={color}
                        {...item.props}
                    >
                        {typeof item.label === 'string' ? (
                            item.label
                        ) : (
                            <Label isSelected={isSelected} />
                        )}
                    </ListItem>
                );
            })}

            {selectedItem?.description && (
                <Box marginTop={1} paddingLeft={2}>
                    <Text dimColor wrap='wrap'>
                        {selectedItem.description}
                    </Text>
                </Box>
            )}
        </Box>
    );
}

interface ListItemProps extends PropsWithChildren, BoxProps {
    isSelected: boolean;
    color?: ForegroundColorName;
}

export function ListItem({
    children,
    isSelected,
    color = 'green',
    ...boxProps
}: ListItemProps) {
    return (
        <Box {...boxProps}>
            <Text color={isSelected ? color : undefined}>
                <Text>{isSelected ? '▶  ' : '   '}</Text>
                <Text>{children}</Text>
            </Text>
        </Box>
    );
}

export function ListSeparator() {
    return <Text> </Text>;
}