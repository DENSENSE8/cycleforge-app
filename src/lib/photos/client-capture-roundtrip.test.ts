/**
 * §2 client capture provenance — the DEVICE→WIRE→ROUTE→COLUMN round trip.
 *
 * `photos.created_at` is the server-INSERT instant, which for a queued mobile
 * upload can land hours after the shutter. `photos.client_captured_at` is the
 * device's own reading. The value therefore crosses four modules, and a break
 * at ANY seam is silent (the column just goes null and nobody notices until a
 * carrier dispute):
 *
 *   capture-time.ts   read on the device, before downscale destroys EXIF
 *        ↓            (`clientCapturedAtMs`, epoch ms)
 *   upload-client.ts  multipart field `CLIENT_CAPTURED_AT_FIELD`
 *        ↓
 *   capture-provenance.ts   `parseClientCapturedAt` at the route edge → Date|null
 *        ↓
 *   create-photo.ts   bound as the 5th INSERT param on `photos`
 *
 * These suites walk the whole chain with fakes at the two I/O boundaries
 * (`fetch`, the pg client) — no DB, no browser. The route handler itself is not
 * importable DB-free (`withAuth` + the pool), so its edge parser and its
 * degrade-to-null contract are covered directly here and the wiring is asserted
 * from source at the bottom.
 *
 * The second half is the legacy contract: a stage-less, timestamp-less payload
 * must upload byte-identically and store NULL. A fabricated timestamp would be
 * worse than none — see `capture-provenance.ts`.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLIENT_CAPTURED_AT_FIELD,
  parseClientCapturedAt,
} from '@/lib/photos/capture-provenance';
import {
  captureTimeFromFile,
  normalizeCaptureTimeMs,
  shutterCaptureTime,
} from '@/lib/photos/capture-time';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { insertPhotoCatalog } from '@/lib/photos/create-photo';

const ORG = '00000000-0000-0000-0000-000000000001';
/** A believable capture instant: 2026-07-29T18:04:11.000Z. */
const CAPTURED_MS = Date.UTC(2026, 6, 29, 18, 4, 11);

// ─── fakes at the two I/O boundaries ────────────────────────────────────────

/** Captures the multipart body `uploadPhotoClient` posts, without a network. */
function fetchFake() {
  const bodies: FormData[] = [];
  const fake = mock.fn(async (_url: unknown, init: { body: FormData }) => {
    bodies.push(init.body);
    return {
      ok: true,
      json: async () => ({ id: 99, url: '/api/photos/99/content' }),
    } as unknown as Response;
  });
  return { fake, bodies };
}

/** Captures the INSERT params `insertPhotoCatalog` binds, without a DB. */
function pgClientFake() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { rows: [{ id: '77' }] };
    },
  };
  return { client: client as never, calls };
}

/**
 * Drive the whole chain once: device value → FormData → route parse → INSERT.
 * Returns what each seam saw, so a test can assert the value survived rather
 * than just that each module works in isolation.
 */
