// Ink redraws, and React re-attaches Ink's input listener, on their own
// schedule. A fixed sleep between keys races both on a busy machine, so tests
// wait for each key's visible effect instead.

// Two setImmediate turns let React run the passive effect that re-attaches the
// input listener after a redraw, so the next key isn't dropped
export async function letReactCatchUp(): Promise<void> {
    for (let turn = 0; turn < 2; turn++) {
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
    }
}

// Retries the assertions until they pass, then lets React catch up. Throws the
// last failure once the timeout passes.
export async function waitFor(assertions: () => void, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });
        try {
            assertions();
            await letReactCatchUp();
            return;
        } catch (error) {
            if (Date.now() >= deadline) {
                throw error;
            }
        }
    }
}
