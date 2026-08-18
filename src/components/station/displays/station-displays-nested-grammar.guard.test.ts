/**
 * Station Displays nested-leaf grammar (locked 2026-08-08; armed-row verbs).
 *
 * Root Index = the only subject lateral layer. Inside a leaf:
 *   - **Preferred:** armed-row verb list + stack chrome (Photos · Linkage ·
 *     Units · Inventory) — trail via `useDisplaysLeafChrome`; never a parent
 *     TabDisplay strip or a hand-rolled sub-index.
 * Never a second `StationDisplayLeafHeader`.
 * Child perspectives **inside a tool** use `appearance="segment"` (Claim New·Link ·
 * Move To·From · Prebox mode · Support Team·Activity) — never soft `TabSwitch` /
 * `rounded-full` pills.
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

/** Armed-row + parent-chrome drill leaves (no parent underline). */
const ARMED_VERB_HOSTS = [
  'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx',
  'src/components/receiving/workspace/line-edit/LinkageDisplayHost.tsx',
  'src/components/receiving/workspace/line-edit/UnitsDisplayHost.tsx',
  'src/components/receiving/workspace/line-edit/InventoryDisplayHost.tsx',
] as const;

const LEAF_HOSTS = [
  ...ARMED_VERB_HOSTS,
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

  it('Inventory is armed-row secondary drill — parent chrome owns ← → Esc', () => {
    const src = read(
      'src/components/receiving/workspace/line-edit/InventoryDisplayHost.tsx',
    );
    assert.match(src, /useDisplaysLeafChrome/);
    assert.match(
      src,
      /StationArmedVerbList/,
      'Inventory sub-index is StationArmedVerbList (Photos/Linkage twin)',
    );
    assert.match(src, /setTrail|setOnNestedPop|setOnNestedRestore/);
    assert.doesNotMatch(
      src,
      /\bTabDisplay\b/,
      'Inventory reference sections use armed rows, not a TabDisplay strip',
    );
    assert.doesNotMatch(
      src,
      /StationDisplayLeafHeader/,
      'No nested LeafHeader — stack paints Back from trail',
    );
    assert.match(src, /secondary Root-to-Leaf|InventorySubLeaf|SUB_LEAF_META/);
  });

  for (const host of ARMED_VERB_HOSTS) {
    it(`${host} is armed-row list + URL drills — no parent TabDisplay`, () => {
      const src = read(host);
      assert.match(
        src,
        /StationArmedVerbList|PhotosActionsArmedList/,
        `${host}: must compose an armed verb list`,
      );
      assert.match(
        src,
        /useDisplaysLeafChrome/,
        `${host}: drills report trail so Back pops drill → Actions`,
      );
      assert.doesNotMatch(
        src,
        /\bTabDisplay\b/,
        `${host}: verbs are vertical armed rows, not a nested underline strip`,
      );
      assert.doesNotMatch(
        src,
        /appearance="underline"/,
        `${host}: parent underline debt is retired`,
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

  it('SoT documents armed-row leaf verbs (no underline debt allowlist)', () => {
    const sot = read('.claude/rules/source-of-truth.md');
    assert.match(sot, /armed-row|armed row/i);
    assert.match(sot, /PhotosActionsArmedList|useArmedCursorList|StationArmedVerbList/);
    assert.match(sot, /secondary vertical|secondary drill/i);
    assert.match(sot, /appearance="segment"/);
    assert.doesNotMatch(
      sot,
      /Debt allowlist[\s\S]{0,80}LinkageDisplayHost/,
      'Linkage · Units underline debt allowlist must be gone from SoT',
    );
  });
});
