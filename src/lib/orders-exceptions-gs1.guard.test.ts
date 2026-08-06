/**
 * Ratchet: packing + exception match must unwrap FedEx GS1 via the shared SoT
 * (`orderTrackingMatchKeys` / `extractCanonicalTracking`) before exact STN join.
 * Importing `orders-exceptions` pulls `server-only` db — assert on source instead.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.resolve(__dirname, '../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('pack / exception GS1 ↔ short STN SoT', () => {
  const packing = readRepo('src/app/api/packing-logs/route.ts');
  const exceptions = readRepo('src/lib/orders-exceptions.ts');
  const resolve = readRepo('src/lib/shipping/resolve.ts');
  const sync = readRepo('src/lib/shipping/sync-shipment.ts');

  it('packing-logs derives ladder keys via orderTrackingMatchKeys (not raw GS1)', () => {
    assert.match(packing, /orderTrackingMatchKeys\(scanInput\)/);
    assert.match(packing, /shippingTrackingNumber:\s*normalizedInput/);
    assert.doesNotMatch(
      packing,
      /normalizeTrackingNumber\(scanInput\)/,
      'packing must not match on normalizeTrackingNumber alone (misses GS1 unwrap)',
    );
  });

  it('findOrderByTrackingKey exact-joins canonical STN before key18/last8', () => {
    assert.match(exceptions, /orderTrackingMatchKeys/);
    assert.match(
      exceptions,
      /stn\.tracking_number_normalized = \$1/,
      'exact STN normalized join must run first',
    );
  });

  it('STN resolve/register keys normalized on extractCanonicalTracking', () => {
    assert.match(resolve, /extractCanonicalTracking\(trimmed\)/);
    assert.match(sync, /extractCanonicalTracking\(/);
    assert.match(
      sync,
      /trackingNumberNormalized:\s*normalized/,
      'register must write the canonical short key',
    );
  });

  it('scan-out order/exception fallback unwraps via extractCanonicalTracking', () => {
    const scanOut = readRepo('src/app/api/shipped/scan-out/route.ts');
    assert.match(scanOut, /extractCanonicalTracking\(raw\)/);
    assert.match(
      scanOut,
      /extractCanonicalTracking\(String\(row\.shipping_tracking_number/,
      'row compare must canonicalize stored tracking too',
    );
    assert.doesNotMatch(
      scanOut,
      /normalizeTrackingNumber\(raw\)/,
      'scan-out must not match on normalizeTrackingNumber alone (misses GS1 unwrap)',
    );
  });
});
