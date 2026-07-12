import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';

import {
  MasterPlanAblyProvider,
  MASTER_PLAN_EVENTS,
  u8ToBase64,
  base64ToU8,
  type MasterPlanChannelLike,
  type MasterPlanMessage,
} from './ably-yjs-provider';
import {
  createMasterPlanYDoc,
  createSeedUpdate,
  getMasterPlanText,
  readMasterPlan,
  isMasterPlanEmpty,
  applyMasterPlanReplace,
} from './doc';

/**
 * In-memory fake of the org master-plan channel. Mirrors Ably semantics that
 * matter to the provider: fan-out to ALL subscribers INCLUDING the publisher
 * (echo), async-ish delivery, per-event handlers.
 */
class FakeChannel implements MasterPlanChannelLike {
  private handlers = new Map<string, Set<(msg: MasterPlanMessage) => void>>();
  published: Array<{ name: string; data: unknown }> = [];

  publish(name: string, data: unknown): void {
    // JSON round-trip like the wire would do.
    const wire = JSON.parse(JSON.stringify(data));
    this.published.push({ name, data: wire });
    for (const cb of this.handlers.get(name) ?? []) cb({ data: wire });
  }

  subscribe(name: string, cb: (msg: MasterPlanMessage) => void): void {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(cb);
  }

  unsubscribe(name: string, cb: (msg: MasterPlanMessage) => void): void {
    this.handlers.get(name)?.delete(cb);
  }
}

