/**
 * §2 capture provenance across a TAB KILL — the rehydration path.
 *
 * This is the case the whole feature exists for. A receiving photo shot on a
 * dead-zone dock sits in `localStorage` until the phone reconnects, so the
 * upload that finally reaches the server can be minutes-to-hours after the
 * shutter. If `capturedAtMs` did not survive the localStorage round trip, the
 * evidence photo whose capture time matters MOST would be the one that lost it
 * — and the loss would be silent (the column just goes null).
 *
 * `PhotoUploadQueue` is a browser module-singleton, so this drives the REAL
 * module with the four browser globals it touches faked (`window`,
 * `localStorage`, `URL.createObjectURL`, `fetch`). Nothing here is a replica of
 * the persistence format: the test seeds the exact `PersistedEntry` shape the
 * module writes, then asserts what `uploadPhotoClient` puts on the wire.
 *
 * Both halves ride in ONE seeded payload because `rehydrate()` runs once per
 * process (the module guards with a `rehydrated` flag):
 *   • entry A — a post-2026-07-29 entry carrying `scope.capturedAtMs`
 *   • entry B — a legacy v1 entry with no `stage` and no `capturedAtMs`, which
 *     must still upload cleanly and simply store NULL.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_CAPTURED_AT_FIELD } from '@/lib/photos/capture-provenance';

const STORAGE_KEY = 'cf.receiving.upload_queue.v1';
const STORAGE_VERSION = 1;
/** 2026-07-29T18:04:11.000Z — the shutter instant, hours before the drain. */
const CAPTURED_MS = Date.UTC(2026, 6, 29, 18, 4, 11);

/** Smallest thing `dataUrlToBlob` (atob + Blob) will accept. */
const DATA_URL = `data:image/jpeg;base64,${Buffer.from('jpegbytes').toString('base64')}`;

function persistedEntry(id: string, scope: Record<string, unknown>) {
  return {
    v: STORAGE_VERSION,
    // Exactly `Omit<UploadEntry, 'previewUrl'>` — the shape persist() writes.
    meta: {
      id,
      scope,
      state: 'queued',
      photoId: null,
      photoUrl: null,
      error: null,
      originalBytes: 9,
      finalBytes: 9,
      createdAt: Date.now() - 3 * 60 * 60 * 1000, // queued 3h ago
    },
    dataUrl: DATA_URL,
  };
}

interface Posted {
  entityType: string;
  entityId: string;
  capturedAt: string | null;
  photoType: string | null;
}

const posted: Posted[] = [];
const savedGlobals: Record<string, unknown> = {};

function stubGlobals() {
  const g = globalThis as Record<string, unknown>;
  for (const key of ['window', 'localStorage', 'fetch']) savedGlobals[key] = g[key];
  savedGlobals.createObjectURL = (URL as unknown as Record<string, unknown>).createObjectURL;
  savedGlobals.revokeObjectURL = (URL as unknown as Record<string, unknown>).revokeObjectURL;

  const store = new Map<string, string>();
  const localStorageFake = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  // The module reads `typeof window === 'undefined'` and then the bare
  // `localStorage` binding, so both must exist.
  g.window = { localStorage: localStorageFake };
  g.localStorage = localStorageFake;
  (URL as unknown as Record<string, unknown>).createObjectURL = () => 'blob:fake';
  (URL as unknown as Record<string, unknown>).revokeObjectURL = () => {};

  g.fetch = async (_url: unknown, init: { body: FormData }) => {
    const form = init.body;
    const captured = form.get(CLIENT_CAPTURED_AT_FIELD);
    posted.push({
      entityType: String(form.get('entityType')),
      entityId: String(form.get('entityId')),
      capturedAt: captured === null ? null : String(captured),
      photoType: form.get('photoType') === null ? null : String(form.get('photoType')),
    });
    return {
      ok: true,
      json: async () => ({ id: posted.length, url: `/api/photos/${posted.length}/content` }),
    } as unknown as Response;
  };

  // Seed the queue exactly as a killed tab would have left it.
  localStorageFake.setItem(
    STORAGE_KEY,
    JSON.stringify([
      persistedEntry('entry-a', {
        receivingId: 42,
        receivingLineId: null,
        stage: 'arrival_package',
        capturedAtMs: CAPTURED_MS,
      }),
      persistedEntry('entry-b', { receivingId: 42, receivingLineId: 7 }),
    ]),
  );
}

function restoreGlobals() {
  const g = globalThis as Record<string, unknown>;
  for (const key of ['window', 'localStorage', 'fetch']) g[key] = savedGlobals[key];
  (URL as unknown as Record<string, unknown>).createObjectURL = savedGlobals.createObjectURL;
  (URL as unknown as Record<string, unknown>).revokeObjectURL = savedGlobals.revokeObjectURL;
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for: ${label} (posted=${JSON.stringify(posted)})`);
}

describe('§2 rehydration · a queued photo keeps its capture time across a tab kill', () => {
  before(async () => {
    stubGlobals();
    // Imported AFTER the globals exist — the module is a singleton that reads
    // them on first subscribe.
    const { photoUploadQueue } = await import(
      '@/components/mobile/receiving/PhotoUploadQueue'
    );
    // subscribe() is where useSyncExternalStore triggers rehydrate() in the
    // browser; rehydrate auto-resumes every `queued` entry.
    photoUploadQueue.subscribe(() => {});
    await waitFor(() => posted.length >= 2, 'both rehydrated entries to upload');
  });

  after(() => {
    restoreGlobals();
  });

  it('rehydrates and resumes both persisted entries', () => {
    assert.equal(posted.length, 2);
  });

  it('entry A ships the SHUTTER instant, not the drain instant', () => {
    // The queued-at time was 3h ago and the upload is happening now; neither
    // may stand in for the capture.
    const a = posted.find((p) => p.entityType === 'RECEIVING');
    assert.ok(a, 'expected the PO-level entry to have uploaded');
    assert.equal(a.capturedAt, String(CAPTURED_MS));
    assert.notEqual(Number(a.capturedAt), Date.now());
    // Stage survived the same round trip (they share `scope`).
    assert.equal(a.photoType, 'receiving_package');
  });

  it('entry B — a legacy stage-less, timestamp-less payload — still uploads, with no field', () => {
    // A v1 payload written before the field existed must rehydrate and drain
    // rather than be dropped; a null column is the honest record.
    const b = posted.find((p) => p.entityType === 'RECEIVING_LINE');
    assert.ok(b, 'expected the line-level legacy entry to have uploaded');
    assert.equal(b.entityId, '7');
    assert.equal(b.capturedAt, null, 'no capture time must mean NO field, not an empty one');
  });

  it('STORAGE_VERSION was not bumped for the additive field', async () => {
    // rehydrate() drops every entry whose `v` mismatches, so a bump would have
    // deleted the queued photos of anyone mid-shift at deploy time. The two
    // entries above rehydrating at all IS that assertion; this pins the intent.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src/components/mobile/receiving/PhotoUploadQueue.ts'),
      'utf8',
    );
    assert.match(src, /const STORAGE_VERSION = 1;/);
  });
});
