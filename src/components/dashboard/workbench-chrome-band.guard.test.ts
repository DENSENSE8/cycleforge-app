/**
 * Source guard: WorkbenchChromeHeader density="band" stays a single-surface
 * 40px face (h-10 + p-0.5 inset, flat TabSwitch rail — no nested border/shadow
 * card). TabSwitch size="sm" uses concentric nestedCorner + nav caption type.
 * Cascade: every lifecycle WorkbenchChromeHeader consumer uses density="band".
 *
 * Run: node --test --import tsx \
 *        src/components/dashboard/workbench-chrome-band.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

/** Every mount that must pass density="band" (house standard). */
const BAND_CONSUMERS = [
  'src/components/receiving/unbox/UnboxWorkspaceHeader.tsx',
  'src/components/receiving/triage/TriageWorkspaceHeader.tsx',
  'src/components/sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx',
  'src/components/sidebar/receiving/HistoryWorkspaceHeader.tsx',
  'src/components/dashboard/OutboundWorkspaceHeader.tsx',
  'src/components/packer/PackWorkspaceHeader.tsx',
  'src/components/tech/testing/TestingWorkspaceHeader.tsx',
  'src/components/tech/shipping/ShippingWorkspaceHeader.tsx',
  'src/components/outbound/labels/LabelsWorkspaceHeader.tsx',
  'src/components/fba/FbaWorkspaceHeader.tsx',
  'src/components/walk-in/WalkInDeskHeader.tsx',
  'src/components/repair/RepairWorkspaceHeader.tsx',
  'src/components/photos/PhotoLibraryWorkspaceHeader.tsx',
  'src/components/labels/LabelsProductsWorkspaceHeader.tsx',
  'src/components/support/zendesk/SupportTicketsBoard.tsx',
  'src/components/receiving/pickup/PickupWorkspace.tsx',
  'src/components/products/catalog/ProductsCatalogWorkspace.tsx',
  'src/features/review/pairing/ReviewPairingTable.tsx',
  'src/features/review/ReviewPackingTable.tsx',
  'src/features/review/catalog-link/ReviewCatalogLinkTable.tsx',
] as const;

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function code(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('WorkbenchChromeHeader density="band"', () => {
  const shell = code(src('src/components/dashboard/workbench-shell.tsx'));

  it('outer face is h-10 with 2px inset (p-0.5)', () => {
    assert.match(shell, /band\s*\?\s*'h-10 items-stretch p-0\.5'/);
  });

  it('band rail is flat flush — no nested border / shadow-sm / stadium pill', () => {
    // Isolate the band branch of railClassName.
    const bandRail = shell.match(
      /band\s*\?\s*`([^`]+)`\s*:\s*[`'"]/,
    )?.[1];
    assert.ok(bandRail, 'expected band railClassName template literal');
    assert.match(bandRail, /\bborder-0\b/);
    assert.match(bandRail, /\bshadow-none\b/);
    assert.match(bandRail, /cornerClass\('flush'\)/);
    assert.doesNotMatch(bandRail, /\bborder-border-/);
    assert.doesNotMatch(bandRail, /\bshadow-sm\b/);
    assert.doesNotMatch(bandRail, /rounded-full/);
  });

  it('outer face uses cornerClass(flush), not card', () => {
    const headerFn = shell.slice(shell.indexOf('export function WorkbenchChromeHeader'));
    const end =
      headerFn.indexOf('export function WorkbenchTriageBand') > 0
        ? headerFn.indexOf('export function WorkbenchTriageBand')
        : headerFn.length;
    const body = headerFn.slice(0, end);
    assert.match(body, /cornerClass\('flush'\)/);
    assert.doesNotMatch(
      body,
      /cornerClass\('card'\)/,
      'WorkbenchChromeHeader must be flush at source — callers must not fight soft card radius',
    );
  });

  it('default density rail is flush (not rounded-full stadium)', () => {
    const headerFn = shell.slice(shell.indexOf('export function WorkbenchChromeHeader'));
    const railBlock = headerFn.match(/railClassName=\{([\s\S]*?)\}\s*\/>/)?.[1] ?? '';
    assert.doesNotMatch(
      railBlock,
      /rounded-full/,
      'Default TabSwitch rail must not use rounded-full',
    );
    assert.match(
      railBlock,
      /cornerClass\('flush'\)/,
      'Default rail must compose cornerClass(flush)',
    );
  });
});

describe('TabSwitch size="sm" (band companion)', () => {
  const tabSwitch = code(src('src/design-system/components/TabSwitch.tsx'));

  it('compact pill uses nestedCornerClass(card, 0.5)', () => {
    assert.match(tabSwitch, /nestedCornerClass\('card',\s*0\.5\)/);
    assert.doesNotMatch(
      tabSwitch,
      /compact\s*\?\s*cornerClass\('card'\)/,
      'compact must not reuse the outer card radius (flush equal-radius anti-pattern)',
    );
  });

  it('compact solid-hug uses text-role-caption (not text-xs)', () => {
    assert.match(
      tabSwitch,
      /flex h-full items-center px-2\.5 text-role-caption/,
    );
    assert.doesNotMatch(
      tabSwitch,
      /flex h-full items-center px-2\.5 text-xs/,
    );
  });
});

describe('band cascade consumers', () => {
  for (const rel of BAND_CONSUMERS) {
    it(`${rel} uses density="band"`, () => {
      const body = code(src(rel));
      assert.match(body, /density=["']band["']/);
    });
  }

  it('Unbox has no leading tab icons', () => {
    const unbox = code(src('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx'));
    assert.doesNotMatch(unbox, /\bUNBOX_TAB_ICON\b/);
    assert.doesNotMatch(unbox, /\bicon:\s*UNBOX_TAB_ICON/);
  });
});
