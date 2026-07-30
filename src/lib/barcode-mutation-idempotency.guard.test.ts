import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 1 station-safety: barcode lifecycle writes must wire
 * `readIdempotencyKey` + claim/replay (see kinetic-ledger-station-safety-PLAN).
 * Shrink-only — do not delete a route from this list without replacing coverage.
 */
const IDEMPOTENT_WRITE_ROUTES = [
  'src/app/api/orders/add/route.ts',
  'src/app/api/packing-logs/route.ts',
  'src/app/api/packing-logs/update/route.ts',
  'src/app/api/packerlogs/route.ts',
  'src/app/api/tech/serial/route.ts',
] as const;

test('barcode mutation routes import api-idempotency helpers', () => {
  const root = join(process.cwd());
  for (const rel of IDEMPOTENT_WRITE_ROUTES) {
    const src = readFileSync(join(root, rel), 'utf8');
    assert.match(
      src,
      /from ['"]@\/lib\/api-idempotency['"]/,
      `${rel} must import @/lib/api-idempotency`,
    );
    assert.match(src, /readIdempotencyKey/, `${rel} must call readIdempotencyKey`);
    assert.ok(
      /withIdempotencyClaim|getApiIdempotencyResponse|claimOrReplay/.test(src),
      `${rel} must use claim/replay or get/save idempotency`,
    );
  }
});
