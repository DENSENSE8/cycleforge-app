import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * Arrival door-flow must not restyle Unbox PoLineMetaGrid into a 3-column
 * qty|SKU|price collapse — unitsChrome is editor-only after the Arrival→Unbox
 * SKU face port.
 */
const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'PoLineMetaGrid.tsx'),
  'utf8',
);

test('PoLineMetaGrid always uses Unbox five-track columns', () => {
  assert.ok(
    /grid-cols-\[auto_auto_auto_minmax\(2\.5rem,1fr\)_auto\]/.test(SRC),
    'must paint qty | SKU | condition | serial | price',
  );
  assert.doesNotMatch(
    SRC,
    /grid-cols-\[auto_auto_auto\](?!_)/,
    'must not collapse to qty | SKU | price when unitsChrome is false',
  );
  assert.doesNotMatch(
    SRC,
    /unitsChrome\s*\?\s*['"]grid-cols-/,
    'unitsChrome must not switch grid-cols templates',
  );
});

test('PoLineMetaGrid always mounts condition + serial columns', () => {
  assert.ok(/data-col="condition"/.test(SRC), 'condition column always present');
  assert.ok(/data-col="serial"/.test(SRC), 'serial column always present');
  assert.doesNotMatch(
    SRC,
    /\{unitsChrome \? \(\s*<>[\s\S]*data-col="condition"/,
    'must not gate condition/serial JSX on unitsChrome',
  );
});
