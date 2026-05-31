import {
    Box,
    Text,
    useInput
} from 'ink';
import React, {
    useMemo,
    useState
} from 'react';

import type { WidgetEditorProps } from '../../types/Widget';
import { shouldInsertInput } from '../../utils/input-guards';
import {
    filterTimezoneOptions,
    getTimezoneMatchSegments,
    getTimezoneOptions,
    type TimezoneOption
} from '../../utils/timezones';

import {
    getUsageTimezone,
    setUsageTimezone
} from './usage-display';

export const TIMEZONE_EDITOR_ACTION = 'edit-timezone';

const MAX_VISIBLE_OPTIONS = 10;

function getInitialSelectedIndex(options: TimezoneOption[], currentTimezone: string | undefined): number {
    const selectedValue = currentTimezone ?? 'UTC';
    const selectedIndex = options.findIndex(option => option.value === selectedValue);
    return selectedIndex === -1 ? 0 : selectedIndex;
}

function getVisibleRange(selectedIndex: number, totalOptions: number): { start: number; end: number } {
    if (totalOptions <= MAX_VISIBLE_OPTIONS) {
        return { start: 0, end: totalOptions };
    }

    const halfWindow = Math.floor(MAX_VISIBLE_OPTIONS / 2);
    const maxStart = totalOptions - MAX_VISIBLE_OPTIONS;
    const start = Math.min(Math.max(0, selectedIndex - halfWindow), maxStart);
    return { start, end: start + MAX_VISIBLE_OPTIONS };
}

export function renderUsageTimezoneEditor(props: WidgetEditorProps): React.ReactElement {
    return <UsageTimezoneEditor {...props} />;
}

export const UsageTimezoneEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
    const currentTimezone = getUsageTimezone(widget);
    const options = useMemo(() => getTimezoneOptions(currentTimezone), [currentTimezone]);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(() => getInitialSelectedIndex(options, currentTimezone));

    const filteredOptions = filterTimezoneOptions(options, query);
    const clampedSelectedIndex = filteredOptions.length === 0
        ? 0
        : Math.min(selectedIndex, filteredOptions.length - 1);
    const selectedOption = filteredOptions[clampedSelectedIndex];
    const visibleRange = getVisibleRange(clampedSelectedIndex, filteredOptions.length);
    const visibleOptions = filteredOptions.slice(visibleRange.start, visibleRange.end);
    const currentLabel = currentTimezone ?? 'UTC';

    useInput((input, key) => {
        if (action !== TIMEZONE_EDITOR_ACTION) {
            return;
        }

        if (key.return) {
            if (selectedOption) {
                onComplete(setUsageTimezone(widget, selectedOption.value));
            }
            return;
        }

        if (key.escape) {
            onCancel();
            return;
        }

        if (key.upArrow || key.downArrow) {
            if (filteredOptions.length === 0) {
                return;
            }

            setSelectedIndex((previous) => {
                const current = Math.min(previous, filteredOptions.length - 1);
                if (key.downArrow) {
                    return current + 1 > filteredOptions.length - 1 ? 0 : current + 1;
                }
                return current - 1 < 0 ? filteredOptions.length - 1 : current - 1;
            });
            return;
        }

        if (key.backspace || key.delete) {
            setQuery(previous => previous.slice(0, -1));
            setSelectedIndex(0);
            return;
        }

        if (shouldInsertInput(input, key)) {
            setQuery(previous => previous + input);
            setSelectedIndex(0);
        }
    });

    if (action !== TIMEZONE_EDITOR_ACTION) {
        return <Text>Unknown editor mode</Text>;
    }

    return (
        <Box flexDirection='column'>
            <Box>
                <Text bold>Timezone</Text>
                <Text dimColor>
                    {' '}
                    Current:
                    {' '}
                    {currentLabel}
                </Text>
            </Box>
            <Box>
                <Text dimColor>Search: </Text>
                <Text color='cyan'>{query || '(none)'}</Text>
            </Box>
            <Text dimColor>Type to search, Up/Down select, Enter save, ESC cancel</Text>
            <Box marginTop={1} flexDirection='column'>
                {filteredOptions.length === 0 ? (
                    <Text dimColor>No timezones match the search.</Text>
                ) : (
                    visibleOptions.map((option, visibleIndex) => {
                        const actualIndex = visibleRange.start + visibleIndex;
                        const isSelected = actualIndex === clampedSelectedIndex;
                        const segments = getTimezoneMatchSegments(option.displayName, query);

                        return (
                            <Box key={option.value} flexDirection='row' flexWrap='nowrap'>
                                <Box width={3}>
                                    <Text color={isSelected ? 'green' : undefined}>
                                        {isSelected ? '> ' : '  '}
                                    </Text>
                                </Box>
                                {segments.map((segment, index) => (
                                    <Text
                                        key={index}
                                        color={isSelected ? 'green' : (segment.matched ? 'yellowBright' : undefined)}
                                        bold={isSelected ? true : segment.matched}
                                    >
                                        {segment.text}
                                    </Text>
                                ))}
                                <Text dimColor>
                                    {' '}
                                    -
                                    {' '}
                                    {option.description}
                                </Text>
                            </Box>
                        );
                    })
                )}
            </Box>
            {filteredOptions.length > MAX_VISIBLE_OPTIONS && (
                <Box marginTop={1}>
                    <Text dimColor>
                        Showing
                        {' '}
                        {visibleRange.start + 1}
                        -
                        {visibleRange.end}
                        {' '}
                        of
                        {' '}
                        {filteredOptions.length}
                    </Text>
                </Box>
            )}
        </Box>
    );
};
