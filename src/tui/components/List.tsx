import type { ForegroundColorName } from 'chalk';
import {
    Box,
    Text,
    useInput,
    type BoxProps
} from 'ink';
import {
    useEffect,
    useRef,
    useState,
    type PropsWithChildren
} from 'react';

export interface ListEntry<V = string | number> {
    label: string;
    sublabel?: string;
    disabled?: boolean;
    description?: string;
    value: V;
    props?: BoxProps;
}

interface ListProps<V = string | number> extends BoxProps {
    items: (ListEntry<V> | '-')[];
    onSelect: (value: V, index: number) => void;
    onSelectionChange?: (value: V, index: number) => void;
    onBack?: () => void;
    initialSelection?: number;
    color?: ForegroundColorName;
    wrapNavigation?: boolean;
}

export function List<V = string | number>({
    items,
    onSelect,
    onSelectionChange,
    onBack,
    initialSelection = 0,
    color,
    wrapNavigation = true,
    ...boxProps
}: ListProps<V>) {
    const [selectedIndex, setSelectedIndex] = useState(initialSelection);
    const latestOnSelectionChangeRef = useRef(onSelectionChange);

    const selectableItems = items.filter(item => item !== '-' && !item.disabled) as ListEntry<V>[];
    const selectedItem = selectableItems[selectedIndex];
    const selectedValue = selectedItem?.value;
    const actualIndex = items.findIndex(item => item === selectedItem);

    useEffect(() => {
        latestOnSelectionChangeRef.current = onSelectionChange;
    }, [onSelectionChange]);

    useEffect(() => {
        const maxIndex = Math.max(selectableItems.length - 1, 0);
        setSelectedIndex(Math.min(initialSelection, maxIndex));
    }, [initialSelection, selectableItems.length]);

    useEffect(() => {
        if (selectedValue !== undefined) {
            latestOnSelectionChangeRef.current?.(selectedValue, selectedIndex);
        }
    }, [selectedIndex, selectedValue]);

    useInput((_, key) => {
        if (key.upArrow) {
            const prev = selectedIndex - 1;
            const prevIndex = prev < 0
                ? (wrapNavigation ? selectableItems.length - 1 : 0)
                : prev;

            setSelectedIndex(prevIndex);
            return;
        }

        if (key.downArrow) {
            const next = selectedIndex + 1;
            const nextIndex = next > selectableItems.length - 1
                ? (wrapNavigation ? 0 : selectableItems.length - 1)
                : next;

            setSelectedIndex(nextIndex);
            return;
        }

        if (key.return && selectedItem) {
            onSelect(selectedItem.value, selectedIndex);
            return;
        }

        if (key.rightArrow && selectedItem) {
            onSelect(selectedItem.value, selectedIndex);
            return;
        }

        if (key.leftArrow) {
            if (onBack) { onBack(); }
            return;
        }
    });

    return (
        <Box flexDirection='column' {...boxProps}>
            {items.map((item, index) => {
                if (item === '-') {
                    return <ListSeparator key={index} />;
                }

                const isSelected = index === actualIndex;

                return (
                    <ListItem
                        key={index}
                        isSelected={isSelected}
                        color={color}
                        disabled={item.disabled}
                        {...item.props}
                    >
                        <Text>
                            <Text>
                                {item.label}
                            </Text>
                            {item.sublabel && (
                                <Text dimColor={!isSelected}>
                                    {' '}
                                    {item.sublabel}
                                </Text>
                            )}
                        </Text>
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
    disabled?: boolean;
}

export function ListItem({
    children,
    isSelected,
    color = 'green',
    disabled,
    ...boxProps
}: ListItemProps) {
    return (
        <Box {...boxProps}>
            <Text color={isSelected ? color : undefined} dimColor={disabled}>
                <Text>{isSelected ? '▶  ' : '   '}</Text>
                <Text>{children}</Text>
            </Text>
        </Box>
    );
}

export function ListSeparator() {
    return <Text> </Text>;
}