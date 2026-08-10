/**
 * Source guard: the House Band-1 chrome law across every Workbench workspace
 * header (Unbox is golden; To-ship is the desk exemplar).
 *
 * Three pin scopes never share a trigger or store
 * (source-of-truth.md → Workbench Band-1 strip · Left-edge → SCOPE decides its
 * home):
 *
 *   WEBSITE-WIDE page-pin  → GlobalHeader `HeaderPinsSwitcher` (unconditional)
 *   STATION strip list-pin → leading Pin cube — earned ONLY with a closed
 *                            foreign-collection catalog (Unbox alone today)
 *   PAGE-WIDE Views        → Band 3 `WorkbenchViewsMenu` in the triage `views`
 *                            slot — never Band-1 `leading`
 *
 * This guard proves the DISPLAY method holds cohort-wide without re-porting: a
 * cohort header must not import Unbox pin machinery (honest absence — no
 * catalog), and a page-wide Views control must never lead the tab rail. Unbox
 * keeps its Pin cube leading (golden intact); To-ship's own laws stay in
 * `outbound-rail-dedup.guard.test.ts` (this guard does not weaken them).
 *
 * The cohort list mirrors `workbench-chrome-band.guard.test.ts`'s BAND_CONSUMERS
 * (each guard owns its own file list — a list is not an SoT); the lifecycle
 * vocabulary stays its own module and is never duplicated here.
 *
 * Run: node --test --import tsx \
 *        src/components/dashboard/band1-house-chrome.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

/** Raw source of a repo-relative file. */
function raw(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Unbox is the ONLY surface that legitimately mounts strip list-pin machinery. */
const UNBOX_HEADER = 'src/components/receiving/unbox/UnboxWorkspaceHeader.tsx';

/**
 * Every workspace header that composes a Band-1 strip and must obey honest
 * absence (no Pin-list, no Views on `leading`). To-ship omitted — its parity is
 * pinned by `outbound-rail-dedup.guard.test.ts`; Unbox omitted — it is the
 * golden and is asserted positively below.
 */
const COHORT_HEADERS = [
  'src/components/tech/testing/TestingWorkspaceHeader.tsx',
  'src/components/packer/PackWorkspaceHeader.tsx',
  'src/components/tech/shipping/ShippingWorkspaceHeader.tsx',
  'src/components/receiving/triage/TriageWorkspaceHeader.tsx',
  'src/components/sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx',
  'src/components/outbound/labels/LabelsWorkspaceHeader.tsx',
  'src/components/sidebar/receiving/HistoryWorkspaceHeader.tsx',
  'src/components/fba/FbaWorkspaceHeader.tsx',
  'src/components/repair/RepairWorkspaceHeader.tsx',
  'src/components/photos/PhotoLibraryScopeBand.tsx',
  'src/components/warehouse/LocationsWorkspaceHeader.tsx',
  'src/components/labels/LabelsProductsWorkspaceHeader.tsx',
] as const;

/** Strip list-pin identifiers — Unbox-only (no closed catalog anywhere else). */
const PIN_MACHINERY = [
  'UnboxAddListPopover',
  'AddListPopover',
  'PinnedExtraTabs',
  'resolveUnboxPinnedTabs',
  'useUnboxDefaultPins',
  'unboxExtraTabsAvailable',
  'UNBOX_PINNED_EXTRA_TABS_MAX',
] as const;

/** Page-wide Views control identifiers. */
const VIEWS_CONTROLS = ['WorkbenchViewsMenu', 'OutboundViewsMenu'] as const;

describe('House Band-1 chrome — strip list-pin is Unbox-only (honest absence)', () => {
  for (const rel of COHORT_HEADERS) {
    it(`${rel} imports no strip list-pin machinery`, () => {
      const src = raw(rel);
      for (const id of PIN_MACHINERY) {
        assert.ok(
          !src.includes(id),
          `${rel} must not use "${id}" — Pin-list is earned only with a closed ` +
            `foreign-collection catalog (Unbox alone today). Omit it (honest absence).`,
        );
      }
    });
  }
});

describe('House Band-1 chrome — page-wide Views never lead the tab rail', () => {
  for (const rel of COHORT_HEADERS) {
    it(`${rel} keeps Views off Band-1 leading (Band 3 only)`, () => {
      const src = raw(rel);
      for (const control of VIEWS_CONTROLS) {
        // Bounded to a single prop value: `leading={ ... <control` with no `}`
        // between. A Views control inside a leading prop falsely promotes an
        // inner refinement to an outer scope beside lifecycle tabs.
        const bad = new RegExp(`leading=\\{[^}]*?${control}`);
        assert.ok(
          !bad.test(src),
          `${rel} must not mount ${control} in a Band-1 \`leading\` prop — ` +
            `page-wide Views live on Band 3 (triage \`views\` slot).`,
        );
      }
    });

    it(`${rel} — any Views control it uses sits in a Band-3 \`views\` slot`, () => {
      const src = raw(rel);
      for (const control of VIEWS_CONTROLS) {
        if (!src.includes(control)) continue; // honest absence — no Views here
        assert.match(
          src,
          new RegExp(`views=\\{[\\s\\S]*?${control}`),
          `${rel} imports ${control} but does not mount it in a \`views={…}\` ` +
            `slot — the page-wide Views control belongs on Band 3 trailing find.`,
        );
      }
    });
  }
});

describe('House Band-1 chrome — Unbox golden stays intact', () => {
  const unbox = raw(UNBOX_HEADER);

  it('Unbox leads Band-1 with the strip list-pin cube (the golden)', () => {
    assert.match(
      unbox,
      /leading=\{[\s\S]*?UnboxAddListPopover/,
      'Unbox must keep UnboxAddListPopover in the WorkbenchChromeHeader `leading` slot',
    );
    // Real closed-catalog machinery — proves the Unbox-only exemption above is
    // not vacuous.
    assert.ok(unbox.includes('resolveUnboxPinnedTabs'));
    assert.ok(unbox.includes('unboxPinnedExtraTabs'));
  });

  it('Unbox mounts its page-wide Views on Band 3, not Band-1 leading', () => {
    assert.match(unbox, /views=\{[\s\S]*?WorkbenchViewsMenu/);
    assert.ok(
      !/leading=\{[^}]*?WorkbenchViewsMenu/.test(unbox),
      'even the golden keeps Views off Band-1 leading',
    );
  });
});
