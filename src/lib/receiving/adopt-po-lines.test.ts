/**
 * adoptPoLinesOntoReceiving / ensurePoLinesOnReceiving — DB-free unit tests.
 *
 * Run: `tsx --test src/lib/receiving/adopt-po-lines.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adoptPoLinesOntoReceiving,
  ensurePoLinesOnReceiving,
  type AdoptPoLinesDeps,
} from '@/lib/receiving/adopt-po-lines';
import type { TxClient } from '@/lib/receiving/relink-po';

interface Captured {
  text: string;
  params: unknown[];
}

function makeClient(opts: {
  /** Rows returned by the FOR UPDATE select of candidate lines. */
  candidates?: Array<{ id: number; workflow_status: string | null }>;
  /** Post-adopt / post-import line count on the winner. */
  lineCount?: number;
}): { client: TxClient; queries: Captured[] } {
  const queries: Captured[] = [];
  const candidates = opts.candidates ?? [];
  const lineCount = opts.lineCount ?? candidates.length;
  const client: TxClient = {
    query: async (text: string, params: unknown[] = []) => {
      queries.push({ text, params });
      if (/FOR UPDATE OF rl/.test(text)) {
        return { rows: candidates, rowCount: candidates.length };
      }
      if (/COUNT\(\*\)/.test(text)) {
        return { rows: [{ n: lineCount }], rowCount: 1 };
      }
      return { rows: [], rowCount: candidates.length || 1 };
    },
  };
  return { client, queries };
}

function depsFor(
  client: TxClient,
  extra: Partial<AdoptPoLinesDeps> = {},
): AdoptPoLinesDeps {
  const transitions: number[] = [];
  return {
    runTx: async (_org, fn) => fn(client),
    transition: async (input) => {
      transitions.push(input.receivingLineId);
      return { ok: true, to: 'MATCHED' } as never;
    },
    ...extra,
    // expose for assertions
    ...( { _transitions: transitions } as object ),
  };
}

test('adopt: moves unattached + unmatched-donor lines onto the winner', async () => {
  const { client, queries } = makeClient({
    candidates: [
      { id: 10, workflow_status: 'EXPECTED' },
      { id: 11, workflow_status: 'UNBOXED' },
    ],
  });
  const deps = depsFor(client);
  const n = await adoptPoLinesOntoReceiving('PO1', 50096, 'org-1', deps);
  assert.equal(n, 2);

  const select = queries.find((q) => /FOR UPDATE OF rl/.test(q.text));
  assert.ok(select, 'expected candidate select');
  assert.match(select!.text, /rc\.source = 'unmatched'/);
  assert.match(select!.text, /receiving_id IS NULL/);
  assert.deepEqual(select!.params, ['PO1', 'org-1', 50096]);

  const upd = queries.find((q) => /UPDATE receiving_line/.test(q.text) && /receiving_id = \$1/.test(q.text));
  assert.ok(upd, 'expected linkage UPDATE');
  assert.deepEqual(upd!.params, [50096, [10, 11], 'org-1']);

  // Only EXPECTED transitions through the chokepoint.
  const transitions = (deps as { _transitions?: number[] })._transitions ?? [];
  assert.deepEqual(transitions, [10]);
});

test('adopt: no-op when no candidates', async () => {
  const { client, queries } = makeClient({ candidates: [] });
  const n = await adoptPoLinesOntoReceiving('PO1', 50096, 'org-1', depsFor(client));
  assert.equal(n, 0);
  assert.ok(!queries.some((q) => /UPDATE receiving_line/.test(q.text)));
});

test('ensure: does not import when local adopt already attached lines', async () => {
  let imported = false;
  const { client } = makeClient({
    candidates: [{ id: 10, workflow_status: 'MATCHED' }],
    lineCount: 1,
  });
  const result = await ensurePoLinesOnReceiving(
    'PO1',
    50096,
    'org-1',
    { importIfEmpty: true },
    depsFor(client, {
      importPo: async () => {
        imported = true;
      },
      countLinesOnCarton: async () => 1,
    }),
  );
  assert.equal(result.adopted, 1);
  assert.equal(result.imported, false);
  assert.equal(result.lineCount, 1);
  assert.equal(imported, false);
});

test('ensure: imports when adopt leaves carton empty', async () => {
  let importedFor: { poId: string; receivingId: number } | null = null;
  const { client } = makeClient({ candidates: [], lineCount: 0 });
  const result = await ensurePoLinesOnReceiving(
    'PO1',
    50096,
    'org-1',
    { importIfEmpty: true },
    depsFor(client, {
      importPo: async (_org, poId, opts) => {
        importedFor = { poId, receivingId: opts.receivingId };
      },
      countLinesOnCarton: async () => (importedFor ? 2 : 0),
    }),
  );
  assert.equal(result.adopted, 0);
  assert.equal(result.imported, true);
  assert.equal(result.lineCount, 2);
  assert.deepEqual(importedFor, { poId: 'PO1', receivingId: 50096 });
});

test('ensure: importIfEmpty false never calls Zoho', async () => {
  let imported = false;
  const { client } = makeClient({ candidates: [], lineCount: 0 });
  const result = await ensurePoLinesOnReceiving(
    'PO1',
    50096,
    'org-1',
    { importIfEmpty: false },
    depsFor(client, {
      importPo: async () => {
        imported = true;
      },
      countLinesOnCarton: async () => 0,
    }),
  );
  assert.equal(result.imported, false);
  assert.equal(imported, false);
  assert.equal(result.lineCount, 0);
});
