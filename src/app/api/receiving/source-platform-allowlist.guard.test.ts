/**
 * Guard: PATCH /api/receiving/[id] source_platform allowlist must include every
 * SoT platform (esp. `fba`). A drifted local Set caused FBA classify to 400
 * while the pill painted — claim subjects stayed "Unknown - Return".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCE_PLATFORMS } from '@/lib/source-platform';

const ROUTE = readFileSync(
  join(process.cwd(), 'src/app/api/receiving/[id]/route.ts'),
  'utf8',
);

test('receiving PATCH allowlist is derived from source-platform SoT (includes fba)', () => {
  assert.match(
    ROUTE,
    /SOURCE_PLATFORMS as SOURCE_PLATFORM_REGISTRY/,
    'route must import the source-platform registry — do not re-list values locally',
  );
  assert.match(
    ROUTE,
    /SOURCE_PLATFORM_REGISTRY\.map\(\(p\) => p\.value\)/,
    'allowlist must spread registry values so fba/shopify/square cannot drift out',
  );
  assert.ok(
    SOURCE_PLATFORMS.some((p) => p.value === 'fba'),
    'SoT must still define fba',
  );
});
