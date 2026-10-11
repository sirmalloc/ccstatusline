import { Text } from 'ink';
import React, { useMemo } from 'react';

import type { WidgetEditorProps } from '../../types/Widget';
import {
    DEFAULT_RESET_LOCALE,
    canonicalizeLocale,
    filterLocaleOptions,
    getLocaleMatchSegments,
    getLocaleOptions
} from '../../utils/locales';
import { LOCALE_EDITOR_ACTION } from '../shared/locale-editor';
import { SearchableOptionEditor } from '../shared/searchable-option-editor';
import {
    getUsageLocale,
    setUsageLocale
} from '../shared/usage-display';

const UsageLocaleEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
    const currentLocale = getUsageLocale(widget);
    const options = useMemo(() => getLocaleOptions(currentLocale), [currentLocale]);

    if (action !== LOCALE_EDITOR_ACTION) {
        return <Text>Unknown editor mode</Text>;
    }

    return (
        <SearchableOptionEditor
            title='Locale'
            currentLabel={currentLocale ?? DEFAULT_RESET_LOCALE}
            initialValue={currentLocale ? canonicalizeLocale(currentLocale) : DEFAULT_RESET_LOCALE}
            options={options}
            filterOptions={filterLocaleOptions}
            getMatchSegments={getLocaleMatchSegments}
            emptyMessage='No locales match the search.'
            onSelect={(locale) => { onComplete(setUsageLocale(widget, locale)); }}
            onCancel={onCancel}
        />
    );
};

export default UsageLocaleEditor;
