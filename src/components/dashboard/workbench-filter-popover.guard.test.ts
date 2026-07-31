/**
 * WorkbenchFilterPopover a11y + hot-chip glanceability (Package Pairing P0).
 *
 * - Hot state must expose active scope in aria-label (not color/dot alone).
 * - WorkbenchFilterHotChip is the persistent clearable chip SoT.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(process.cwd(), 'src/components/dashboard/workbench-filter-popover.tsx');
const SCOPE = join(
  process.cwd(),
  'src/components/receiving/unfound/ecwid-search/EcwidOrderScopeFilters.tsx',
);
const INPUTS = join(
  process.cwd(),
  'src/components/receiving/unfound/ecwid-search/EcwidSearchInputs.tsx',
);

describe('WorkbenchFilterPopover hot a11y (P0)', () => {
  const src = readFileSync(ROOT, 'utf8');

  it('builds aria-label with hotActiveLabel when hot', () => {
    assert.match(src, /hotActiveLabel/);
    assert.match(src, /\$\{label\} \(\$\{hotActiveLabel\} active\)/);
  });

  it('exports WorkbenchFilterHotChip', () => {
    assert.match(src, /export function WorkbenchFilterHotChip/);
  });

  it('restores focus on close via onCloseAutoFocus', () => {
    assert.match(src, /onCloseAutoFocus/);
    assert.match(src, /triggerRef\.current\?\.focus/);
  });
});

describe('Ecwid Store scope hot chip (P0)', () => {
  it('passes hotActiveLabel into WorkbenchFilterPopover', () => {
    const src = readFileSync(SCOPE, 'utf8');
    assert.match(src, /hotActiveLabel=\{hotLabel\}/);
    assert.match(src, /export function EcwidOrderScopeHotChip/);
  });

  it('renders hot chip beside SearchField in Store mode', () => {
    const src = readFileSync(INPUTS, 'utf8');
    assert.match(src, /EcwidOrderScopeHotChip/);
  });
});
