/**
 * Station Displays nested-leaf grammar (locked 2026-08-08; armed-row verbs).
 *
 * Root Index = the only subject lateral layer. Inside a leaf:
 *   - **Preferred:** armed-row verb list + URL drill-downs (Photos golden) —
 *     trail via `useDisplaysLeafChrome`; never a parent TabDisplay strip.
 *   - **OR** secondary vertical index (Inventory reference sections).
 * Never both. Never a second `StationDisplayLeafHeader`.
 * Child perspectives **inside a tool** use `appearance="segment"` (Claim New·Link ·
 * Move To·From · Prebox mode · Support Team·Activity) — never soft `TabSwitch` /
 * `rounded-full` pills.
 *
 * Debt allowlist (shrink-only): Linkage · Units still mount one parent underline
 * until migrated to armed rows. Nothing may join this list.
 *
 *   node --import tsx --test src/components/station/displays/station-displays-nested-grammar.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

/**
 * Parent-underline debt survivors — shrink-only. Migrating a host to armed
 * rows removes it from this list; never add a new Displays leaf here.
 */
const UNDERLINE_PARENT_HOSTS = [
  'src/components/receiving/workspace/line-edit/LinkageDisplayHost.tsx',
  'src/components/receiving/workspace/line-edit/UnitsDisplayHost.tsx',
] as const;

const LEAF_HOSTS = [
  'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx',
  ...UNDERLINE_PARENT_HOSTS,
  'src/components/receiving/workspace/line-edit/InventoryDisplayHost.tsx',
  'src/components/receiving/workspace/line-edit/TicketDisplayHost.tsx',
] as const;

