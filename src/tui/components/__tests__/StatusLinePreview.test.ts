import {
    describe,
    expect,
    it
} from 'vitest';

import { getVisibleWidth } from '../../../utils/ansi';
import { renderOsc8Link } from '../../../utils/hyperlink';
import { preparePreviewLineForTerminal } from '../StatusLinePreview';

describe('StatusLinePreview helpers', () => {
    it('strips OSC links and clamps preview lines to the terminal width', () => {
        const line = `${renderOsc8Link(
            'https://github.com/owner/repo/pull/42',
            'PR #42'
        )} OPEN ${'Example PR title '.repeat(8)}`;

        const prepared = preparePreviewLineForTerminal(line, 40);

        expect(prepared).not.toContain('github.com');
        expect(prepared.endsWith('...')).toBe(true);
        expect(getVisibleWidth(`  ${prepared}`)).toBeLessThanOrEqual(40);
    });
});
