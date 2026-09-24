import assert from 'node:assert/strict';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import test from 'node:test';
import { BrowserFixtureLabelSource, BrowserPrintRecorder } from './native-adapters';
import { createBrowserFixtureSession } from './browser-fixture-authority';

const session = {} as never;
test('browser fixture capability can only be minted by an explicitly enabled non-production server', () => {
  const previousMode = process.env.CYCLEFORGE_BROWSER_FIXTURE_TEST_MODE; const previousNodeEnv = process.env.NODE_ENV;
  try { process.env.NODE_ENV = 'test'; process.env.CYCLEFORGE_BROWSER_FIXTURE_TEST_MODE = 'enabled'; assert.doesNotThrow(() => createBrowserFixtureSession()); process.env.NODE_ENV = 'production'; assert.throws(() => createBrowserFixtureSession()); }
  finally { process.env.NODE_ENV = previousNodeEnv; if (previousMode === undefined) delete process.env.CYCLEFORGE_BROWSER_FIXTURE_TEST_MODE; else process.env.CYCLEFORGE_BROWSER_FIXTURE_TEST_MODE = previousMode; }
});
test('browser fixture adapter uploads ordinary bytes to the real versioned endpoint with a Web Crypto hash', async () => {
  const originalCrypto = globalThis.crypto; Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  try {
    let received: FormData | null = null;
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 1]); const source = new BrowserFixtureLabelSource(session, { pickFile: async () => new File([bytes], 'fixture.pdf', { type: 'application/pdf' }), uuid: () => '00000000-0000-4000-8000-000000000001', now: () => new Date('2026-09-18T00:00:00.000Z'), fetcher: async (_url, init) => { received = init.body as FormData; return { ok: true, status: 201, json: async () => ({ data: { id: 42 }, replayed: false }) }; } });
    const result = await source.chooseSource(); assert.deepEqual(result, { accepted: true, ingestionId: 42, replayed: false }); assert.equal(received?.get('sha256'), createHash('sha256').update(bytes).digest('hex'));
  } finally { Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true }); }
});
test('browser print recorder only reports a simulation and retains server-minted requests', async () => { const recorder = new BrowserPrintRecorder(session); const receipt = await recorder.print({ ticket: 'server-ticket', documentId: 9, printerId: 'browser-recorder', copies: 1, idempotencyKey: randomUUID() }); assert.equal(receipt.simulated, true); assert.equal(recorder.requests.length, 1); });
