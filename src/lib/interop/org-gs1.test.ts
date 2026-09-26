/** DB-free unit test for the GS1 identity resolution point. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOrgGs1Identity, type OrgGs1Deps } from './org-gs1';

/** Fake read surface that captures the query it was asked to run. */
function deps(rows: Array<{ settings: unknown }>): OrgGs1Deps & {
  calls: Array<{ text: string; params: unknown[] }>;
} {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  return {
    calls,
    query: (async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return { rows };
    }) as never,
  };
}

const throwingDeps: OrgGs1Deps = {
  query: async () => {
    throw new Error('connection reset');
  },
};

test('a configured identity resolves', async () => {
  const d = deps([
    { settings: { gs1: { companyPrefix: '0812345', gln: '0812345000009', cbvUriForm: 'webUri' } } },
  ]);
  const identity = await resolveOrgGs1Identity('org-1', d);

  assert.deepEqual(identity, {
    companyPrefix: '0812345',
    gln: '0812345000009',
    cbvUriForm: 'webUri',
  });
  assert.equal(d.calls.length, 1);
  assert.deepEqual(d.calls[0]?.params, ['org-1']);
});

test('the resolution point drops a placeholder even though settings accepted it', async () => {
  // The zod schema is a shape check, not a semantics check — it will happily
  // persist GS1's documentation prefix. This is where that gets caught.
  const identity = await resolveOrgGs1Identity(
    'org-1',
    deps([{ settings: { gs1: { companyPrefix: '0614141', gln: '0614141000005' } } }]),
  );
  assert.deepEqual(identity, { cbvUriForm: 'urn' });
});

test('no org id issues no query at all', async () => {
  const d = deps([]);
  assert.deepEqual(await resolveOrgGs1Identity(null, d), {});
  assert.deepEqual(await resolveOrgGs1Identity(undefined, d), {});
  assert.deepEqual(await resolveOrgGs1Identity('', d), {});
  assert.equal(d.calls.length, 0, 'must not hit the DB for a missing org');
});

test('a missing org row degrades to "no identity", not a throw', async () => {
  assert.deepEqual(await resolveOrgGs1Identity('ghost', deps([])), {});
});

test('an empty or absent settings blob resolves to the urn default', async () => {
  assert.deepEqual(await resolveOrgGs1Identity('org-1', deps([{ settings: {} }])), {
    cbvUriForm: 'urn',
  });
  assert.deepEqual(await resolveOrgGs1Identity('org-1', deps([{ settings: null }])), {
    cbvUriForm: 'urn',
  });
});

test('a DB failure degrades to "no identity" rather than failing the read', async () => {
  // The safe direction: an empty identity omits GS1 keys, which is always a
  // legal EPCIS/ASN document. There is no failure mode where guessing is better.
  assert.deepEqual(await resolveOrgGs1Identity('org-1', throwingDeps), {});
});

test('a garbage settings blob does not crash the parse', async () => {
  for (const settings of ['not an object', 42, [], { gs1: 'nope' }, { gs1: { gln: 12345 } }]) {
    const identity = await resolveOrgGs1Identity('org-1', deps([{ settings }]));
    assert.equal(typeof identity, 'object');
    assert.equal(identity.companyPrefix, undefined);
    assert.equal(identity.gln, undefined);
  }
});
