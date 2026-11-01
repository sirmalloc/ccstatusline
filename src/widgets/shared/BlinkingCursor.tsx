import { Text } from 'ink';
import React from 'react';

import { useCursorBlink } from './cursor-blink';

interface BlinkingCursorProps {
    children: string;
    inverse?: boolean;
    dimColor?: boolean;
}

/** Keep the character (or placeholder) in place and blink only its highlight. */
export function BlinkingCursor({ children, inverse = false, dimColor }: BlinkingCursorProps): React.ReactElement {
    const visible = useCursorBlink();
    return (
        <Text
            inverse={inverse && visible}
            backgroundColor={!inverse && visible ? 'gray' : undefined}
            color={!inverse && visible ? 'black' : undefined}
            dimColor={dimColor}
        >
            {children}
        </Text>
    );
}
