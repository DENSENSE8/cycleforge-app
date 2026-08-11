/**
 * Source guard: the To-ship / Outbound **left Focus rail never restates a
 * lifecycle tab or a KPI attention tile.**
 *
 * The rail (`OutboundSidebarFilterMap` → UnshippedSegments) once carried
 * All / Urgent / Pending / Tested / Out-of-stock rows that duplicated the
 * Band-1 tabs and the Band-2 `OutboundKpiStrip` (report P1/P5/P8 — single
 * primary nav for stage · metrics are not a third nav · one count, one home).
 * Deleting the rows once did not stop them returning, so ownership now lives in
 * ONE declaration — `OUTBOUND_FACET_OWNER` (`outbound-sidebar-shared.ts`) — and
 * this guard proves the rail draws only from it.
 *
 * It reads the lifecycle SoT directly (`FULFILLMENT_STATE_META`,
 * `DASHBOARD_ORDER_VIEW_LABEL`), so a NEW lane or view cannot ship unclassified,
 * and cannot be classified as a Focus-rail facet.
 *
 * It also pins the working rail clean of the two misplaced cards
 * (`ThroughputRoiCard` — report P6 monitor-in-triage; `GettingStartedChecklist`
 * — report P10 onboarding-is-not-nav).
 *
 * Band-1 strip list-pin (2026-08-09): To-ship omits Pin-list until a closed
 * outbound foreign-collection catalog exists — no `UnboxAddListPopover`, no
 * `leading=`, no Unbox receiving embed. Views stay Band 3; page-pin stays
 * GlobalHeader. SoT: Workbench Band-1 strip.
 *
 * Run: node --test --import tsx \
 *        src/components/unshipped/outbound-rail-dedup.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  OUTBOUND_FACET_OWNER,
  RAIL_OWNED_SEGMENT_IDS,
  type OutboundFacetId,
} from '@/components/unshipped/outbound-sidebar-shared';
import { FULFILLMENT_STATE_META } from '@/lib/unshipped-state';
import { DASHBOARD_ORDER_VIEW_LABEL } from '@/utils/dashboard-search-state';
import { isRaillessOrderFeedSurface } from '@/lib/sidebar-navigation';

const ROOT = process.cwd();

/** Comment-stripped source of a repo-relative file. */
function code(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('outbound Focus rail does not duplicate tabs / KPI (report P1/P5/P8)', () => {
  it('every fulfillment lane is classified, and none is a Focus-rail facet', () => {
    for (const lane of Object.keys(FULFILLMENT_STATE_META)) {
      const owner = OUTBOUND_FACET_OWNER[lane as OutboundFacetId];
      assert.ok(
        owner,
        `fulfillment lane "${lane}" must be classified in OUTBOUND_FACET_OWNER (tabs | kpi)`,
      );
      assert.notEqual(
        owner,
        'rail',
        `fulfillment lane "${lane}" is a Band-1 tab / Band-2 KPI facet — it must never own a Focus rail row`,
      );
    }
  });

  it('every lifecycle order view is owned by the Band-1 tabs', () => {
    for (const view of Object.keys(DASHBOARD_ORDER_VIEW_LABEL)) {
      assert.equal(
        OUTBOUND_FACET_OWNER[view as OutboundFacetId],
        'tabs',
        `lifecycle view "${view}" must be owned by the tab band, not the rail`,
      );
    }
  });

  it('the KPI attention facets are owned by the KPI strip, not the rail', () => {
    assert.equal(OUTBOUND_FACET_OWNER.attention, 'kpi'); // Urgent
    assert.equal(OUTBOUND_FACET_OWNER.BLOCKED, 'kpi'); // Out of stock
  });

  it('the rail owns exactly the personal-scope facet', () => {
    assert.deepEqual([...RAIL_OWNED_SEGMENT_IDS], ['mine']);
    for (const id of RAIL_OWNED_SEGMENT_IDS) {
      assert.equal(OUTBOUND_FACET_OWNER[id], 'rail');
    }
  });

  it('the rail source builds no lifecycle rows', () => {
    const src = code('src/components/unshipped/OutboundSidebarFilterMap.tsx');
    // The ONLY reason the rail imported the lifecycle vocabulary was to render
    // Pending/Tested/Out-of-stock Focus rows. Its absence is the dedup, proven.
    assert.ok(
      !src.includes('FULFILLMENT_STATE_META'),
      'OutboundSidebarFilterMap must not build Focus rows from FULFILLMENT_STATE_META',
    );
    assert.ok(
      !src.includes('fulfillmentCountsFromCombos'),
      'OutboundSidebarFilterMap must not tally lifecycle lanes for Focus rows',
    );
    for (const lane of ["'PENDING'", "'TESTED'", "'BLOCKED'"]) {
      assert.ok(
        !src.includes(lane),
        `OutboundSidebarFilterMap must not render a ${lane} Focus row (it is a tab / KPI facet)`,
      );
    }
  });
});

describe('the To-ship order feed runs rail-less (Pattern E — report D9/D10)', () => {
  it('the dedicated desk + dashboard outbound domain + Inbound desk reserve no left column', () => {
    assert.equal(isRaillessOrderFeedSurface('/shipping/orders', false), true);
    assert.equal(isRaillessOrderFeedSurface('/shipping/orders/anything', false), true);
    // /dashboard is param-aware: only the outbound domain goes rail-less.
    assert.equal(isRaillessOrderFeedSurface('/dashboard', true), true);
    assert.equal(isRaillessOrderFeedSurface('/dashboard', false), false);
    // Inbound desk — ops-queue Pattern E (POS / Email / Removed are chrome facets).
    assert.equal(isRaillessOrderFeedSurface('/incoming', false), true);
    assert.equal(isRaillessOrderFeedSurface('/incoming/anything', false), true);
  });

  it('other outbound station modes keep their rails (Labels / Scan-out / FBA)', () => {
    assert.equal(isRaillessOrderFeedSurface('/shipping/labels', false), false);
    assert.equal(isRaillessOrderFeedSurface('/shipping/scan-out', false), false);
    assert.equal(isRaillessOrderFeedSurface('/shipping/fba', false), false);
    assert.equal(isRaillessOrderFeedSurface(null, false), false);
  });

  it('the frame honors the predicate', () => {
    // ContextPanelLayout must subtract the rail-less predicate from hasPanel, or
    // the column would still reserve reclaimed table width.
    const frame = code('src/components/sidebar/ContextPanelLayout.tsx');
    assert.ok(
      frame.includes('useIsRaillessOrderFeed'),
      'ContextPanelLayout must compose useIsRaillessOrderFeed into hasPanel',
    );
  });

  it('website-wide pin and page-wide saved views are TWO SEPARATE controls (ruled 2026-08-09, corrected same day)', () => {
    // WEBSITE-WIDE (HeaderPinsSwitcher, GlobalHeader): pins a whole PAGE for
    // cross-app jump. Untouched by the rail-less desk — never suppressed,
    // never relocated, never grows a second dropdown tab for anything
    // page-scoped. It is the same control, in the same place, on every route.
    const globalHeader = code('src/components/layout/GlobalHeader.tsx');
    assert.ok(
      !globalHeader.includes('useIsRaillessOrderFeed') && !globalHeader.includes('raillessOrderFeed'),
      'GlobalHeader must not gate HeaderPinsSwitcher on the rail-less desk — the website-wide pin renders unconditionally on every route',
    );
    assert.match(
      globalHeader,
      /<HeaderPinsSwitcher\s*\/>/,
      'GlobalHeader must render HeaderPinsSwitcher unconditionally',
    );
    const pins = code('src/components/layout/HeaderPinsSwitcher.tsx');
    assert.ok(
      !pins.includes('SavedViewsList') && !pins.includes('useSavedViews') && !pins.includes('role="tab"'),
      'HeaderPinsSwitcher must stay page-pin-only — never grow a Saved views tab (that is a different SCOPE, not a second facet of the same control)',
    );

    // PAGE-WIDE (OutboundViewsMenu → WorkbenchViewsMenu on Band 3 trailing
    // find): named filter combination on THIS surface's params. Labeled
    // Views ▾ — never Band-1 leading beside lifecycle tabs, never the pin.
    const header = code('src/components/dashboard/OutboundWorkspaceHeader.tsx');
    assert.ok(
      !/leading=\{\s*<OutboundViewsMenu/.test(header),
      'Views must not lead the tab rail (Band-1) — that falsely promotes an inner refinement to an outer scope',
    );
    const triageFn = header.slice(header.indexOf('export function OutboundTriageBand'));
    assert.match(
      triageFn,
      /views=\{\s*<OutboundViewsMenu/,
      'the page-wide Views control must sit on Band 3 trailing find (OutboundTriageBand `views` slot)',
    );
    const views = code('src/components/dashboard/OutboundViewsMenu.tsx');
    assert.ok(
      views.includes('WorkbenchViewsMenu') && views.includes('outboundSavedViewsConfig'),
      'OutboundViewsMenu must adapt WorkbenchViewsMenu over outboundSavedViewsConfig',
    );
    const menu = code('src/components/saved-views/WorkbenchViewsMenu.tsx');
    assert.ok(
      !menu.includes('HeaderPinsSwitcher') && !menu.includes('useQuickAccess'),
      'WorkbenchViewsMenu must not reuse HeaderPinsSwitcher / useQuickAccess — page-wide saved views and website-wide page-pins are different scopes with different stores',
    );
  });

  it('To-ship Band-1 omits strip list-pin (honest absence — no closed outbound catalog)', () => {
    // House Band-1 law: system tabs fixed; Pin-list earned only with a closed
    // foreign-collection catalog. To-ship has none yet — never import Unbox
    // pin machinery or invent a leading Pin cube. Unbox receiving must not
    // mount under /shipping/orders. SoT: Workbench Band-1 strip.
    const header = code('src/components/dashboard/OutboundWorkspaceHeader.tsx');
    const band1Fn = header.slice(
      header.indexOf('export function OutboundWorkspaceHeader'),
      header.indexOf('export function OutboundTriageBand'),
    );
    assert.ok(
      !band1Fn.includes('UnboxAddListPopover') &&
        !band1Fn.includes('unboxPinnedExtraTabs') &&
        !band1Fn.includes('useUnboxDefaultPins') &&
        !band1Fn.includes('resolveUnboxPinnedTabs') &&
        !band1Fn.includes('toShipPinnedExtraTabs') &&
        !band1Fn.includes('ToShipAddListPopover'),
      'OutboundWorkspaceHeader Band-1 must not mount strip list-pin / Unbox pin prefs until an outbound closed catalog is approved',
    );
    assert.ok(
      !/leading=\{/.test(band1Fn),
      'OutboundWorkspaceHeader Band-1 must not pass WorkbenchChromeHeader `leading` (Pin-list / Views both banned there)',
    );

    const desk = code('src/components/dashboard/DashboardOrdersView.tsx');
    assert.ok(
      !desk.includes('UnboxWorkspaceHeader') &&
        !desk.includes('UnboxAddListPopover') &&
        !desk.includes('LineEditPanel') &&
        !desk.includes('unboxPinnedExtraTabs'),
      'DashboardOrdersView must not embed Unbox receiving / Pin-list under the To-ship desk',
    );
  });
});

describe('the working triage rail carries no monitor rollup / onboarding card', () => {
  it('UnshippedSidebar mounts neither ThroughputRoiCard (P6) nor GettingStartedChecklist (P10)', () => {
    const src = code('src/components/unshipped/UnshippedSidebar.tsx');
    assert.ok(
      !src.includes('ThroughputRoiCard'),
      'ThroughputRoiCard is a monitor rollup — it belongs on Operations analytics / the Band-2 KPI strip, not the triage rail',
    );
    assert.ok(
      !src.includes('GettingStartedChecklist'),
      'GettingStartedChecklist is onboarding — it belongs on Home → Today, not the triage rail',
    );
  });
});
