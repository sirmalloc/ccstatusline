import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    RefreshGroup,
    capMap
} from '../provider-scope';

describe('capMap', () => {
    it('evicts oldest insertions beyond the cap', () => {
        const map = new Map<string, number>();
        map.set('a', 1);
        map.set('b', 2);
        map.set('c', 3);
        capMap(map, 2);
        expect([...map.keys()]).toEqual(['b', 'c']);
    });

    it('keeps a map at or below the cap untouched', () => {
        const map = new Map<string, number>([['a', 1]]);
        capMap(map, 4);
        expect(map.size).toBe(1);
    });
});

describe('RefreshGroup', () => {
    it('dedups concurrent refreshes of the same key into one work run', async () => {
        const group = new RefreshGroup();
        const work = vi.fn((): Promise<string> => Promise.resolve('value'));

        const first = group.refresh('git', work);
        const second = group.refresh('git', work);

        expect(work).toHaveBeenCalledTimes(1);
        await expect(first.promise).resolves.toBe('value');
        await expect(second.promise).resolves.toBe('value');
        first.release();
        second.release();
    });

    it('runs different keys independently', async () => {
        const group = new RefreshGroup();
        const work = vi.fn((): Promise<string> => Promise.resolve('ok'));

        const a = group.refresh('cwd-a', work);
        const b = group.refresh('cwd-b', work);
        expect(group.size).toBe(2);

        a.release();
        await expect(a.promise).resolves.toBeDefined();
        b.release();
        await expect(b.promise).resolves.toBeDefined();
    });

    it('aborts the work when the last consumer releases before completion', async () => {
        const group = new RefreshGroup();
        let observedAbort = false;
        const work = (signal: AbortSignal): Promise<string> => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => {
                observedAbort = true;
                reject(new Error('aborted'));
            });
        });

        const only = group.refresh('usage', work);
        const outcome = only.promise.then(() => 'resolved', () => 'rejected');
        only.release();
        expect(observedAbort).toBe(true);
        await expect(outcome).resolves.toBe('rejected');
        // The settled job is unregistered on its own microtask.
        await Promise.resolve();
        expect(group.size).toBe(0);
    });

    it('does not abort while another consumer is still joined', async () => {
        const group = new RefreshGroup();
        const work = vi.fn((): Promise<string> => Promise.resolve('shared'));

        const first = group.refresh('git', work);
        const second = group.refresh('git', work);
        first.release();

        await expect(second.promise).resolves.toBe('shared');
        second.release();
    });

    it('does not join a cancelled job: a later refresh starts fresh work', async () => {
        const group = new RefreshGroup();
        const resolvers: ((value: string) => void)[] = [];
        const work = vi.fn((): Promise<string> => new Promise((resolve) => { resolvers.push(resolve); }));

        const first = group.refresh('review', work);
        first.release(); // Still pending -> aborts the job.
        expect(work).toHaveBeenCalledTimes(1);

        const second = group.refresh('review', work);
        expect(work).toHaveBeenCalledTimes(2);
        resolvers[1]?.('fresh');
        await expect(second.promise).resolves.toBe('fresh');
        second.release();
    });

    it('keeps the replacement job registered when the cancelled job settles late', async () => {
        const group = new RefreshGroup();
        const resolvers: ((value: string) => void)[] = [];
        const work = vi.fn((): Promise<string> => new Promise((resolve) => { resolvers.push(resolve); }));

        const first = group.refresh('review', work);
        first.release(); // Aborts job 1 while pending.
        group.refresh('review', work); // Replaces it in the group.

        // Job 1 settles only after its replacement registered (#18 review):
        // its cleanup must not unregister job 2.
        resolvers[0]?.('late-first');
        await new Promise(resolve => setTimeout(resolve, 0));

        const third = group.refresh('review', work);
        expect(work).toHaveBeenCalledTimes(2);
        resolvers[1]?.('fresh');
        await expect(third.promise).resolves.toBe('fresh');
        third.release();
    });

    it('ignores a release after completion', async () => {
        const group = new RefreshGroup();
        const work = vi.fn((): Promise<string> => Promise.resolve('done'));

        const only = group.refresh('git', work);
        await only.promise;
        only.release();
        only.release();

        const next = group.refresh('git', work);
        await expect(next.promise).resolves.toBe('done');
        next.release();
    });
});
