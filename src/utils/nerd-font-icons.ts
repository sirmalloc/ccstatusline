/**
 * Nerd Font v3 icon mappings for widget labels.
 *
 * FA icons (U+F000–F2FF) are stable across v2/v3.
 * MD icons (U+F0001+) require Nerd Font v3 and use `\u{XXXXX}` syntax.
 *
 * Reference: https://www.nerdfonts.com/cheat-sheet
 */

export const NERD_FONT_ICONS: Record<string, string> = {
    'model':                       '\u{F06A9}',  // 󰚩 nf-md-robot_outline
    'git-branch':                  '\uE725',     //  nf-dev-git_branch
    'git-worktree':                '\u{F0645}',  // 󰙅 nf-md-source_branch
    'git-changes':                 '\u{F02A2}',  // 󰊢 nf-md-git
    'tokens-input':                '\uF019',     //  nf-fa-download
    'tokens-output':               '\uF093',     //  nf-fa-upload
    'tokens-cached':               '\u{F018F}',  // 󰆏 nf-md-database
    'tokens-total':                '\u{F0284}',  // 󰊄 nf-md-function_variant
    'context-length':              '\u{F09A8}',  // 󰦨 nf-md-text_box_outline
    'context-percentage':          '\uF0E4',     //  nf-fa-tachometer
    'context-percentage-usable':   '\uF0E4',     //  nf-fa-tachometer
    'session-clock':               '\uF017',     //  nf-fa-clock_o
    'session-cost':                '\uF155',     //  nf-fa-usd
    'block-timer':                 '\u{F13AB}',  // 󱎫 nf-md-timer_sand_complete
    'terminal-width':              '\uF120',     //  nf-fa-terminal
    'version':                     '\uF02B',     //  nf-fa-tag
    'output-style':                '\uF1FC',     //  nf-fa-paint_brush
    'current-working-dir':         '\uF07B',     //  nf-fa-folder
    'claude-session-id':           '\uF2C1'     //  nf-fa-id_card
};

/**
 * Get the Nerd Font icon for a widget type.
 */
export function getNerdFontIcon(widgetType: string): string | undefined {
    return NERD_FONT_ICONS[widgetType];
}

/**
 * Format a widget label based on display mode.
 *
 * Three-way logic:
 *  - rawValue=true  → just the value (no label, no icon)
 *  - nerdFontIcons  → icon + space + value
 *  - default        → textLabel + value
 */
export function formatWidgetLabel(
    widgetType: string,
    value: string,
    textLabel: string,
    rawValue: boolean | undefined,
    nerdFontIcons: boolean | undefined
): string {
    if (rawValue) {
        return value;
    }

    if (nerdFontIcons) {
        const icon = NERD_FONT_ICONS[widgetType];
        if (icon) {
            return `${icon} ${value}`;
        }
    }

    return `${textLabel}${value}`;
}