import stringWidth from 'string-width';

const ESC = '\x1b';
const BEL = '\x07';
const C1_CSI = '\x9b';
const C1_OSC = '\x9d';
const ST = '\x9c';
const ZERO_WIDTH_JOINER = 0x200d;
const COMBINING_ENCLOSING_KEYCAP = 0x20e3;
const VARIATION_SELECTOR_START = 0xfe00;
const VARIATION_SELECTOR_END = 0xfe0f;
const VARIATION_SELECTOR_SUPPLEMENT_START = 0xe0100;
const VARIATION_SELECTOR_SUPPLEMENT_END = 0xe01ef;
const REGIONAL_INDICATOR_START = 0x1f1e6;
const REGIONAL_INDICATOR_END = 0x1f1ff;

const SGR_REGEX = /\x1b\[[0-9;]*m/g;
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

function shouldTreatClusterAsNarrowTextPictograph(cluster: string): boolean {
    if (stringWidth(cluster) <= 1) {
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

function getClusterWidth(cluster: string): number {
    if (cluster.length === 0 || isZeroWidthStandaloneCluster(cluster)) {
        return 0;
    }

    if (shouldTreatClusterAsNarrowTextPictograph(cluster)) {
        return 1;
    }

    return stringWidth(cluster);
}

function getTextDisplayWidth(text: string): number {
    let width = 0;
    let index = 0;

    while (index < text.length) {
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
            return {
                nextIndex: index + 2,
                sequence: input.slice(index, index + 2)
            };
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

export function stripSgrCodes(text: string): string {
    return text.replace(SGR_REGEX, '');
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

export function getVisibleWidth(text: string): number {
    return getTextDisplayWidth(getVisibleText(text));
}

interface TruncateOptions { ellipsis?: boolean }

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

    while (index < text.length) {
        const escape = parseEscapeSequence(text, index);
        if (escape) {
            output += escape.sequence;
            index = escape.nextIndex;

            if (escape.osc8Action === 'open') {
                openOsc8Terminator = escape.osc8Terminator ?? 'st';
            } else if (escape.osc8Action === 'close') {
                openOsc8Terminator = null;
            }
            continue;
        }

        let visibleSegmentEnd = index;
        while (visibleSegmentEnd < text.length && !parseEscapeSequence(text, visibleSegmentEnd)) {
            const codePoint = text.codePointAt(visibleSegmentEnd);
            if (codePoint === undefined) {
                break;
            }

            visibleSegmentEnd += String.fromCodePoint(codePoint).length;
        }

        const visibleSegment = text.slice(index, visibleSegmentEnd);
        const cluster = consumeDisplayCluster(visibleSegment, 0);
        if (!cluster) {
            break;
        }

        const clusterWidth = getClusterWidth(cluster.text);

        if (currentWidth + clusterWidth > targetWidth) {
            didTruncate = true;
            break;
        }

        output += cluster.text;
        currentWidth += clusterWidth;
        index += cluster.text.length;
    }

    if (!didTruncate) {
        return text;
    }

    if (openOsc8Terminator) {
        output += getOsc8CloseSequence(openOsc8Terminator);
    }

    return output + ellipsis;
}