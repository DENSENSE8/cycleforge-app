/**
 * Empty PUTAWAY tip is edge-flush InlineNotice on white card — never a
 * padded WORKSPACE_NESTED_FIELD tip island. Mounts only after label print.
 * PlacementSummary keeps the nested-field fact face when staged.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/receiving/workspace/line-edit/unbox-placement-tip.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SECTION = join(
  process.cwd(),
  'src/components/receiving/workspace/line-edit/UnboxPlacementSection.tsx',
);
const SUMMARY = join(process.cwd(), 'src/components/receiving/PlacementSummary.tsx');

function src(path: string): string {
  return readFileSync(path, 'utf8');
}

function codeOnly(path: string): string {
  return src(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

test('UnboxPlacementSection empty tip is edge-flush white Putaway InlineNotice after print', () => {
  const code = codeOnly(SECTION);
  assert.match(code, /label_printed_at/, 'section gates on label print');
  assert.match(code, /if \(!printed\) return null/, 'hidden until printed');
  assert.match(code, /InlineNotice/, 'empty tip uses flush InlineNotice');
  assert.match(
    code,
    /title=["']Putaway["']/,
    'InlineNotice carries the Putaway title',
  );
  assert.match(
    code,
    /bg-surface-card/,
    'empty tip paints white card, not canvas wash',
  );
  assert.match(
    code,
    /border-x-0/,
    'empty tip is edge-flush (no side inset island)',
  );
  assert.doesNotMatch(
    code,
    /WORKSPACE_NESTED_FIELD/,
    'empty tip must not wrap instructional copy in WORKSPACE_NESTED_FIELD',
  );
  // Empty branch must not wrap InlineNotice in an inset pad host.
  assert.doesNotMatch(
    code,
    /<div className="[^"]*inset-cozy[^"]*">\s*<InlineNotice/,
    'no outer inset-cozy around the empty tip',
  );
  assert.match(
    code,
    /PlacementSummary/,
    'staged confirmation still mounts PlacementSummary',
  );
});

test('PlacementSummary keeps WORKSPACE_NESTED_FIELD for the place-here fact face', () => {
  const code = codeOnly(SUMMARY);
  assert.match(
    code,
    /WORKSPACE_NESTED_FIELD/,
    'filled place-here face stays on the nested-field SoT',
  );
});
