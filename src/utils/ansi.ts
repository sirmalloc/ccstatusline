import stringWidth from 'string-width';

import {
    gradientCodeAt,
    type Rgb
} from './gradient';

const ESC = '\x1b';
const BEL = '\x07';
const C1_CSI = '\x9b';
const C1_OSC = '\x9d';
const ST = '\x9c';
// What follows ESC in a DCS, SOS, PM or APC string
const STRING_INTRODUCERS = new Set(['P', 'X', '^', '_']);
const ZERO_WIDTH_JOINER = 0x200d;
const COMBINING_ENCLOSING_KEYCAP = 0x20e3;
const VARIATION_SELECTOR_START = 0xfe00;
const VARIATION_SELECTOR_END = 0xfe0f;
const VARIATION_SELECTOR_SUPPLEMENT_START = 0xe0100;
const VARIATION_SELECTOR_SUPPLEMENT_END = 0xe01ef;
const REGIONAL_INDICATOR_START = 0x1f1e6;
const REGIONAL_INDICATOR_END = 0x1f1ff;

// Color codes, written with ESC [ or the 8-bit CSI, and with ; or the ITU
// colons (38:5:196) between parameters
const SGR_REGEX = /(?:\x1b\[|\x9b)[0-9;:]*m/g;
// Lowest code point that can extend a display cluster (U+0300 is the first
// \p{Mark}; ZWJ, variation selectors, the keycap and emoji modifiers are all
// higher), so a printable ASCII character followed by anything below it is a
// one-column cluster on its own.
const FIRST_CLUSTER_EXTENDER = 0x300;
const CLUSTER_WIDTH_CACHE_LIMIT = 4096;
const clusterWidthCache = new Map<string, number>();
const EXTENDED_PICTOGRAPHIC_REGEX = createUnicodePropertyRegex('\\p{Extended_Pictographic}');
const EMOJI_PRESENTATION_REGEX = createUnicodePropertyRegex('\\p{Emoji_Presentation}');
const EMOJI_MODIFIER_REGEX = createUnicodePropertyRegex('\\p{Emoji_Modifier}');
const COMBINING_MARK_REGEX = createUnicodePropertyRegex('\\p{Mark}');

type Osc8Action = 'open' | 'close';
type OscTerminator = 'bel' | 'st';

interface ParsedEscapeSequence {
    nextIndex: number;
    sequence: string;
    osc8Action?: Osc8Action;
    osc8Terminator?: OscTerminator;
}

interface DisplayCluster {
    text: string;
    nextIndex: number;
}

function createUnicodePropertyRegex(pattern: string): RegExp | null {
    try {
        return new RegExp(pattern, 'u');
    } catch {
        return null;
    }
}

function matchesUnicodeProperty(character: string, regex: RegExp | null): boolean {
    return regex?.test(character) ?? false;
}

function isVariationSelector(codePoint: number): boolean {
    return (codePoint >= VARIATION_SELECTOR_START && codePoint <= VARIATION_SELECTOR_END)
        || (codePoint >= VARIATION_SELECTOR_SUPPLEMENT_START && codePoint <= VARIATION_SELECTOR_SUPPLEMENT_END);
}

function isRegionalIndicator(codePoint: number): boolean {
    return codePoint >= REGIONAL_INDICATOR_START && codePoint <= REGIONAL_INDICATOR_END;
}

function consumeDisplayCluster(text: string, start: number): DisplayCluster | null {
    const firstCodePoint = text.codePointAt(start);
    if (firstCodePoint === undefined) {
        return null;
    }

    const firstCharacter = String.fromCodePoint(firstCodePoint);
    let cluster = firstCharacter;
    let index = start + firstCharacter.length;

    if (isRegionalIndicator(firstCodePoint)) {
        const nextCodePoint = text.codePointAt(index);
        if (nextCodePoint !== undefined && isRegionalIndicator(nextCodePoint)) {
            const nextCharacter = String.fromCodePoint(nextCodePoint);
            cluster += nextCharacter;
            index += nextCharacter.length;
        }

        return {
            text: cluster,
            nextIndex: index
        };
    }

    while (index < text.length) {
        const nextCodePoint = text.codePointAt(index);
        if (nextCodePoint === undefined) {
            break;
        }

        const nextCharacter = String.fromCodePoint(nextCodePoint);

        if (isVariationSelector(nextCodePoint)
            || nextCodePoint === COMBINING_ENCLOSING_KEYCAP
            || matchesUnicodeProperty(nextCharacter, COMBINING_MARK_REGEX)
            || matchesUnicodeProperty(nextCharacter, EMOJI_MODIFIER_REGEX)) {
            cluster += nextCharacter;
            index += nextCharacter.length;
            continue;
        }

        if (nextCodePoint === ZERO_WIDTH_JOINER) {
            cluster += nextCharacter;
            index += nextCharacter.length;

            const joinedCodePoint = text.codePointAt(index);
            if (joinedCodePoint === undefined) {
                break;
            }

            const joinedCharacter = String.fromCodePoint(joinedCodePoint);
            cluster += joinedCharacter;
            index += joinedCharacter.length;
            continue;
        }

        break;
    }

    return {
        text: cluster,
        nextIndex: index
    };
}

function isZeroWidthStandaloneCluster(cluster: string): boolean {
    const characters = Array.from(cluster);
    return characters.length > 0 && characters.every((character) => {
        const codePoint = character.codePointAt(0);
        if (codePoint === undefined) {
            return false;
        }

        return codePoint === ZERO_WIDTH_JOINER
            || codePoint === COMBINING_ENCLOSING_KEYCAP
            || isVariationSelector(codePoint)
            || matchesUnicodeProperty(character, COMBINING_MARK_REGEX)
            || matchesUnicodeProperty(character, EMOJI_MODIFIER_REGEX);
    });
}

function shouldTreatClusterAsNarrowTextPictograph(cluster: string, clusterStringWidth: number): boolean {
    if (clusterStringWidth <= 1) {
        return false;
    }

    const characters = Array.from(cluster);
    if (characters.length === 0) {
        return false;
    }

    for (const character of characters) {
        const codePoint = character.codePointAt(0);
        if (codePoint === undefined) {
            continue;
        }

        if (codePoint === ZERO_WIDTH_JOINER
            || codePoint === COMBINING_ENCLOSING_KEYCAP
            || isVariationSelector(codePoint)
            || isRegionalIndicator(codePoint)
            || matchesUnicodeProperty(character, EMOJI_PRESENTATION_REGEX)
            || matchesUnicodeProperty(character, EMOJI_MODIFIER_REGEX)) {
            return false;
        }
    }

    return characters.some(character => matchesUnicodeProperty(character, EXTENDED_PICTOGRAPHIC_REGEX));
}

function isPrintableAscii(charCode: number): boolean {
    return charCode >= 0x20 && charCode <= 0x7e;
}

function computeClusterWidth(cluster: string): number {
    if (cluster.length === 0 || isZeroWidthStandaloneCluster(cluster)) {
        return 0;
    }

    // The sanitizer prints a tab as one space
    if (cluster.startsWith('\t')) {
        return 1;
    }

    const clusterStringWidth = stringWidth(cluster);
    if (shouldTreatClusterAsNarrowTextPictograph(cluster, clusterStringWidth)) {
        return 1;
    }

    return clusterStringWidth;
}

// A cluster's width depends only on its text, and a render measures the same
// handful of clusters (separators, bar glyphs, icons) many times over, so the
// Unicode property checks and string-width calls are memoised per process.
function getClusterWidth(cluster: string): number {
    if (cluster.length === 1 && isPrintableAscii(cluster.charCodeAt(0))) {
        return 1;
    }

    const cached = clusterWidthCache.get(cluster);
    if (cached !== undefined) {
        return cached;
    }

    const width = computeClusterWidth(cluster);
    if (clusterWidthCache.size >= CLUSTER_WIDTH_CACHE_LIMIT) {
        clusterWidthCache.clear();
    }
    clusterWidthCache.set(cluster, width);
    return width;
}

function getTextDisplayWidth(text: string): number {
    let width = 0;
    let index = 0;

    while (index < text.length) {
        // Fast path: a printable ASCII character that nothing can extend is a
        // one-column cluster, so skip the cluster scan entirely.
        if (isPrintableAscii(text.charCodeAt(index))) {
            const nextIndex = index + 1;
            if (nextIndex >= text.length || text.charCodeAt(nextIndex) < FIRST_CLUSTER_EXTENDER) {
                width += 1;
                index = nextIndex;
                continue;
            }
        }

        const cluster = consumeDisplayCluster(text, index);
        if (!cluster) {
            break;
        }

        width += getClusterWidth(cluster.text);
        index = cluster.nextIndex;
    }

    return width;
}

function isCsiFinalByte(codePoint: number): boolean {
    return codePoint >= 0x40 && codePoint <= 0x7e;
}

function parseCsi(input: string, start: number, bodyStart: number): ParsedEscapeSequence {
    let index = bodyStart;
    while (index < input.length) {
        const codePoint = input.charCodeAt(index);
        if (isCsiFinalByte(codePoint)) {
            const end = index + 1;
            return {
                nextIndex: end,
                sequence: input.slice(start, end)
            };
        }
        index++;
    }

    return {
        nextIndex: input.length,
        sequence: input.slice(start)
    };
}

function getOsc8Action(body: string): Osc8Action | undefined {
    if (!body.startsWith('8;')) {
        return undefined;
    }

    const urlStart = body.indexOf(';', 2);
    if (urlStart === -1) {
        return undefined;
    }

    const url = body.slice(urlStart + 1);
    return url.length > 0 ? 'open' : 'close';
}

function parseOsc(
    input: string,
    start: number,
    bodyStart: number
): ParsedEscapeSequence {
    let index = bodyStart;

    while (index < input.length) {
        const current = input[index];
        if (!current) {
            break;
        }

        if (current === BEL) {
            const end = index + 1;
            const body = input.slice(bodyStart, index);
            return {
                nextIndex: end,
                sequence: input.slice(start, end),
                osc8Action: getOsc8Action(body),
                osc8Terminator: 'bel'
            };
        }

        if (current === ST) {
            const end = index + 1;
            const body = input.slice(bodyStart, index);
            return {
                nextIndex: end,
                sequence: input.slice(start, end),
                osc8Action: getOsc8Action(body),
                osc8Terminator: 'st'
            };
        }

        if (current === ESC && input[index + 1] === '\\') {
            const end = index + 2;
            const body = input.slice(bodyStart, index);
            return {
                nextIndex: end,
                sequence: input.slice(start, end),
                osc8Action: getOsc8Action(body),
                osc8Terminator: 'st'
            };
        }

        index++;
    }

    return {
        nextIndex: input.length,
        sequence: input.slice(start)
    };
}

// The bytes after ESC in ESC ( B and the like: intermediate bytes, then a
// final byte. Past the end of the input, codePointAt gives undefined, which is
// neither.
function isIntermediateByte(codePoint: number | undefined): boolean {
    return codePoint !== undefined && codePoint >= 0x20 && codePoint <= 0x2f;
}

function isEscapeFinalByte(codePoint: number | undefined): boolean {
    return codePoint !== undefined && codePoint >= 0x30 && codePoint <= 0x7e;
}

function sliceSequence(input: string, start: number, end: number): ParsedEscapeSequence {
    return {
        nextIndex: end,
        sequence: input.slice(start, end)
    };
}

// A DCS, SOS, PM or APC string, which the terminal swallows up to ST or BEL.
// Any other ESC starts a new sequence, so an unterminated string doesn't hide
// the text after it.
function parseControlString(input: string, start: number): ParsedEscapeSequence {
    for (let index = start + 2; index < input.length; index++) {
        const current = input[index];
        if (current === BEL || current === ST) {
            return sliceSequence(input, start, index + 1);
        }
        if (current === ESC) {
            return sliceSequence(input, start, input[index + 1] === '\\' ? index + 2 : index);
        }
    }

    return sliceSequence(input, start, input.length);
}

// ESC and a character other than [ or ]
function parseOtherEscape(input: string, start: number): ParsedEscapeSequence {
    const next = input.charAt(start + 1);
    if (STRING_INTRODUCERS.has(next)) {
        return parseControlString(input, start);
    }

    // ESC, intermediate bytes, then a final byte: ESC ( B selects a character
    // set (`tput sgr0` prints it), ESC # 8 fills the screen
    if (isIntermediateByte(next.codePointAt(0))) {
        let end = start + 2;
        while (end < input.length && isIntermediateByte(input.codePointAt(end))) {
            end++;
        }
        return sliceSequence(input, start, isEscapeFinalByte(input.codePointAt(end)) ? end + 1 : end);
    }

    // ESC 7, ESC c and the like
    return sliceSequence(input, start, start + 2);
}

function parseEscapeSequence(input: string, index: number): ParsedEscapeSequence | null {
    const current = input[index];
    if (!current) {
        return null;
    }

    if (current === ESC) {
        const next = input[index + 1];
        if (next === '[') {
            return parseCsi(input, index, index + 2);
        }
        if (next === ']') {
            return parseOsc(input, index, index + 2);
        }
        if (next) {
            return parseOtherEscape(input, index);
        }
        return {
            nextIndex: input.length,
            sequence: current
        };
    }

    if (current === C1_CSI) {
        return parseCsi(input, index, index + 1);
    }

    if (current === C1_OSC) {
        return parseOsc(input, index, index + 1);
    }

    return null;
}

function getOsc8CloseSequence(terminator: OscTerminator): string {
    if (terminator === 'bel') {
        return `${ESC}]8;;${BEL}`;
    }
    return `${ESC}]8;;${ESC}\\`;
}

function nextOsc8Terminator(escape: ParsedEscapeSequence, current: OscTerminator | null): OscTerminator | null {
    if (escape.osc8Action === 'open') {
        return escape.osc8Terminator ?? 'st';
    }
    if (escape.osc8Action === 'close') {
        return null;
    }
    return current;
}

export function stripSgrCodes(text: string): string {
    return text.replace(SGR_REGEX, '');
}

// What an SGR parameter does to an attribute: clears it, sets it, or leaves
// it alone (undefined)
type SgrEffect = 'clear' | 'set' | undefined;

// The background is cleared by 0 (also an empty parameter) and 49
function getBackgroundEffect(param: number | undefined): SgrEffect {
    if (param === 0 || param === 49) {
        return 'clear';
    }
    if (param !== undefined && ((param >= 40 && param <= 47) || (param >= 100 && param <= 107) || param === 48)) {
        return 'set';
    }
    return undefined;
}

// Bold (set by 1) and dim (set by 2) are both cleared by 0 and 22
function getIntensityEffect(param: number | undefined, setBy: 1 | 2): SgrEffect {
    if (param === 0 || param === 22) {
        return 'clear';
    }
    return param === setBy ? 'set' : undefined;
}

interface SgrClears {
    background: boolean;
    bold: boolean;
    dim: boolean;
}

// Track each attribute's operations in order: a later explicit setting
// overrides a reset. Skip extended color arguments so their values aren't
// mistaken for resets or background operations. Written with colons
// (38:5:196, 48:2::255:0:0), an extended color holds its arguments in its own
// parameter, so there is nothing after it to skip.
function getSgrClears(sequence: string): SgrClears {
    const introducerLength = sequence.startsWith(C1_CSI) ? 1 : 2;
    const fields = sequence.slice(introducerLength, -1).split(';');
    const params = fields.map(param => Number.parseInt(param || '0', 10));
    const clears: SgrClears = { background: false, bold: false, dim: false };
    const track = (attribute: keyof SgrClears, effect: SgrEffect) => {
        if (effect) {
            clears[attribute] = effect === 'clear';
        }
    };
    for (let i = 0; i < params.length; i++) {
        const param = params[i];
        track('background', getBackgroundEffect(param));
        track('bold', getIntensityEffect(param, 1));
        track('dim', getIntensityEffect(param, 2));
        if ((param === 38 || param === 48 || param === 58) && !fields[i]?.includes(':')) {
            i += params[i + 1] === 5 ? 2 : 4;
        }
    }
    return clears;
}

// The styling restoreStyleAfterResets re-applies, with the background as the
// SGR code that sets it
export interface RestoredStyle {
    background?: string;
    bold?: boolean;
    dim?: boolean;
}

// Re-apply a widget's own styling after each SGR sequence in the text that
// clears it, so text that resets its own styling keeps the background, bold
// and dim it's drawn with.
export function restoreStyleAfterResets(text: string, style: RestoredStyle): string {
    const background = style.background ?? '';
    if (!background && !style.bold && !style.dim) {
        return text;
    }

    return text.replace(SGR_REGEX, (sequence) => {
        const clears = getSgrClears(sequence);
        return sequence
            + (style.bold && clears.bold ? '\x1b[1m' : '')
            + (style.dim && clears.dim ? '\x1b[2m' : '')
            + (clears.background ? background : '');
    });
}

export function stripOscCodes(text: string): string {
    let result = '';
    let index = 0;

    while (index < text.length) {
        const escape = parseEscapeSequence(text, index);
        if (escape) {
            const isOsc = escape.sequence.startsWith(`${ESC}]`) || escape.sequence.startsWith(C1_OSC);
            if (!isOsc) {
                result += escape.sequence;
            }
            index = escape.nextIndex;
            continue;
        }

        const codePoint = text.codePointAt(index);
        if (codePoint === undefined) {
            break;
        }

        const character = String.fromCodePoint(codePoint);
        result += character;
        index += character.length;
    }

    return result;
}

function isEscapeIntroducer(character: string | undefined): boolean {
    return character === ESC || character === C1_CSI || character === C1_OSC;
}

export function getVisibleText(text: string): string {
    let result = '';
    let index = 0;

    while (index < text.length) {
        const escape = parseEscapeSequence(text, index);
        if (escape) {
            index = escape.nextIndex;
            continue;
        }

        // Copy the whole run up to the next escape introducer in one slice
        // rather than one code point at a time.
        let runEnd = index + 1;
        while (runEnd < text.length && !isEscapeIntroducer(text[runEnd])) {
            runEnd++;
        }

        result += text.slice(index, runEnd);
        index = runEnd;
    }

    return result;
}

export function getVisibleWidth(text: string): number {
    return getTextDisplayWidth(getVisibleText(text));
}

interface TruncateOptions { ellipsis?: boolean }

export interface LineGradientSegmentResult {
    text: string;
    nextColumn: number;
}

export function truncateStyledText(
    text: string,
    maxWidth: number,
    options: TruncateOptions = {}
): string {
    if (maxWidth <= 0) {
        return '';
    }

    if (getVisibleWidth(text) <= maxWidth) {
        return text;
    }

    const addEllipsis = options.ellipsis ?? true;
    const ellipsis = addEllipsis ? '...' : '';
    const ellipsisWidth = addEllipsis ? stringWidth(ellipsis) : 0;

    if (addEllipsis && maxWidth <= ellipsisWidth) {
        return '.'.repeat(maxWidth);
    }

    const targetWidth = Math.max(0, maxWidth - ellipsisWidth);
    let output = '';
    let currentWidth = 0;
    let index = 0;
    let didTruncate = false;
    let openOsc8Terminator: OscTerminator | null = null;

    // Measure clusters on the escape-stripped text, exactly as getVisibleWidth
    // does. Measuring each run between escapes separately splits a cluster
    // that straddles an escape (U+2764, SGR, U+FE0F) into narrower pieces, so
    // the loop could finish without overshooting and return the whole,
    // over-wide input below.
    const visibleText = getVisibleText(text);
    let visibleIndex = 0;

    while (index < text.length) {
        const escape = parseEscapeSequence(text, index);
        if (escape) {
            output += escape.sequence;
            index = escape.nextIndex;
            openOsc8Terminator = nextOsc8Terminator(escape, openOsc8Terminator);
            continue;
        }

        const cluster = consumeDisplayCluster(visibleText, visibleIndex);
        if (!cluster) {
            break;
        }

        const clusterWidth = getClusterWidth(cluster.text);

        if (currentWidth + clusterWidth > targetWidth) {
            didTruncate = true;
            break;
        }

        // Copy the cluster's code units, and any escapes that sit inside it.
        let remaining = cluster.text.length;
        while (remaining > 0 && index < text.length) {
            const inner = parseEscapeSequence(text, index);
            if (inner) {
                output += inner.sequence;
                index = inner.nextIndex;
                openOsc8Terminator = nextOsc8Terminator(inner, openOsc8Terminator);
                continue;
            }

            const codePoint = text.codePointAt(index);
            if (codePoint === undefined) {
                break;
            }

            const character = String.fromCodePoint(codePoint);
            output += character;
            index += character.length;
            remaining -= character.length;
        }

        currentWidth += clusterWidth;
        visibleIndex = cluster.nextIndex;
    }

    if (!didTruncate) {
        return text;
    }

    if (openOsc8Terminator) {
        output += getOsc8CloseSequence(openOsc8Terminator);
    }

    return output + ellipsis;
}

// Paint a foreground gradient across the visible characters of a styled line,
// assigning each display cluster a color based on its column position so the
// gradient spans the whole line. Escape sequences (SGR, OSC-8 hyperlinks) pass
// through untouched, and visible width is unchanged, so flex/powerline layout
// is unaffected. ansi16 has too few colors for a gradient and is left as-is.
export function applyLineGradientSegment(
    text: string,
    stops: Rgb[],
    colorLevel: 'ansi16' | 'ansi256' | 'truecolor',
    startColumn: number,
    totalWidth: number
): LineGradientSegmentResult {
    const visibleWidth = getVisibleWidth(text);
    if (stops.length === 0 || colorLevel === 'ansi16') {
        return {
            text,
            nextColumn: startColumn + visibleWidth
        };
    }

    if (totalWidth <= 1) {
        return {
            text,
            nextColumn: startColumn + visibleWidth
        };
    }

    const denominator = totalWidth - 1;
    let output = '';
    let column = startColumn;
    let index = 0;

    while (index < text.length) {
        const escape = parseEscapeSequence(text, index);
        if (escape) {
            output += escape.sequence;
            index = escape.nextIndex;
            continue;
        }

        const cluster = consumeDisplayCluster(text, index);
        if (!cluster) {
            break;
        }

        output += gradientCodeAt(stops, column / denominator, colorLevel) + cluster.text;
        column += getClusterWidth(cluster.text);
        index = cluster.nextIndex;
    }

    return {
        text: output,
        nextColumn: column
    };
}

// Paint a foreground gradient across the visible characters of a styled line,
// assigning each display cluster a color based on its column position so the
// gradient spans the whole line. Escape sequences (SGR, OSC-8 hyperlinks) pass
// through untouched, and visible width is unchanged, so flex/powerline layout
// is unaffected. ansi16 has too few colors for a gradient and is left as-is.
export function applyLineGradient(
    text: string,
    stops: Rgb[],
    colorLevel: 'ansi16' | 'ansi256' | 'truecolor'
): string {
    const totalWidth = getVisibleWidth(text);
    const result = applyLineGradientSegment(text, stops, colorLevel, 0, totalWidth);

    if (result.text === text) {
        return text;
    }

    return `${result.text}\x1b[39m`;
}