describe('Station Displays nested-leaf grammar', () => {
  for (const host of LEAF_HOSTS) {
    it(`${host} never mounts a second StationDisplayLeafHeader`, () => {
      const src = read(host);
      assert.doesNotMatch(
        src,
        /StationDisplayLeafHeader/,
        `${host}: stack owns the sticky Back — leaf bodies report trail via useDisplaysLeafChrome`,
      );
      assert.doesNotMatch(src, /\bTabSwitch\b/, `${host}: no soft TabSwitch pills`);
    });
  }

  it('Inventory is secondary vertical drill — no parent TabDisplay', () => {
    const src = read(
      'src/components/receiving/workspace/line-edit/InventoryDisplayHost.tsx',
    );
    assert.match(src, /useDisplaysLeafChrome/);
    assert.doesNotMatch(
      src,
      /\bTabDisplay\b/,
      'Inventory reference sections use vertical rows, not a TabDisplay strip',
    );
    assert.match(src, /secondary Root-to-Leaf|InventorySubLeaf|SUB_LEAF_META/);
  });

  it('Photos is armed-row list + URL drill-downs — no parent TabDisplay', () => {
    const src = read(
      'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx',
    );
    assert.match(src, /PhotosActionsArmedList/);
    assert.match(
      src,
      /useDisplaysLeafChrome/,
      'Photos drills report trail so Back pops drill → Actions (Inventory twin)',
    );
    assert.doesNotMatch(
      src,
      /\bTabDisplay\b/,
      'Photos verbs are vertical armed rows, not a nested Actions·Compare·Move·Send strip',
    );
    assert.match(src, /ListingPhotoCompareHost/);
    assert.match(src, /MovePhotosBetweenPoPanel/);
    assert.match(src, /SendPhotoNotePanel/);
  });

  for (const host of UNDERLINE_PARENT_HOSTS) {
    it(`${host} has exactly one parent underline strip`, () => {
      const src = read(host);
      const matches = src.match(/appearance="underline"/g) ?? [];
      assert.equal(
        matches.length,
        1,
        `${host}: exactly one parent underline (got ${matches.length})`,
      );
    });
  }

  it('Prebox mode is child segment under Units·Prebox parent', () => {
    const src = read('src/components/receiving/PreboxWizard.tsx');
    assert.match(src, /appearance="segment"/);
    assert.doesNotMatch(
      src,
      /appearance="underline"/,
      'Prebox One master · One per unit must not be a second parent underline',
    );
  });

  it('Photos Move direction is child segment (not a second parent)', () => {
    const src = read(
      'src/components/receiving/workspace/line-edit/MovePhotosBetweenPoPanel.tsx',
    );
    assert.match(src, /appearance="segment"/);
    assert.doesNotMatch(src, /appearance="underline"/);
  });

  it('Claim New·Link is child segment', () => {
    const src = read(
      'src/components/receiving/workspace/claim/components/ClaimWizardNav.tsx',
    );
    assert.match(src, /appearance="segment"/);
    assert.match(src, /leaf-header/, 'Displays placement parks New·Link in leaf header');
    assert.match(src, /label: 'New'/);
    assert.match(src, /label: 'Link'/);
    assert.match(src, /useSegmentChords/, 'Alt+1/2 owner is the keyboard waist');
  });

  it('Displays Claim registers New·Link via leaf trailing — not a second leaf header', () => {
    const panel = read('src/components/receiving/workspace/ReceivingClaimPanel.tsx');
    const header = read('src/components/station/displays/StationDisplayLeafHeader.tsx');
    const chrome = read('src/components/station/displays/displays-leaf-chrome.tsx');
    assert.match(panel, /setLeafTrailing/);
    assert.match(panel, /placement="leaf-header"/);
    assert.match(panel, /chrome === 'modal'/);
    assert.match(chrome, /setLeafTrailing/);
    assert.match(header, /trailing/);
    assert.doesNotMatch(
      panel,
      /StationDisplayLeafHeader/,
      'Claim body must not mount a second StationDisplayLeafHeader',
    );
  });

  it('Support context perspectives use TabDisplay segment — no soft pills', () => {
    const src = read('src/components/support/context/SupportContextSegments.tsx');
    assert.match(src, /TabDisplay/);
    assert.match(src, /appearance="segment"/);
    assert.doesNotMatch(src, /rounded-full/);
    assert.doesNotMatch(src, /\bTabSwitch\b/);
  });

  it('SoT documents armed-row leaf verbs + debt allowlist', () => {
    const sot = read('.claude/rules/source-of-truth.md');
    assert.match(sot, /armed-row|armed row/i);
    assert.match(sot, /PhotosActionsArmedList|useArmedCursorList/);
    assert.match(sot, /secondary vertical|secondary drill/i);
    assert.match(sot, /appearance="segment"/);
    assert.match(
      sot,
      /Debt allowlist|underline survivors|LinkageDisplayHost/,
      'SoT must name the parent-underline debt hosts (shrink-only)',
    );
    assert.match(
      sot,
      /never both|Never both|never a nested parent|never.*parent TabDisplay/i,
    );
  });

  it('parent-underline debt allowlist is exactly Linkage · Units (shrink-only)', () => {
    assert.deepEqual(
      [...UNDERLINE_PARENT_HOSTS],
      [
        'src/components/receiving/workspace/line-edit/LinkageDisplayHost.tsx',
        'src/components/receiving/workspace/line-edit/UnitsDisplayHost.tsx',
      ],
      'Do not add Displays leaves to the underline debt list — migrate to armed rows',
    );
  });

  it('Photos nest altitude is Actions → Move · Send → Compare (bench → tools → evidence)', () => {
    const tabs = read(
      'src/components/receiving/workspace/line-edit/unbox-side-tabs.ts',
    );
    const host = read(
      'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx',
    );
    const actions = read(
      'src/components/receiving/workspace/line-edit/PhotosActionsArmedList.tsx',
    );
    assert.match(
      tabs,
      /UNBOX_PHOTO_ACTION_ORDER\s*=\s*\[[\s\S]*?'actions'[\s\S]*?'move'[\s\S]*?'send'[\s\S]*?'compare'[\s\S]*?\]/,
      'UNBOX_PHOTO_ACTION_ORDER must stay Actions · Move · Send · Compare',
    );
    assert.doesNotMatch(
      host,
      /\bTabDisplay\b/,
      'Photos no longer mounts a nested underline strip from UNBOX_PHOTO_ACTION_ORDER',
    );
    assert.match(host, /PhotosActionsArmedList/);
    const move = actions.indexOf("id: 'move'");
    const send = actions.indexOf("id: 'send'");
    const compare = actions.indexOf("id: 'compare'");
    assert.ok(
      move > 0 && send > move && compare > send,
      'armed drills Move → Send → Compare',
    );
    const sot = read('.claude/rules/source-of-truth.md');
    assert.match(sot, /Nested verb altitude/i);
    assert.match(sot, /UNBOX_PHOTO_ACTION_ORDER/);
  });
});
