import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FileSyncEngine, FILE_ORIGIN } from './file-sync-core';
import { createMasterPlanYDoc, getMasterPlanText, readMasterPlan } from './doc';
import {
  MasterPlanAblyProvider,
  type MasterPlanChannelLike,
  type MasterPlanMessage,
} from './ably-yjs-provider';

function fakes() {
  const writes: string[] = [];
  const logs: string[] = [];
  const scheduled: Array<() => void> = [];
  const deps = {
    writeFile: async (text: string) => {
      writes.push(text);
    },
    schedule: (cb: () => void, _ms: number) => {
      scheduled.push(cb);
    },
    log: (msg: string) => {
      logs.push(msg);
    },
  };
  const runScheduled = () => {
    while (scheduled.length) scheduled.shift()!();
  };
  return { deps, writes, logs, runScheduled };
}

class FakeChannel implements MasterPlanChannelLike {
  private handlers = new Map<string, Set<(msg: MasterPlanMessage) => void>>();
  published: Array<{ name: string; data: unknown }> = [];
  publish(name: string, data: unknown): void {
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

test('startup seeds an empty doc from the file and suppresses the immediate echo write', () => {
  const doc = createMasterPlanYDoc();
  const { deps, writes, runScheduled } = fakes();
  const engine = new FileSyncEngine(doc, deps);

  const res = engine.startup('# from file\n');
  assert.deepEqual(res, { seeded: true, docWonFile: false });
  assert.equal(readMasterPlan(doc), '# from file\n');
  runScheduled();
  assert.equal(writes.length, 0, 'seeding must not rewrite the identical file');
});

test('startup with a diverged non-empty doc lets the doc win the file (reported)', () => {
  const doc = createMasterPlanYDoc();
  getMasterPlanText(doc).insert(0, 'network truth');
  const { deps, writes, runScheduled } = fakes();
  const engine = new FileSyncEngine(doc, deps);

  const res = engine.startup('stale local file');
  assert.deepEqual(res, { seeded: false, docWonFile: true });
  runScheduled();
  assert.deepEqual(writes, ['network truth']);
});

test('upstream: file change applies into the doc; duplicate watcher events are swallowed', () => {
  const doc = createMasterPlanYDoc();
  const { deps, runScheduled } = fakes();
  const engine = new FileSyncEngine(doc, deps);
  engine.startup('v1');
  runScheduled();

  assert.equal(engine.handleFileChanged('v2'), 'applied');
  assert.equal(readMasterPlan(doc), 'v2');
  // Editors fire multiple events per save — same content must be an echo/noop.
  assert.equal(engine.handleFileChanged('v2'), 'echo');
});

test('downstream: remote doc update writes the file once (debounced) and the echo is dropped', () => {
  const doc = createMasterPlanYDoc();
  const { deps, writes, runScheduled } = fakes();
  const engine = new FileSyncEngine(doc, deps);
  engine.startup('base');
  runScheduled();

  // Remote edits (origin ≠ FILE_ORIGIN) — three rapid updates, one write.
  getMasterPlanText(doc).insert(4, ' a');
  getMasterPlanText(doc).insert(6, ' b');
  getMasterPlanText(doc).insert(8, ' c');
  runScheduled();
  assert.deepEqual(writes, ['base a b c']);

  // The write lands on disk → fs.watch fires → generation token swallows it.
  assert.equal(engine.handleFileChanged('base a b c'), 'echo');
});

test('file-origin doc changes never bounce back into a file write', () => {
  const doc = createMasterPlanYDoc();
  const { deps, writes, runScheduled } = fakes();
  const engine = new FileSyncEngine(doc, deps);
  engine.startup('base');
  runScheduled();

  doc.transact(() => getMasterPlanText(doc).insert(0, 'from-file '), FILE_ORIGIN);
  runScheduled();
  assert.equal(writes.length, 0);
});

test('GATE-2 evidence: full round-trip file↔doc↔Ably↔doc↔file with NO infinite loop', async () => {
  // Daemon plane: doc A + engine + provider. Web plane: doc B + provider.
  const channel = new FakeChannel();
  const docA = createMasterPlanYDoc();
  const docB = createMasterPlanYDoc();
  const { deps, writes, runScheduled } = fakes();

  const providerA = new MasterPlanAblyProvider(docA, channel, {
    clientTag: 'daemon',
    setTimeoutFn: (cb) => {
      cb();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: () => {},
  });
  const providerB = new MasterPlanAblyProvider(docB, channel, {
    clientTag: 'web',
    setTimeoutFn: (cb) => {
      cb();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: () => {},
  });
  const engine = new FileSyncEngine(docA, deps);

  await providerA.connect();
  engine.startup('# plan v1\n');
  await providerB.connect(); // late joiner syncs the seeded state
  assert.equal(readMasterPlan(docB), '# plan v1\n');

  // 1) Cursor save (upstream): watcher reports new file content.
  engine.handleFileChanged('# plan v2 — edited in Cursor\n');
  assert.equal(readMasterPlan(docB), '# plan v2 — edited in Cursor\n', 'web sees the Cursor save');

  // 2) Web edit (downstream): web client types; daemon writes the file.
  getMasterPlanText(docB).insert(readMasterPlan(docB).length, 'web addendum\n');
  runScheduled();
  assert.equal(writes.at(-1), '# plan v2 — edited in Cursor\nweb addendum\n', 'daemon persisted the web edit');

  // 3) The daemon's own write echoes through fs.watch — swallowed.
  assert.equal(engine.handleFileChanged(writes.at(-1)!), 'echo');

  // 4) Loop check: after the echo, nothing new is published or written.
  const publishedBefore = channel.published.length;
  const writesBefore = writes.length;
  runScheduled();
  assert.equal(channel.published.length, publishedBefore, 'no runaway publishes');
  assert.equal(writes.length, writesBefore, 'no runaway writes');

  // Both docs converged.
  assert.equal(readMasterPlan(docA), readMasterPlan(docB));
});

test('update storm converges: interleaved edits from three planes settle to one string', async () => {
  const channel = new FakeChannel();
  const docs = [createMasterPlanYDoc(), createMasterPlanYDoc(), createMasterPlanYDoc()];
  const providers = docs.map(
    (d, i) =>
      new MasterPlanAblyProvider(d, channel, {
        clientTag: `p${i}`,
        setTimeoutFn: (cb) => {
          cb();
          return 0 as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeoutFn: () => {},
      }),
  );
  for (const p of providers) await p.connect();
  getMasterPlanText(docs[0]).insert(0, 'seed ');
  for (let round = 0; round < 10; round += 1) {
    const d = docs[round % 3];
    const t = getMasterPlanText(d);
    t.insert(t.length, `r${round} `);
  }
  const [a, b, c] = docs.map((d) => readMasterPlan(d));
  assert.equal(a, b);
  assert.equal(b, c);
  for (let round = 0; round < 10; round += 1) assert.ok(a.includes(`r${round} `), `round ${round} kept`);
});

test('stop() flushes a final write and detaches', () => {
  const doc = createMasterPlanYDoc();
  const { deps, writes, runScheduled } = fakes();
  const engine = new FileSyncEngine(doc, deps);
  engine.startup('base');
  runScheduled();
  getMasterPlanText(doc).insert(0, 'unflushed ');
  engine.stop(); // debounce pending → stop must flush synchronously
  assert.deepEqual(writes, ['unflushed base']);
  getMasterPlanText(doc).insert(0, 'after-stop ');
  runScheduled();
  assert.equal(writes.length, 1, 'detached after stop');
});
