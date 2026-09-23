import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const putaway = readFileSync(
  path.resolve(process.cwd(), 'src/components/mobile/pair/MobilePairQty.tsx'),
  'utf8',
);
const locationRoute = readFileSync(
  path.resolve(process.cwd(), 'src/app/api/locations/[barcode]/route.ts'),
  'utf8',
);

test('mobile putaway confirmation uses the WMS command socket', () => {
  assert.match(putaway, /name:\s*'putaway\.adjust'/);
  assert.match(putaway, /executeWmsCommand/);
  assert.doesNotMatch(putaway, /queueOrFetch/);
  assert.doesNotMatch(putaway, /method:\s*'PATCH'/);
  assert.doesNotMatch(putaway, /\/api\/locations\/\$\{encodeURIComponent\(code\)\}[^'"`]*[\s\S]{0,200}method:\s*'PATCH'/);
});

test('REST bin motion is a thin adapter over the same WMS command', () => {
  assert.match(locationRoute, /executeWmsPutawayAdjust/);
  assert.match(locationRoute, /receipt:\s*\{ commandId: idempotencyKey, replayed:/);
  assert.doesNotMatch(locationRoute, /adjustBinQty/);
});
