import { Text } from 'ink';
import React, { useMemo } from 'react';

import type { WidgetEditorProps } from '../../../types/Widget';
import {
    filterTimezoneOptions,
    getTimezoneMatchSegments,
    getTimezoneOptions
} from '../../../utils/timezones';
import { TIMEZONE_EDITOR_ACTION } from '../../../widgets/shared/timezone-editor';
import {
    getUsageTimezone,
    setUsageTimezone
} from '../../../widgets/shared/usage-display';

import { SearchableOptionEditor } from './SearchableOptionEditor';

export const UsageTimezoneEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
    const currentTimezone = getUsageTimezone(widget);
    const options = useMemo(() => getTimezoneOptions(currentTimezone), [currentTimezone]);

    if (action !== TIMEZONE_EDITOR_ACTION) {
        return <Text>Unknown editor mode</Text>;
    }

    return (
        <SearchableOptionEditor
            title='Timezone'
            currentLabel={currentTimezone ?? 'UTC'}
            initialValue={currentTimezone ?? 'UTC'}
            options={options}
            filterOptions={filterTimezoneOptions}
            getMatchSegments={getTimezoneMatchSegments}
            emptyMessage='No timezones match the search.'
            onSelect={(timezone) => { onComplete(setUsageTimezone(widget, timezone)); }}
            onCancel={onCancel}
        />
    );
};
