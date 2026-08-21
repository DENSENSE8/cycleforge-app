/**
 * Inline note commit — optimistic paint, honest rollback.
 */
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { commitReceivingLineNote } from '@/lib/receiving/commit-receiving-line-note';

function fakeClient() {
  const patches: Array<Record<string, unknown>> = [];
  return {
    patches,
    // patchReceivingLineCache calls setQueriesData under the hood; capture at
    // that boundary so the test does not re-implement the cache helper.
    client: {
      setQueriesData: (_key: unknown, updater: unknown) => {
        patches.push({ updater });
      },
      getQueryCache: () => ({ findAll: () => [] }),
    } as never,
  };
}

describe('commitReceivingLineNote', () => {
  it('does not hit the network when the value is unchanged', async () => {
    const fetchMock = mock.fn();
    globalThis.fetch = fetchMock as never;
    const { client } = fakeClient();

    await commitReceivingLineNote({
      queryClient: client,
      lineId: 5,
      previous: 'same note',
      next: '  same note  ',
    });

    assert.equal(fetchMock.mock.callCount(), 0, 'a no-op edit must cost nothing');
  });

  it('PATCHes the line and sends the trimmed value', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({}) };
    }) as never;
    const { client } = fakeClient();

    await commitReceivingLineNote({
      queryClient: client,
      lineId: 42,
      previous: null,
      next: '  damaged corner  ',
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/receiving-lines');
    assert.equal(calls[0].init.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      id: 42,
      notes: 'damaged corner',
    });
  });

  it('throws with the server message so the caller can surface it', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: 'FORBIDDEN' }),
    })) as never;
    const { client } = fakeClient();

    await assert.rejects(
      () =>
        commitReceivingLineNote({
          queryClient: client,
          lineId: 7,
          previous: 'before',
          next: 'after',
        }),
      /FORBIDDEN/,
    );
  });

  it('rolls the cache back on failure — twice: optimistic, then revert', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 500,
      json: async () => null,
    })) as never;
    const { client, patches } = fakeClient();

    await assert.rejects(() =>
      commitReceivingLineNote({
        queryClient: client,
        lineId: 9,
        previous: 'original',
        next: 'attempted',
      }),
    );
    // A failed write that left the optimistic value on screen would show the
    // operator a note the server never stored.
    assert.equal(patches.length, 2, 'optimistic patch, then rollback');
  });
});
