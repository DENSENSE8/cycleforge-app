import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const builder = readFileSync(new URL('./LocationLabelBuilder.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../components/warehouse/LocationsWorkspace.tsx', import.meta.url), 'utf8');
const printRun = readFileSync(new URL('../../lib/print/printLabelRun.ts', import.meta.url), 'utf8');
const pathChips = readFileSync(new URL('../../design-system/components/PathChips.tsx', import.meta.url), 'utf8');

test('Labels owns one Single/Bulk mode switch with no legacy reset control', () => {
  assert.match(builder, /id: 'single', label: 'Single'/);
  assert.match(builder, /id: 'bulk', label: 'Bulk'/);
  assert.doesNotMatch(builder, />\s*Start over\s*</);
  assert.doesNotMatch(builder, /label: 'Run'/);
  assert.doesNotMatch(builder, /has no zone letter\. Give it one/);
});

test('desktop Labels puts breadcrumbs above both columns and modes inside selection', () => {
  assert.match(workspace, /width="workspace"/);
  assert.match(builder, /data-testid="location-label-workspace"/);
  assert.match(builder, /lg:grid-cols-\[minmax\(0,0\.9fr\)_minmax\(0,1\.1fr\)\]/);
  assert.match(builder, /aria-label="Select location"/);
  assert.match(builder, /aria-label=\{bulk \? 'Bulk labels' : 'Selected label'\}/);
  assert.ok(builder.indexOf('<StepPills') < builder.indexOf('data-testid="location-label-workspace"'));
  assert.ok(builder.indexOf('aria-label="Select location"') < builder.indexOf('tabs={QUANTITY_TABS}'));
});

test('location printing never registers user-visible work as Bin labels', () => {
  assert.match(printRun, /asPrintWork\('Location labels'/);
  assert.doesNotMatch(printRun, /asPrintWork\('Bin labels'/);
});

test('compact address pills use the small pill face', () => {
  assert.match(pathChips, /density === 'compact' \? 'pill'/);
  assert.match(pathChips, /density === 'compact' \? 'h-8 min-h-8 gap-1 px-2'/);
});
