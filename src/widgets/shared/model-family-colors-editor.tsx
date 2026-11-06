import React from 'react';

import type { WidgetEditorProps } from '../../types/Widget';

import {
    ColorListEditor,
    type ColorListEditorConfig
} from './color-list-editor';
import {
    MODEL_FAMILIES,
    formatModelName,
    getFamilyColor,
    isFamilyColorsEnabled,
    resetFamilyColors,
    setFamilyColor,
    setFamilyColorsEnabled,
    type ModelFamily
} from './model-family-style';

export const EDIT_FAMILY_COLORS_ACTION = 'edit-family-colors';
export const MODEL_DEFAULT_COLOR = 'cyan';

const SAMPLE_NAMES: Record<ModelFamily, string> = {
    opus: 'Opus',
    sonnet: 'Sonnet',
    haiku: 'Haiku',
    fable: 'Fable'
};

const FAMILY_COLORS_CONFIG: ColorListEditorConfig<ModelFamily> = {
    title: 'Model: family colors',
    toggleLabel: 'Family colors',
    rows: MODEL_FAMILIES.map(family => ({ kind: 'color' as const, key: family, label: family })),
    isEnabled: isFamilyColorsEnabled,
    setEnabled: setFamilyColorsEnabled,
    getColor: getFamilyColor,
    setColor: setFamilyColor,
    resetColors: resetFamilyColors,
    renderSample: (item, family, colors) => formatModelName(item, SAMPLE_NAMES[family], family, colors),
    defaultColor: MODEL_DEFAULT_COLOR
};

export const ModelFamilyColorsEditor: React.FC<WidgetEditorProps> = props => (
    <ColorListEditor {...props} config={FAMILY_COLORS_CONFIG} />
);
