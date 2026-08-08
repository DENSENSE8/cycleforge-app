/**
 * Serial projection writers — every attach/detach/log path that mutates line
 * serials must call refreshLineSerialProjectionSafe (best-effort denorm for
 * warm list chips). Source guards; unit math lives in serial-projection.test.ts.
 *
 * Run: `npx tsx --test src/lib/receiving/serial-projection-writers.guard.test.ts`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const DIR = dirname(fileURLToPath(import.meta.url));
const readRoute = (rel: string) =>
  readFileSync(join(DIR, '../../app/api', rel), 'utf8');

describe('serial_projection writer routes', () => {
  it('log-serial refreshes projection when paired to a line', () => {
    const src = readRoute('receiving/log-serial/route.ts');
    assert.match(src, /refreshLineSerialProjectionSafe/, 'log-serial must refresh projection');
  });

  it('receiving/serials POST and DELETE refresh projection', () => {
    const src = readRoute('receiving/serials/route.ts');
    assert.match(src, /refreshLineSerialProjectionSafe/, 'serials route must refresh projection');
    // Both POST (create) and DELETE paths should call it — count ≥ 2.
    const count = (src.match(/refreshLineSerialProjectionSafe/g) ?? []).length;
    assert.ok(count >= 2, `expected ≥2 refresh calls (POST+DELETE), got ${count}`);
  });

  it('scan-serial still refreshes (regression)', () => {
    const src = readRoute('receiving/scan-serial/route.ts');
    assert.match(src, /refreshLineSerialProjectionSafe/);
  });
});
