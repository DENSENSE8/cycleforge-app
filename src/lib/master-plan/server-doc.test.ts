import { test } from 'node:test';
import assert from 'node:assert/strict';
import type * as Y from 'yjs';

import { withMasterPlanDoc, isForgePlanOrg, type MasterPlanServerDeps } from './server-doc';
import { readMasterPlan, applyMasterPlanReplace } from './doc';
import { type MasterPlanChannelLike, type MasterPlanMessage } from './ably-yjs-provider';

const FORGE_ORG = '00000000-0000-0000-0000-000000000001';
const OTHER_ORG = '22222222-3333-4444-5555-666666666666';
const SEED = '# Seed\n\n<TicketStatus status="pending" ticketId="ALP-1.1" />\n';

class FakeChannel implements MasterPlanChannelLike {
  private handlers = new Map<string, Set<(m: MasterPlanMessage) => void>>();
  published: Array<{ name: string; data: unknown }> = [];
  publish(name: string, data: unknown) {
    this.published.push({ name, data: JSON.parse(JSON.stringify(data)) });
  }
  subscribe(name: string, cb: (m: MasterPlanMessage) => void) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(cb);
  }
  unsubscribe(name: string, cb: (m: MasterPlanMessage) => void) {
    this.handlers.get(name)?.delete(cb);
  }
}

function deps(env: Record<string, string | undefined> = {}) {
  const channel = new FakeChannel();
  const d: MasterPlanServerDeps = {
    openChannel: async () => ({ channel, close: () => {} }),
    readSeed: async () => SEED,
    syncWaitMs: 0,
    flushSettleMs: 0,
    sleep: async () => {},
    env: { FORGE_ORG_ID: FORGE_ORG, ...env },
  };
  return { deps: d, channel };
}

test('isForgePlanOrg resolves the configured forge org (case-insensitive)', () => {
  assert.equal(isForgePlanOrg(FORGE_ORG, { FORGE_ORG_ID: FORGE_ORG }), true);
  assert.equal(isForgePlanOrg(FORGE_ORG.toUpperCase(), { FORGE_ORG_ID: FORGE_ORG }), true);
  assert.equal(isForgePlanOrg(OTHER_ORG, { FORGE_ORG_ID: FORGE_ORG }), false);
});

test('read path local-seeds an empty FORGE-org room WITHOUT broadcasting it', async () => {
  const { deps: d, channel } = deps();
  const { result, seeded } = await withMasterPlanDoc(FORGE_ORG, (doc: Y.Doc) => readMasterPlan(doc), d, {
    seedForRead: true,
  });
  assert.equal(seeded, true);
  assert.equal(result, SEED, 'reader sees the canonical starter');
  // The seed must be LOCAL-ONLY — nothing published means no split-brain with
  // the daemon's authoritative seed.
  assert.equal(channel.published.filter((m) => m.name === 'yjs.update').length, 0, 'seed not broadcast');
});

test('read path does NOT seed a non-forge tenant (cross-tenant leak closed)', async () => {
  const { deps: d } = deps();
  const { result, seeded } = await withMasterPlanDoc(OTHER_ORG, (doc: Y.Doc) => readMasterPlan(doc), d, {
    seedForRead: true,
  });
  assert.equal(seeded, false);
  assert.equal(result, '', 'a foreign tenant never receives the dogfood plan');
});

test('mutation path never seeds, even for the forge org', async () => {
  const { deps: d } = deps();
  const { result, seeded } = await withMasterPlanDoc(FORGE_ORG, (doc: Y.Doc) => readMasterPlan(doc), d, {
    seedForRead: false,
  });
  assert.equal(seeded, false);
  assert.equal(result, '', 'a mutation on an empty room sees empty — no fabricated doc');
});

test('a genuine edit IS broadcast (awaited flush before disconnect)', async () => {
  const { deps: d, channel } = deps();
  await withMasterPlanDoc(
    FORGE_ORG,
    (doc: Y.Doc) => {
      // Seed is local-only; a real edit on top must reach the wire.
      applyMasterPlanReplace(doc, SEED + 'edited\n', 'plan-agent');
      return readMasterPlan(doc);
    },
    d,
    { seedForRead: true },
  );
  assert.ok(channel.published.some((m) => m.name === 'yjs.update'), 'the real edit was published');
});
