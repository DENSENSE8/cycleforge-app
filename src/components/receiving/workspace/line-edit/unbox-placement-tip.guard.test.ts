/**
 * Putaway confirmation mounts only when a location is staged after print —
 * never a grayed empty "Scan location" tip. PlacementSummary keeps the
 * nested-field fact face when staged.
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

test('UnboxPlacementSection mounts putaway confirmation only when staged', () => {
  const code = codeOnly(SECTION);
  assert.match(code, /label_printed_at/, 'section gates on label print');
  assert.match(code, /staged_at/, 'section gates on staged location');
  assert.match(
    code,
    /if \(!printed \|\| !staged/,
    'hidden until printed and staged — no empty Scan location tip',
  );
  assert.doesNotMatch(
    code,
    /InlineNotice/,
    'banned: empty Scan location InlineNotice tip',
  );
  assert.doesNotMatch(
    code,
    /Scan location/,
    'banned: Scan location empty-state copy',
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
