import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmContents, type ConfirmContentsDeps } from './confirm-contents';
import type { CartonUnboxPatch } from './streets/carton-street-write';

const ORG = '00000000-0000-0000-0000-0000000000aa';

function fakes() {
  const patches: Array<{ orgId: string; receivingId: number; patch: CartonUnboxPatch }> = [];
  const deps = {
    upsertUnbox: async (
      _client: unknown,
      orgId: string,
      receivingId: number,
      patch: CartonUnboxPatch,
    ) => {
      patches.push({ orgId, receivingId, patch });
    },
  } as unknown as ConfirmContentsDeps;
  return { deps, patches };
}

const client = { query: async () => ({ rows: [] }) } as never;

test('a confirmation stamps the time and the actor', async () => {
  const { deps, patches } = fakes();
  await confirmContents(client, { orgId: ORG, receivingId: 42, staffId: 9, confirmed: true }, deps);

  assert.equal(patches.length, 1);
  assert.equal(patches[0].orgId, ORG);
  assert.equal(patches[0].receivingId, 42);
  assert.equal(
    patches[0].patch.contentsConfirmedAt,
    'now',
    "'now' is SQL NOW() — never a JS wall clock read",
  );
  assert.equal(patches[0].patch.contentsConfirmedBy, 9);
});

test('a reopen clears BOTH the time and the actor', async () => {
  const { deps, patches } = fakes();
  await confirmContents(client, { orgId: ORG, receivingId: 42, staffId: 9, confirmed: false }, deps);

  assert.equal(patches[0].patch.contentsConfirmedAt, null);
  assert.equal(
    patches[0].patch.contentsConfirmedBy,
    null,
    'the column must never name someone as the confirmer of a claim that no longer stands',
  );
});

test('a missing staff id is null, not an invented actor', async () => {
  const { deps, patches } = fakes();
  await confirmContents(
    client,
    { orgId: ORG, receivingId: 42, staffId: undefined, confirmed: true },
    deps,
  );
  assert.equal(patches[0].patch.contentsConfirmedAt, 'now');
  assert.equal(patches[0].patch.contentsConfirmedBy, null);
});

test('it touches ONLY the contents columns', async () => {
  // The street writer builds its SET list from provided keys only, so an extra
  // key here would silently re-stamp a sibling milestone (opened / unboxed).
  const { deps, patches } = fakes();
  await confirmContents(client, { orgId: ORG, receivingId: 42, staffId: 1, confirmed: true }, deps);
  assert.deepEqual(Object.keys(patches[0].patch).sort(), [
    'contentsConfirmedAt',
    'contentsConfirmedBy',
  ]);
});

test('it composes the street writer rather than running its own SQL', async () => {
  // `receiving_unbox` has exactly one write path. A second INSERT … ON CONFLICT
  // here would work until the shared semantics changed in one place only.
  const { deps, patches } = fakes();
  let ranOwnSql = false;
  const spyClient = {
    query: async () => {
      ranOwnSql = true;
      return { rows: [] };
    },
  } as never;
  await confirmContents(spyClient, { orgId: ORG, receivingId: 1, staffId: 1, confirmed: true }, deps);
  assert.equal(ranOwnSql, false);
  assert.equal(patches.length, 1);
});