/** Deterministic manual timer so flushes run when the test says so. */
function manualTimers() {
  const queue: Array<{ id: number; cb: () => void }> = [];
  let nextId = 1;
  return {
    setTimeoutFn: (cb: () => void, _ms: number) => {
      const id = nextId++;
      queue.push({ id, cb });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: (t: ReturnType<typeof setTimeout>) => {
      const idx = queue.findIndex((q) => q.id === (t as unknown as number));
      if (idx >= 0) queue.splice(idx, 1);
    },
    runAll() {
      while (queue.length) queue.shift()!.cb();
    },
  };
}

async function makePair(channel = new FakeChannel()) {
  const timers = manualTimers();
  const docA = createMasterPlanYDoc();
  const docB = createMasterPlanYDoc();
  const a = new MasterPlanAblyProvider(docA, channel, { clientTag: 'tag-a', ...timers });
  const b = new MasterPlanAblyProvider(docB, channel, { clientTag: 'tag-b', ...timers });
  await a.connect();
  await b.connect();
  return { channel, timers, docA, docB, a, b };
}

test('base64 helpers round-trip binary', () => {
  const u8 = new Uint8Array([0, 1, 2, 250, 255, 128, 7]);
  assert.deepEqual([...base64ToU8(u8ToBase64(u8))], [...u8]);
});

test('GATE-1 evidence: two clients merge CONCURRENT edits to one Y.Text', async () => {
  const { timers, docA, docB } = await makePair();

  // Seed via client A.
  getMasterPlanText(docA).insert(0, 'alpha beta gamma');
  timers.runAll();
  assert.equal(readMasterPlan(docB), 'alpha beta gamma');

  // CONCURRENT edits: hold A's flush until B has also edited (real overlap).
  getMasterPlanText(docA).insert(0, 'A-start: ');
  getMasterPlanText(docB).insert(getMasterPlanText(docB).length, ' :B-end');
  timers.runAll();

  assert.equal(readMasterPlan(docA), readMasterPlan(docB), 'docs must converge');
  const merged = readMasterPlan(docA);
  assert.ok(merged.startsWith('A-start: '), `kept A's edit: ${merged}`);
  assert.ok(merged.endsWith(' :B-end'), `kept B's edit: ${merged}`);
  assert.ok(merged.includes('alpha beta gamma'), 'kept the base text');
});

test('no echo loop: applying a remote update publishes nothing new', async () => {
  const { channel, timers, docA } = await makePair();
  const before = channel.published.length;
  getMasterPlanText(docA).insert(0, 'ping');
  timers.runAll();
  const afterOneEdit = channel.published.length;
  // Exactly ONE update message for one edit; B applying it must not publish.
  assert.equal(
    channel.published.slice(before, afterOneEdit).filter((m) => m.name === MASTER_PLAN_EVENTS.update).length,
    1,
  );
  timers.runAll();
  assert.equal(channel.published.length, afterOneEdit, 'no follow-on publishes (echo loop)');
});

test('late joiner catches up via sync request/response (two-way)', async () => {
  const channel = new FakeChannel();
  const timers = manualTimers();
  const docA = createMasterPlanYDoc();
  const a = new MasterPlanAblyProvider(docA, channel, { clientTag: 'tag-a', ...timers });
  await a.connect();
  getMasterPlanText(docA).insert(0, 'established state');
  timers.runAll();

  // Late joiner with its own offline edits (state A does not have).
  const docB = createMasterPlanYDoc();
  getMasterPlanText(docB).insert(0, 'offline note\n');
  const b = new MasterPlanAblyProvider(docB, channel, { clientTag: 'tag-b', ...timers });
  await b.connect(); // publishes sync.request; A answers with diff + its SV
  timers.runAll();

  assert.equal(b.synced, true, 'joiner saw a targeted sync response');
  assert.equal(readMasterPlan(docA), readMasterPlan(docB), 'both directions converged');
  assert.ok(readMasterPlan(docA).includes('established state'));
  assert.ok(readMasterPlan(docA).includes('offline note'));
});

test('batching: many rapid local edits flush as one merged update message', async () => {
  const { channel, timers, docA } = await makePair();
  const before = channel.published.filter((m) => m.name === MASTER_PLAN_EVENTS.update).length;
  const text = getMasterPlanText(docA);
  for (let i = 0; i < 25; i += 1) text.insert(text.length, `chunk${i} `);
  timers.runAll();
  const after = channel.published.filter((m) => m.name === MASTER_PLAN_EVENTS.update).length;
  assert.equal(after - before, 1, '25 edits → 1 wire message');
});

test('seed race is idempotent: two seeders produce identical, re-appliable updates', () => {
  const starter = '# Plan\n\n<TicketStatus status="pending" ticketId="ALP-1.1" />\n';
  const u1 = createSeedUpdate(starter);
  const u2 = createSeedUpdate(starter);
  assert.equal(u8ToBase64(u1), u8ToBase64(u2), 'seed updates are byte-identical');

  const doc = createMasterPlanYDoc();
  assert.equal(isMasterPlanEmpty(doc), true);
  Y.applyUpdate(doc, u1);
  Y.applyUpdate(doc, u2); // double-seed → no duplication
  assert.equal(readMasterPlan(doc), starter);
});

test('applyMasterPlanReplace preserves astral chars (no surrogate-pair split → no U+FFFD)', () => {
  const doc = createMasterPlanYDoc();
  // 🚀 and 🔥 are astral (2 UTF-16 units each); an emoji sits right at the edit boundary.
  getMasterPlanText(doc).insert(0, 'prefix 🚀 middle 🔥 suffix');
  applyMasterPlanReplace(doc, 'prefix 🚀 CENTER 🔥 suffix', 'test');
  const out = readMasterPlan(doc);
  assert.equal(out, 'prefix 🚀 CENTER 🔥 suffix');
  assert.ok(!out.includes('�'), 'no replacement char — surrogate pairs stayed intact');
  // Two peers must converge on identical text after the astral-boundary edit.
  const b = createMasterPlanYDoc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(doc));
  assert.equal(readMasterPlan(b), out);
});

test('applyMasterPlanReplace makes a minimal middle edit and reports change', () => {
  const doc = createMasterPlanYDoc();
  getMasterPlanText(doc).insert(0, 'keep-head MIDDLE keep-tail');
  let fired: unknown = null;
  doc.on('update', (_u: Uint8Array, origin: unknown) => {
    fired = origin;
  });
  const changed = applyMasterPlanReplace(doc, 'keep-head CENTER keep-tail', 'daemon-origin');
  assert.equal(changed, true);
  assert.equal(readMasterPlan(doc), 'keep-head CENTER keep-tail');
  assert.equal(fired, 'daemon-origin', 'origin threads through for echo suppression');
  assert.equal(applyMasterPlanReplace(doc, 'keep-head CENTER keep-tail'), false, 'no-op returns false');
});

test('destroy detaches: edits after destroy never publish', async () => {
  const { channel, timers, docA, a } = await makePair();
  timers.runAll();
  a.destroy();
  const before = channel.published.length;
  getMasterPlanText(docA).insert(0, 'after destroy');
  timers.runAll();
  assert.equal(channel.published.length, before);
});
