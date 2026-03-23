import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import { getColorLevelString } from '../../types/ColorLevel';
import {
    DISPLAY_OPERATOR_LABELS,
    OPERATOR_LABELS,
    getConditionNot,
    getConditionOperator,
    getConditionValue,
    getConditionWidget,
    getDisplayOperator,
    isBooleanOperator,
    isSetOperator,
    isStringOperator
} from '../../types/Condition';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { applyColors } from '../../utils/colors';
import {
    extractWidgetOverrides,
    mergeWidgetWithRuleApply
} from '../../utils/widget-properties';
import { getWidget } from '../../utils/widgets';

import { ConditionEditor } from './ConditionEditor';
import {
    getCurrentColorInfo,
    handleColorInput,
    type ColorEditorState
} from './color-editor/input-handlers';
import { handleWidgetPropertyInput } from './items-editor/input-handlers';

export interface RulesEditorProps {
    widget: WidgetItem;
    settings: Settings;
    onUpdate: (updatedWidget: WidgetItem) => void;
    onBack: () => void;
}

type RulesEditorMode = 'color' | 'property';

export const RulesEditor: React.FC<RulesEditorProps> = ({ widget, settings, onUpdate, onBack }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [moveMode, setMoveMode] = useState(false);
    const [conditionEditorIndex, setConditionEditorIndex] = useState<number | null>(null);
    const [editorMode, setEditorMode] = useState<RulesEditorMode>('property');
    const [colorEditorState, setColorEditorState] = useState<ColorEditorState>({
        editingBackground: false,
        hexInputMode: false,
        hexInput: '',
        ansi256InputMode: false,
        ansi256Input: ''
    });
    const [customEditorWidget, setCustomEditorWidget] = useState<{ widget: WidgetItem; impl: ReturnType<typeof getWidget>; action?: string } | null>(null);
    const rules = widget.rules ?? [];

    // Add new rule with placeholder values
    const addRule = () => {
        const newRule = {
            when: { greaterThan: 50 },  // Placeholder - Phase 4 will make this editable
            apply: {},                   // Empty overrides - Phase 7 will make this editable
            stop: false
        };

        const newRules = [...rules, newRule];
        const updatedWidget = { ...widget, rules: newRules };
        onUpdate(updatedWidget);
        setSelectedIndex(newRules.length - 1);  // Select newly added rule
    };

    // Delete selected rule
    const deleteRule = () => {
        if (rules.length === 0) {
            return;
        }

        const newRules = rules.filter((_, i) => i !== selectedIndex);
        const updatedWidget = { ...widget, rules: newRules };
        onUpdate(updatedWidget);

        // Adjust selection after delete (same pattern as ItemsEditor)
        if (selectedIndex >= newRules.length && selectedIndex > 0) {
            setSelectedIndex(selectedIndex - 1);
        }
    };

    // Handle custom editor completion
    const handleEditorComplete = (updatedWidget: WidgetItem) => {
        const rule = rules[selectedIndex];
        if (!rule) {
            setCustomEditorWidget(null);
            return;
        }

        // Extract what changed compared to base widget
        const newApply = extractWidgetOverrides(updatedWidget, widget, rule.apply);
        const newRules = [...rules];
        newRules[selectedIndex] = {
            ...rule,
            apply: newApply
        };
        onUpdate({ ...widget, rules: newRules });
        setCustomEditorWidget(null);
    };

    // Handle custom editor cancellation
    const handleEditorCancel = () => {
        setCustomEditorWidget(null);
    };

    // Handle color mode input using shared handler
    const handleColorModeInput = (input: string, key: { leftArrow?: boolean; rightArrow?: boolean; escape?: boolean; return?: boolean; backspace?: boolean; delete?: boolean; upArrow?: boolean; downArrow?: boolean }) => {
        const rule = rules[selectedIndex];
        if (!rule) {
            return;
        }

        // Create temp widget by merging base + apply
        const tempWidget = mergeWidgetWithRuleApply(widget, rule.apply);

        // Use shared color input handler
        handleColorInput({
            input,
            key,
            widget: tempWidget,
            settings,
            state: colorEditorState,
            setState: setColorEditorState,
            onUpdate: (updatedWidget) => {
                // Extract what changed compared to base widget
                const newApply = extractWidgetOverrides(updatedWidget, widget, rule.apply);
                const newRules = [...rules];
                newRules[selectedIndex] = {
                    ...rule,
                    apply: newApply
                };
                onUpdate({ ...widget, rules: newRules });
            },
            onReset: () => {
                // Reset colors to base widget (remove color/backgroundColor/bold from apply)
                const resetWidget = {
                    ...tempWidget,
                    color: widget.color,
                    backgroundColor: widget.backgroundColor,
                    bold: widget.bold
                };
                const newApply = extractWidgetOverrides(resetWidget, widget, rule.apply);
                const newRules = [...rules];
                newRules[selectedIndex] = {
                    ...rule,
                    apply: newApply
                };
                onUpdate({ ...widget, rules: newRules });
            }
        });
    };

    // Handle property mode input
    const handlePropertyModeInput = (input: string, key: { ctrl?: boolean; meta?: boolean }) => {
        const rule = rules[selectedIndex];
        if (!rule) {
            return;
        }

        // Handle rule-specific properties
        if (input === 's') {
            // Toggle stop flag
            const newRules = [...rules];
            newRules[selectedIndex] = {
                ...rule,
                stop: !rule.stop
            };
            onUpdate({ ...widget, rules: newRules });
            return;
        }

        if (input === 'h') {
            // Toggle hide flag
            const tempWidget = mergeWidgetWithRuleApply(widget, rule.apply);
            const updatedWidget = { ...tempWidget, hide: !tempWidget.hide };

            // Extract diffs and update
            const newApply = extractWidgetOverrides(updatedWidget, widget, rule.apply);
            const newRules = [...rules];
            newRules[selectedIndex] = {
                ...rule,
                apply: newApply
            };
            onUpdate({ ...widget, rules: newRules });
            return;
        }

        if (input === 'c') {
            // Clear only property overrides (NOT color/bold/hide - those are managed separately)
            const newRules = [...rules];
            const { color, backgroundColor, bold, hide, ...restApply } = rule.apply;

            // Preserve color/bold/hide if they exist
            const newApply: Record<string, unknown> = {};
            if (color !== undefined) {
                newApply.color = color;
            }
            if (backgroundColor !== undefined) {
                newApply.backgroundColor = backgroundColor;
            }
            if (bold !== undefined) {
                newApply.bold = bold;
            }
            if (hide !== undefined) {
                newApply.hide = hide;
            }

            void restApply; // All other properties are cleared

            newRules[selectedIndex] = {
                ...rule,
                apply: newApply
            };
            onUpdate({ ...widget, rules: newRules });
            return;
        }

        // Handle widget property toggles ('r', 'm', custom keybinds) using shared logic
        // Create temp widget by merging base widget with rule.apply
        const tempWidget = mergeWidgetWithRuleApply(widget, rule.apply);

        handleWidgetPropertyInput({
            input,
            key,
            widget: tempWidget,
            onUpdate: (updatedWidget) => {
                // Extract what changed compared to base widget
                const newApply = extractWidgetOverrides(updatedWidget, widget, rule.apply);

                const newRules = [...rules];
                newRules[selectedIndex] = {
                    ...rule,
                    apply: newApply
                };
                onUpdate({ ...widget, rules: newRules });
            },
            getCustomKeybindsForWidget: (widgetImpl, w) => {
                return widgetImpl.getCustomKeybinds?.(w) ?? [];
            },
            setCustomEditorWidget
        });
    };

    // Handle move mode input
    const handleMoveMode = (key: { upArrow?: boolean; downArrow?: boolean; return?: boolean; escape?: boolean }) => {
        if (key.upArrow && selectedIndex > 0) {
            // Swap with rule above
            const newRules = [...rules];
            const currentRule = newRules[selectedIndex];
            const previousRule = newRules[selectedIndex - 1];
            if (!currentRule || !previousRule) {
                return;
            }
            newRules[selectedIndex] = previousRule;
            newRules[selectedIndex - 1] = currentRule;

            onUpdate({ ...widget, rules: newRules });
            setSelectedIndex(selectedIndex - 1);
        } else if (key.downArrow && selectedIndex < rules.length - 1) {
            // Swap with rule below
            const newRules = [...rules];
            const currentRule = newRules[selectedIndex];
            const nextRule = newRules[selectedIndex + 1];
            if (!currentRule || !nextRule) {
                return;
            }
            newRules[selectedIndex] = nextRule;
            newRules[selectedIndex + 1] = currentRule;

            onUpdate({ ...widget, rules: newRules });
            setSelectedIndex(selectedIndex + 1);
        } else if (key.escape || key.return) {
            setMoveMode(false);
        }
    };

    useInput((input, key) => {
        if (customEditorWidget) {
            return;  // Let custom editor handle input
        }

        if (moveMode) {
            handleMoveMode(key);
            return;
        }

        if (conditionEditorIndex !== null) {
            return;  // Let ConditionEditor handle input
        }

        if (key.escape) {
            onBack();
        } else if (key.upArrow && rules.length > 0) {
            setSelectedIndex(Math.max(0, selectedIndex - 1));
        } else if (key.downArrow && rules.length > 0) {
            setSelectedIndex(Math.min(rules.length - 1, selectedIndex + 1));
        } else if (key.return && rules.length > 0) {
            setMoveMode(true);  // Enter move mode
        } else if (key.tab && rules.length > 0) {
            // Toggle between color and property modes
            setEditorMode(prev => prev === 'color' ? 'property' : 'color');
        } else if (input === 'a') {
            addRule();
        } else if (input === 'd' && rules.length > 0) {
            deleteRule();  // Immediate delete, no confirmation (matches ItemsEditor)
        } else if (rules.length > 0) {
            // Handle mode-specific input
            if (editorMode === 'color') {
                // Color mode: inline editing
                handleColorModeInput(input, key);
            } else {
                // Property mode: check for condition editor trigger first
                if (key.leftArrow || key.rightArrow) {
                    // Open condition editor (same UX as ItemsEditor widget type picker)
                    setConditionEditorIndex(selectedIndex);
                } else {
                    handlePropertyModeInput(input, key);
                }
            }
        }
    });

    // Get widget display name
    const getWidgetDisplayName = () => {
        const widgetImpl = getWidget(widget.type);
        return widgetImpl ? widgetImpl.getDisplayName() : widget.type;
    };

    // Format condition summary
    const formatCondition = (when: Record<string, unknown>): string => {
        const widgetRef = getConditionWidget(when);
        const operator = getConditionOperator(when);
        const value = getConditionValue(when);
        const notFlag = getConditionNot(when);

        // Get widget display name
        let widgetName = 'self';
        if (widgetRef !== 'self') {
            const widgetImpl = getWidget(widgetRef);
            widgetName = widgetImpl ? widgetImpl.getDisplayName() : widgetRef;
        }

        // Check if this matches a display operator pattern
        const displayOp = getDisplayOperator(when);
        if (displayOp) {
            const displayLabel = DISPLAY_OPERATOR_LABELS[displayOp];

            // Format based on display operator type
            if (displayOp === 'notEquals') {
                if (typeof value === 'string') {
                    return `when ${widgetName} ${displayLabel} "${value}"`;
                }
                return `when ${widgetName} ${displayLabel} ${value}`;
            }
            if (displayOp === 'notContains' || displayOp === 'notStartsWith' || displayOp === 'notEndsWith') {
                return `when ${widgetName} ${displayLabel} "${value}"`;
            }
            return `when ${widgetName} ${displayLabel}`;
        }

        // Fall back to showing base operator with NOT prefix if needed
        const notPrefix = notFlag ? 'NOT ' : '';

        if (operator && value !== null) {
            const opLabel = OPERATOR_LABELS[operator];

            // Format based on operator type
            if (isStringOperator(operator)) {
                return `when ${notPrefix}${widgetName} ${opLabel} "${value}"`;
            }

            if (isBooleanOperator(operator)) {
                return `when ${notPrefix}${widgetName} ${opLabel}`;
            }

            if (isSetOperator(operator) && Array.isArray(value)) {
                const valueList = value.map(v => JSON.stringify(v)).join(', ');
                return `when ${notPrefix}${widgetName} ${opLabel} [${valueList}]`;
            }

            // Numeric or equals
            return `when ${notPrefix}${widgetName} ${opLabel}${value}`;
        }

        return `when ${JSON.stringify(when)}`;
    };

    // Format applied properties as labels (using widget's own display logic)
    const formatAppliedProperties = (apply: Record<string, unknown>): string => {
        // Create a temp widget by merging base widget with rule.apply
        // Use shared merge function to handle metadata deep merge correctly
        const tempWidget = mergeWidgetWithRuleApply(widget, apply);

        // Let the widget format its own modifiers (hide, remaining, etc.)
        const widgetImpl = getWidget(widget.type);
        const { modifierText } = widgetImpl?.getEditorDisplay(tempWidget) ?? { modifierText: undefined };

        // Build labels for base properties (rawValue, merge)
        const baseLabels: string[] = [];

        if (tempWidget.rawValue) {
            baseLabels.push('raw value');
        }

        if (tempWidget.merge === true) {
            baseLabels.push('merged→');
        } else if (tempWidget.merge === 'no-padding') {
            baseLabels.push('merged-no-pad→');
        }

        if (tempWidget.hide) {
            baseLabels.push('hidden');
        }

        if (tempWidget.character !== undefined) {
            baseLabels.push(`character: ${tempWidget.character}`);
        }

        // Combine widget-specific modifiers and base property labels
        const parts: string[] = [];
        if (modifierText) {
            parts.push(modifierText);
        }
        if (baseLabels.length > 0) {
            parts.push(...baseLabels.map(l => `(${l})`));
        }

        return parts.length > 0 ? ` ${parts.join(' ')}` : '';
    };

    // Build help text based on mode
    const buildHelpText = (): string => {
        if (moveMode) {
            return '↑↓ move rule, Enter/ESC exit move mode';
        }

        if (rules.length === 0) {
            return '(a)dd rule, ESC back';
        }

        const baseHelp = '↑↓ select, Enter move mode, (a)dd, (d)elete';

        if (editorMode === 'color') {
            const { editingBackground, hexInputMode, ansi256InputMode } = colorEditorState;

            if (hexInputMode) {
                return 'Type 6-digit hex code (without #), Enter to apply, ESC to cancel';
            }

            if (ansi256InputMode) {
                return 'Type ANSI 256 color code (0-255), Enter to apply, ESC to cancel';
            }

            const colorType = editingBackground ? 'background' : 'foreground';
            const hexAnsiHelp = settings.colorLevel === 3
                ? ', (h)ex'
                : settings.colorLevel === 2
                    ? ', (a)nsi256'
                    : '';

            return `${baseHelp}, ←→ cycle ${colorType}\n(f) bg/fg, (b)old${hexAnsiHelp}, (r)eset\nTab: property mode, ESC back`;
        } else {
            // Property mode - include widget custom keybinds and base properties
            const widgetImpl = getWidget(widget.type);
            const customKeybinds = widgetImpl?.getCustomKeybinds?.(widget) ?? [];
            const keybindHelp = customKeybinds
                .map(kb => kb.label)
                .join(', ');

            // Build base property keybinds
            const basePropertyKeybinds: string[] = [];
            if (widgetImpl?.supportsRawValue()) {
                basePropertyKeybinds.push('(r)aw value');
            }
            basePropertyKeybinds.push('(m)erge');
            basePropertyKeybinds.push('(h)ide');
            basePropertyKeybinds.push('(s)top');
            basePropertyKeybinds.push('(c)lear properties');

            const propertyHelp = keybindHelp ? `, ${keybindHelp}` : '';
            const basePropsHelp = basePropertyKeybinds.join(', ');
            return `${baseHelp}, ←→ edit condition${propertyHelp}, ${basePropsHelp}\nTab: color mode, ESC back`;
        }
    };

    const helpText = buildHelpText();

    // Show custom widget editor
    if (customEditorWidget?.impl?.renderEditor) {
        return customEditorWidget.impl.renderEditor({
            widget: customEditorWidget.widget,
            onComplete: handleEditorComplete,
            onCancel: handleEditorCancel,
            action: customEditorWidget.action
        });
    }

    // Show condition editor
    if (conditionEditorIndex !== null) {
        const rule = rules[conditionEditorIndex];
        if (!rule) {
            setConditionEditorIndex(null);
            return null;
        }

        return (
            <ConditionEditor
                widgetType={widget.type}
                condition={rule.when}
                settings={settings}
                onSave={(newCondition) => {
                    const newRules = [...rules];
                    newRules[conditionEditorIndex] = {
                        ...rule,
                        when: newCondition
                    };
                    onUpdate({ ...widget, rules: newRules });
                    setConditionEditorIndex(null);
                }}
                onCancel={() => { setConditionEditorIndex(null); }}
            />
        );
    }

    return (
        <Box flexDirection='column'>
            <Box marginBottom={1}>
                <Text bold>
                    Rules for
                    {widget.type}
                </Text>
                {moveMode && <Text color='blue'> [MOVE MODE]</Text>}
                {!moveMode && editorMode === 'color' && (
                    <Text color='magenta'>
                        {' '}
                        [COLOR MODE
                        {colorEditorState.editingBackground ? ' - BACKGROUND' : ' - FOREGROUND'}
                        ]
                    </Text>
                )}
                {!moveMode && editorMode === 'property' && <Text color='cyan'> [PROPERTY MODE]</Text>}
            </Box>

            {rules.length === 0 ? (
                <Text dimColor>No rules defined</Text>
            ) : (
                <>
                    <Box marginBottom={1}>
                        <Text dimColor>{helpText}</Text>
                    </Box>

                    {editorMode === 'color' && colorEditorState.hexInputMode && (
                        <Box marginBottom={1} flexDirection='column'>
                            <Text>Enter 6-digit hex color code (without #):</Text>
                            <Text>
                                #
                                {colorEditorState.hexInput}
                                <Text dimColor>
                                    {colorEditorState.hexInput.length < 6 ? '_'.repeat(6 - colorEditorState.hexInput.length) : ''}
                                </Text>
                            </Text>
                        </Box>
                    )}

                    {editorMode === 'color' && colorEditorState.ansi256InputMode && (
                        <Box marginBottom={1} flexDirection='column'>
                            <Text>Enter ANSI 256 color code (0-255):</Text>
                            <Text>
                                {colorEditorState.ansi256Input}
                                <Text dimColor>
                                    {colorEditorState.ansi256Input.length === 0
                                        ? '___'
                                        : colorEditorState.ansi256Input.length === 1
                                            ? '__'
                                            : colorEditorState.ansi256Input.length === 2
                                                ? '_'
                                                : ''}
                                </Text>
                            </Text>
                        </Box>
                    )}

                    {editorMode === 'color' && !colorEditorState.hexInputMode && !colorEditorState.ansi256InputMode && (() => {
                        const rule = rules[selectedIndex];
                        if (!rule) {
                            return null;
                        }

                        // Create temp widget by merging base + apply
                        const tempWidget = mergeWidgetWithRuleApply(widget, rule.apply);
                        const { colorIndex, totalColors, displayName } = getCurrentColorInfo(
                            tempWidget,
                            colorEditorState.editingBackground
                        );

                        const colorType = colorEditorState.editingBackground ? 'background' : 'foreground';
                        const colorNumber = colorIndex === -1 ? 'custom' : `${colorIndex}/${totalColors}`;

                        // Apply color to display name
                        const level = getColorLevelString(settings.colorLevel);
                        const styledColor = colorEditorState.editingBackground
                            ? applyColors(` ${displayName} `, undefined, tempWidget.backgroundColor, false, level)
                            : applyColors(displayName, tempWidget.color, undefined, false, level);

                        return (
                            <Box marginBottom={1}>
                                <Text>
                                    Current
                                    {' '}
                                    {colorType}
                                    {' '}
                                    (
                                    {colorNumber}
                                    ):
                                    {' '}
                                    {styledColor}
                                    {tempWidget.bold && <Text bold> [BOLD]</Text>}
                                </Text>
                            </Box>
                        );
                    })()}

                    {rules.map((rule, index) => {
                        const isSelected = index === selectedIndex;
                        const condition = formatCondition(rule.when);
                        const stopIndicator = rule.stop ? ' (stop)' : '';
                        const appliedProps = formatAppliedProperties(rule.apply);

                        // Get widget display name
                        const displayName = getWidgetDisplayName();

                        // Get widget's actual configured color/bold as base
                        const widgetImpl = getWidget(widget.type);
                        const baseColor = widget.color ?? widgetImpl?.getDefaultColor() ?? 'white';
                        const baseBackgroundColor = widget.backgroundColor;
                        const baseBold = widget.bold ?? false;

                        // Apply rule overrides (or use widget's configured properties)
                        const color = rule.apply.color ? String(rule.apply.color) : baseColor;
                        const backgroundColor = rule.apply.backgroundColor ? String(rule.apply.backgroundColor) : baseBackgroundColor;
                        const bold = rule.apply.bold !== undefined ? Boolean(rule.apply.bold) : baseBold;

                        // Apply colors
                        const colorLevel = getColorLevelString(settings.colorLevel);
                        const styledLabel = applyColors(displayName, color, backgroundColor, bold, colorLevel);

                        // Selection color: blue in move mode, green otherwise (same as ItemsEditor)
                        const selectionColor = isSelected ? (moveMode ? 'blue' : 'green') : undefined;

                        return (
                            <Box key={index} flexDirection='row' flexWrap='nowrap'>
                                <Box width={3}>
                                    <Text color={selectionColor}>
                                        {isSelected ? (moveMode ? '◆ ' : '▶ ') : '  '}
                                    </Text>
                                </Box>
                                {/* In move mode, override styling with selection color */}
                                {/* In normal mode, show rule's styled label */}
                                <Text color={moveMode ? selectionColor : undefined}>
                                    {index + 1}
                                    .
                                    {moveMode ? displayName : styledLabel}
                                </Text>
                                <Text dimColor>
                                    {(() => {
                                        const fullText = ` (${condition})${stopIndicator}${appliedProps}`;
                                        return fullText;
                                    })()}
                                </Text>
                            </Box>
                        );
                    })}
                </>
            )}

            <Box marginTop={1}>
                <Text dimColor>
                    {rules.length === 0 ? (
                        <Text dimColor>{helpText}</Text>
                    ) : (
                        `${rules.length} rule${rules.length === 1 ? '' : 's'}`
                    )}
                </Text>
            </Box>
        </Box>
    );
};