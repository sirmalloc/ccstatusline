import {
    afterEach,
    beforeEach,
    vi
} from 'vitest';

import * as executablePath from '../executable-path';

// Command fakes dispatch on bare names. Keep those unit tests independent of
// installed programs and PATH, while leaving the resolver's own tests real.
export function mockExecutableResolution(): void {
    let restore: (() => void) | undefined;

    beforeEach(() => {
        const resolve = vi.spyOn(executablePath, 'resolveExecutable').mockImplementation(name => name);
        restore = () => {
            resolve.mockRestore();
        };
    });

    afterEach(() => {
        restore?.();
    });
}