async function roundTrip(clientCapturedAtMs: number | null | undefined) {
  const { fake, bodies } = fetchFake();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fake as unknown as typeof fetch;
  try {
    await uploadPhotoClient({
      file: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
      entityType: 'RECEIVING',
      entityId: 42,
      photoType: 'receiving_package',
      ...(clientCapturedAtMs === undefined ? {} : { clientCapturedAtMs }),
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const form = bodies[0];
  // The route reads the raw multipart entry — model that verbatim, including
  // the `null` a missing field yields from FormData.get().
  const wire = form.get(CLIENT_CAPTURED_AT_FIELD);
  const parsed = parseClientCapturedAt(wire);

  const { client, calls } = pgClientFake();
  await insertPhotoCatalog(client, {
    organizationId: ORG,
    staffId: 7,
    photoType: 'receiving_package',
    clientCapturedAt: parsed,
  });

  return { form, wire, parsed, insert: calls[0] };
}

// ─── device read ────────────────────────────────────────────────────────────

describe('§2 device read · the capture instant is read where the capture happened', () => {
  it('a camera-input File reports its lastModified', () => {
    const file = { lastModified: CAPTURED_MS, size: 10, type: 'image/jpeg' };
    assert.equal(captureTimeFromFile(file as unknown as File), CAPTURED_MS);
  });

  it('a canvas capture has no File, so the shutter clock stands in', () => {
    const before = Date.now();
    const shot = shutterCaptureTime();
    assert.ok(shot >= before && shot <= Date.now());
    // …and it must survive the shared bounds, or the studios stamp a value the
    // server would silently drop.
    assert.equal(normalizeCaptureTimeMs(shot), shot);
  });

  it('rejects the epoch-0 lastModified several mobile browsers report', () => {
    // THE case the floor exists for: a 1970 date in an evidence panel reads as
    // data when the truth is "unknown".
    assert.equal(captureTimeFromFile({ lastModified: 0 } as unknown as File), null);
    assert.equal(normalizeCaptureTimeMs(0), null);
  });

  it('rejects a wildly-future clock but tolerates a drifted warehouse tablet', () => {
    const hoursAhead = Date.now() + 6 * 60 * 60 * 1000;
    assert.equal(normalizeCaptureTimeMs(hoursAhead), hoursAhead);
    assert.equal(normalizeCaptureTimeMs(Date.now() + 5 * 24 * 60 * 60 * 1000), null);
  });

  it('a bare Blob (canvas output) has no lastModified and yields null', () => {
    assert.equal(captureTimeFromFile(new Blob([new Uint8Array([1])])), null);
    assert.equal(captureTimeFromFile(null), null);
    assert.equal(captureTimeFromFile(undefined), null);
  });

  it('the device normalizer and the route parser agree by construction', () => {
    // If these ever diverge, a client ships values the server silently drops.
    for (const ms of [0, 1, CAPTURED_MS, Date.now(), Date.now() + 5 * 86_400_000]) {
      const clientKept = normalizeCaptureTimeMs(ms);
      const serverKept = parseClientCapturedAt(String(ms))?.getTime() ?? null;
      assert.equal(clientKept, serverKept, `disagreement at ${ms}`);
    }
  });
});

// ─── the round trip ─────────────────────────────────────────────────────────

describe('§2 round trip · a supplied capture timestamp survives to storage', () => {
  it('device ms → multipart field → parsed Date → the client_captured_at INSERT param', async () => {
    const { wire, parsed, insert } = await roundTrip(CAPTURED_MS);

    // Wire: epoch ms verbatim, under the shared field name.
    assert.equal(wire, String(CAPTURED_MS));
    // Route edge: a real instant, not a coerced 1970.
    assert.ok(parsed instanceof Date);
    assert.equal(parsed.getTime(), CAPTURED_MS);
    assert.equal(parsed.toISOString(), '2026-07-29T18:04:11.000Z');
    // Column: bound as the 5th param of the photos INSERT.
    assert.match(insert.sql, /INSERT INTO photos[\s\S]*client_captured_at/);
    assert.equal((insert.params[4] as Date).getTime(), CAPTURED_MS);
  });

  it('survives the seam from a real File, unchanged end to end', async () => {
    const fromFile = captureTimeFromFile({ lastModified: CAPTURED_MS } as unknown as File);
    const { insert } = await roundTrip(fromFile);
    assert.equal((insert.params[4] as Date).getTime(), CAPTURED_MS);
  });

  it('the timestamp is NOT derived from created_at / now() anywhere on the path', async () => {
    // The whole point: a queued upload draining hours later must still report
    // the shutter instant, so nothing downstream may substitute a fresh clock.
    const { insert } = await roundTrip(CAPTURED_MS);
    const stored = (insert.params[4] as Date).getTime();
    assert.notEqual(stored, Date.now());
    assert.ok(Date.now() - stored !== 0);
  });
});

// ─── the legacy / absent contract ───────────────────────────────────────────

describe('§2 legacy · a stage-less, timestamp-less payload uploads cleanly with a NULL column', () => {
  it('omitting the field posts a byte-identical body — no key, no empty string', async () => {
    const { form, wire, parsed, insert } = await roundTrip(undefined);
    assert.equal(form.has(CLIENT_CAPTURED_AT_FIELD), false);
    assert.equal(wire, null);
    assert.equal(parsed, null);
    assert.equal(insert.params[4], null);
  });

  it('an explicit null is the same as absent (queue entries rehydrated pre-field)', async () => {
    const { form, insert } = await roundTrip(null);
    assert.equal(form.has(CLIENT_CAPTURED_AT_FIELD), false);
    assert.equal(insert.params[4], null);
  });

  it('a NaN/Infinity capture value never reaches the wire', async () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const { form } = await roundTrip(bad);
      assert.equal(form.has(CLIENT_CAPTURED_AT_FIELD), false, `leaked: ${bad}`);
    }
  });

  it('a malformed value costs the timestamp, never the photo', () => {
    // Provenance is a secondary fact on an evidence upload — the route degrades
    // to null (and logs) rather than 400-ing a real photo away.
    for (const raw of ['', '   ', 'yesterday', 'NaN', 'Jan', '2019', 'true', '1e15', {}, [], true]) {
      assert.equal(parseClientCapturedAt(raw), null, `raw: ${JSON.stringify(raw)}`);
    }
  });

  it('an out-of-range epoch-ms integer is dropped at both ends', () => {
    assert.equal(parseClientCapturedAt('0'), null); // epoch 0 → the 1970 trap
    assert.equal(parseClientCapturedAt('1'), null);
    assert.equal(parseClientCapturedAt('99999999999999999'), null); // >15 digits
  });

  it('CHARACTERIZATION (finding): the Date.parse fallback still fabricates from loose junk', () => {
    // NOT an endorsement — this pins current behavior so the finding is visible.
    // `parseClientCapturedAt` tries `Date.parse` for anything that is not a
    // 1–15 digit integer, and V8's legacy parser accepts loose date-ish strings
    // and resolves them in the SERVER's local zone. So a garbage field can land
    // ABOVE the year-2000 floor and be stored as a plausible-looking instant —
    // the exact "fabricated value wearing a precise mask" the floor exists to
    // stop. Unreachable from the shipped clients (`uploadPhotoClient` only ever
    // writes epoch ms), so this is a hardening note, not a live defect.
    for (const raw of ['-1', '12/12', 'Mar 2019']) {
      const parsed = parseClientCapturedAt(raw);
      assert.ok(parsed instanceof Date, `expected current (undesirable) behavior for ${raw}`);
      assert.ok(parsed.getTime() > Date.UTC(2000, 0, 1));
    }
  });

  it('insertPhotoCatalog omitting the field entirely still binds NULL (no undefined param)', async () => {
    const { client, calls } = pgClientFake();
    await insertPhotoCatalog(client, { organizationId: ORG, staffId: null });
    assert.equal(calls[0].params.length, 5);
    assert.equal(calls[0].params[4], null);
  });
});

// ─── wiring the round trip cannot reach ─────────────────────────────────────

describe('§2 wiring · the route edge and the service thread the value through', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('the upload route parses the shared field and passes it to uploadPhoto', () => {
    const src = read('src/app/api/photos/upload/route.ts');
    assert.match(src, /parseClientCapturedAt/);
    assert.match(src, /form\.get\(CLIENT_CAPTURED_AT_FIELD\)/);
    assert.match(src, /clientCapturedAt,/);
    // Degrade, never reject: no 400 branch on this field.
    assert.doesNotMatch(src, /CLIENT_CAPTURED_AT_FIELD[\s\S]{0,200}status: 400/);
  });

  it('the photo service forwards it on BOTH insert paths (adapter + legacy URL)', () => {
    // A miss on either path is invisible: the photo uploads, the column is null.
    const src = read('src/lib/photos/service.ts');
    const forwards = src.match(/clientCapturedAt: input\.clientCapturedAt \?\? null/g) ?? [];
    assert.ok(
      forwards.length >= 3,
      `expected the value forwarded on every insert path, found ${forwards.length}`,
    );
  });

  it('every read path SELECTs the column and maps it — a write-only column is not evidence', () => {
    // The first landing wrote `client_captured_at` on upload and never selected
    // it back, so the viewer's `Captured` row could not render on ANY surface.
    // Each seam below is independently silent when it drops the field, so each
    // is pinned: the SELECT text, the row mapper, and the wire shape.

    // Media library list — its own explicit SELECT, mapped via mapPhotoRow.
    const library = read('src/lib/photos/queries/library.ts');
    assert.match(library, /p\.client_captured_at/);

    // Entity photo list — shared PHOTO_SELECT + the shared row mapper. The row
    // type keeps the key REQUIRED (nullable value) so a SELECT that forgets the
    // column is a type error rather than a silent null.
    const entity = read('src/lib/photos/queries/list-for-entity.ts');
    assert.match(entity, /PHOTO_SELECT[\s\S]*?p\.client_captured_at/);
    assert.match(entity, /client_captured_at: string \| null;/);
    assert.match(entity, /clientCapturedAt: row\.client_captured_at \?\? null/);

    // Receiving/carton photo list — the unbox peek + station section source.
    const receiving = read('src/lib/photos/queries/receiving-list.ts');
    assert.match(receiving, /p\.client_captured_at/);
    assert.match(receiving, /clientCapturedAt: row\.client_captured_at \?\? null/);
    const route = read('src/app/api/receiving-photos/route.ts');
    assert.match(route, /clientCapturedAt: row\.clientCapturedAt \?\? null/);

    // …and the meta builder the viewer panel actually reads. `unboxingPhotoMeta`
    // is the ONE place receiving photo meta is built; omitting the field here
    // nulls it for every carton surface at once.
    const utils = read('src/components/shipped/photo-gallery/photo-gallery-utils.ts');
    assert.match(utils, /clientCapturedAt: fields\.clientCapturedAt \?\? null/);
    const panel = read('src/components/shipped/photo-gallery/PhotoContextPanel.tsx');
    assert.match(panel, /meta\?\.clientCapturedAt/);
  });

  it('the receiving upload queue carries it on `scope`, so localStorage persists it', () => {
    // `PersistedEntry.meta` is `Omit<UploadEntry,'previewUrl'>` — it carries the
    // whole scope. A field moved off `scope` would be dropped by persist() and
    // the capture time would die on a tab kill.
    const src = read('src/components/mobile/receiving/PhotoUploadQueue.ts');
    assert.match(src, /export interface PhotoScope[\s\S]*?capturedAtMs\?: number \| null;[\s\S]*?\n\}/);
    assert.match(src, /clientCapturedAtMs: entry\.scope\.capturedAtMs \?\? null/);
    assert.match(src, /meta: Omit<UploadEntry, 'previewUrl'>/);
  });
});
