/**
 * DB-free tests for assistant pre-loop enrichment.
 * Run: node --import ./scripts/register-server-only-shim.cjs --import tsx --test src/lib/assistant/enrich-turn.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichAssistantTurn, type EnrichTurnDeps } from './enrich-turn';

const ORG = '11111111-2222-3333-4444-555555555555';

test('enrichAssistantTurn: local_ops short-circuits before enrich', async () => {
  let enrichCalled = 0;
  const deps: EnrichTurnDeps = {
    resolveLocal: async (msg, orgId) => {
      assert.equal(orgId, ORG);
      assert.match(msg, /shipped/i);
      return {
        mode: 'local_ops',
        reply: '42 shipped this week',
        analysis: {
          mode: 'local_ops',
          modeLabel: 'Local ops',
          title: 'Shipping',
          summary: '42',
          kind: 'shipping_summary',
        } as never,
      };
    },
    enrich: async () => {
      enrichCalled += 1;
      return 'should not run';
    },
    detect: () => [],
    extract: () => ({}),
  };
  const out = await enrichAssistantTurn(ORG, 'how many shipped this week', deps);
  assert.equal(out.kind, 'local_ops');
  if (out.kind === 'local_ops') {
    assert.equal(out.resolution.reply, '42 shipped this week');
  }
  assert.equal(enrichCalled, 0);
});

test('enrichAssistantTurn: a selected Unbox carton skips warehouse-wide local_ops', async () => {
  let localCalled = 0;
  let enrichCalled = 0;
  const deps: EnrichTurnDeps = {
    resolveLocal: async () => {
      localCalled += 1;
      return {
        mode: 'local_ops',
        reply: '159 unshipped',
        analysis: { mode: 'local_ops', modeLabel: 'Local ops', title: 'Shipping', summary: '159' } as never,
      };
    },
    enrich: async () => {
      enrichCalled += 1;
      return 'warehouse block';
    },
    detect: () => ['orders'],
    extract: () => ({}),
    fetchCarton: async () => 'Products in the box:\n- Bose SoundLink Mini II',
  };
  const out = await enrichAssistantTurn(
    ORG,
    'tell me about this order',
    deps,
    { page: 'unbox-station', selection: { kind: 'receiving', id: 7114 } },
  );
  assert.equal(out.kind, 'enriched');
  if (out.kind === 'enriched') {
    assert.match(out.userMessage, /Bose SoundLink Mini II/);
    assert.match(out.userMessage, /tell me about this order/);
    assert.doesNotMatch(out.userMessage, /Receiving #/);
    assert.doesNotMatch(out.userMessage, /159 unshipped/);
  }
  assert.equal(localCalled, 0);
  assert.equal(enrichCalled, 0);
  if (out.kind === 'enriched') {
    assert.equal(out.voice, 'carton');
  }
});

test('enrichAssistantTurn: packer-week question skips carton brief and threads session staff', async () => {
  let cartonCalled = 0;
  let localCalled = 0;
  const cap: { orgId?: string; staffId?: number | null; kind?: string; message?: string } = {};
  const deps: EnrichTurnDeps = {
    resolveLocal: async () => {
      localCalled += 1;
      return {
        mode: 'local_ops',
        reply: 'should not run',
        analysis: { mode: 'local_ops' } as never,
      };
    },
    enrich: async () => 'should not run',
    detect: () => [],
    extract: () => ({}),
    fetchCarton: async () => {
      cartonCalled += 1;
      return 'Products in the box:\n- Bose SoundLink Mini II';
    },
    fetchOrgChat: async (args) => {
      cap.orgId = args.orgId;
      cap.staffId = args.staffId ?? null;
      cap.kind = args.kind;
      cap.message = args.message;
      return '=== WORKSPACE FACTS (this organization only) ===\nPacker: QA Admin\nPackages packed: 12';
    },
  };
  const out = await enrichAssistantTurn(
    ORG,
    'how many packages were packed by this packer on this week?',
    deps,
    { page: 'unbox-station', selection: { kind: 'receiving', id: 7114 } },
    67,
  );
  assert.equal(out.kind, 'enriched');
  if (out.kind === 'enriched') {
    assert.equal(out.voice, 'org_chat');
    assert.match(out.userMessage, /Packages packed: 12/);
    assert.doesNotMatch(out.userMessage, /Bose/);
  }
  assert.equal(cartonCalled, 0);
  assert.equal(localCalled, 0);
  assert.equal(cap.orgId, ORG);
  assert.equal(cap.staffId, 67);
  assert.equal(cap.kind, 'session_packer_packages');
});

test('enrichAssistantTurn: threads org + intents into enrich when not local_ops', async () => {
  const cap: { orgId?: string; message?: string; intents?: string[] } = {};
  const deps: EnrichTurnDeps = {
    resolveLocal: async () => null,
    detect: () => ['orders', 'shipped'],
    extract: () => ({ orderId: '12345' }),
    enrich: async (args) => {
      cap.orgId = args.orgId;
      cap.message = args.message;
      cap.intents = args.intents;
      return `[Live data]\norders...\n\nUser question: ${args.message}`;
    },
  };
  const out = await enrichAssistantTurn(ORG, 'find order 12345', deps);
  assert.equal(out.kind, 'enriched');
  if (out.kind === 'enriched') {
    assert.equal(cap.orgId, ORG);
    assert.equal(cap.message, 'find order 12345');
    assert.deepEqual(cap.intents, ['orders', 'shipped']);
    assert.match(out.userMessage, /Live data/);
  }
});

test('enrichAssistantTurn: the turn tenant session carries the classified facts queries', async () => {
  // Regression: fetchOrgChat used to be defaulted in defaultDeps, which won the
  // `??` in orgChatBrief and dropped `deps.db` — the two packing-count queries
  // then paid two full BEGIN/COMMIT round trips instead of sharing one (§22 H1).
  const seen: string[] = [];
  let batches = 0;
  const out = await enrichAssistantTurn(
    ORG,
    'how many packages did this packer pack this week',
    {
      resolveLocal: async () => null,
      enrich: async () => 'should not run',
      detect: () => [],
      extract: () => ({}),
      db: {
        query: async (orgId, text) => {
          assert.equal(orgId, ORG, 'facts stay org-scoped');
          seen.push(text.includes('packer_logs') ? 'count' : 'staff');
          return { rows: text.includes('packer_logs') ? [{ packed_count: 12 }] : [{ name: 'Maya' }] };
        },
        runBatch: async (fn) => {
          batches += 1;
          return fn();
        },
      },
    },
    null,
    41,
  );

  assert.equal(out.kind, 'enriched');
  if (out.kind === 'enriched') {
    assert.equal(out.voice, 'org_chat');
    assert.match(out.userMessage, /Packer: Maya/);
    assert.match(out.userMessage, /Packages packed: 12/);
  }
  assert.deepEqual(seen, ['staff', 'count'], 'both facts queries rode the session');
  assert.equal(batches, 1, 'one connection for the whole facts block');
});
