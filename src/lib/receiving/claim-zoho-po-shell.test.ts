import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimOrAbsorbZohoPoShell,
  type ClaimZohoPoShellDeps,
} from '@/lib/receiving/claim-zoho-po-shell';
import type { TxClient } from '@/lib/receiving/relink-po';

interface Captured {
  text: string;
  params: unknown[];
}

function fakes(opts: {
  shellId?: number | null;
  busy?: boolean;
} = {}) {
  const queries: Captured[] = [];
  const shellId = opts.shellId === undefined ? 99 : opts.shellId;
  const client: TxClient = {
    query: async (text: string, params: unknown[] = []) => {
      queries.push({ text, params });
      if (/SELECT id FROM receiving_carton/.test(text) && /source = 'zoho_po'/.test(text)) {
        if (shellId == null) return { rows: [], rowCount: 0 };
        return { rows: [{ id: shellId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const deps: ClaimZohoPoShellDeps = {
    isShellBusy: async () => opts.busy === true,
  };
  return { client, deps, queries };
}

test('claim: free when no other matched carton holds the PO', async () => {
  const { client, deps, queries } = fakes({ shellId: null });
  const res = await claimOrAbsorbZohoPoShell(
    { orgId: 'org-1', workingReceivingId: 10, zohoPurchaseorderId: 'PO1' },
    client,
    deps,
  );
  assert.equal(res.action, 'free');
  assert.ok(!queries.some((q) => /UPDATE receiving_carton/.test(q.text)));
});

test('claim: already when working carton is the matched holder', async () => {
  const { client, deps } = fakes({ shellId: 10 });
  const res = await claimOrAbsorbZohoPoShell(
    { orgId: 'org-1', workingReceivingId: 10, zohoPurchaseorderId: 'PO1' },
    client,
    deps,
  );
  assert.equal(res.action, 'already');
});

test('claim: conflict 409 when shell has real work', async () => {
  const { client, deps, queries } = fakes({ shellId: 99, busy: true });
  const res = await claimOrAbsorbZohoPoShell(
    { orgId: 'org-1', workingReceivingId: 10, zohoPurchaseorderId: 'PO1' },
    client,
    deps,
  );
  assert.equal(res.action, 'conflict');
  if (res.action === 'conflict') {
    assert.equal(res.status, 409);
    assert.equal(res.shellReceivingId, 99);
    assert.match(res.error, /carton #99/);
  }
  assert.ok(!queries.some((q) => /UPDATE receiving_carton/.test(q.text)));
});

test('claim: absorb demotes empty shell and stamps working carton', async () => {
  const { client, deps, queries } = fakes({ shellId: 99, busy: false });
  const res = await claimOrAbsorbZohoPoShell(
    {
      orgId: 'org-1',
      workingReceivingId: 10,
      zohoPurchaseorderId: 'PO1',
      zohoPurchaseorderNumber: '6000',
    },
    client,
    deps,
  );
  assert.equal(res.action, 'absorb');
  if (res.action === 'absorb') assert.equal(res.shellReceivingId, 99);

  const demote = queries.find(
    (q) =>
      /UPDATE receiving_carton/.test(q.text) &&
      /source = 'unmatched'/.test(q.text) &&
      q.params[0] === 99,
  );
  assert.ok(demote, 'expected shell demote');

  const stamp = queries.find(
    (q) =>
      /UPDATE receiving_carton/.test(q.text) &&
      /source = 'zoho_po'/.test(q.text) &&
      q.params.includes(10),
  );
  assert.ok(stamp, 'expected working carton stamp');
  assert.ok(stamp!.params.includes('PO1'));

  assert.ok(queries.some((q) => /UPDATE receiving_line/.test(q.text)), 'adopt lines');
  assert.ok(queries.some((q) => /UPDATE receiving_scans/.test(q.text)), 're-parent scans');
  assert.ok(queries.some((q) => /INSERT INTO unfound_overlay/.test(q.text)), 'overlay checked');
});
