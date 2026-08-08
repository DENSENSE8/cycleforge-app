/**
 * Guard — Regional sidebar split (scan periphery ≠ Workbench saved-views rail).
 *
 * Directive: `docs/todo/regional-sidebar-split-HANDOFF.md` + harden §1.1/§1.3.
 * SoT: `.claude/rules/display/workbench-ops-queue.md` → Tabs vs saved views;
 * `source-of-truth.md` → Frame column budget / Right-rail modality.
 *
 * The two receiving operator jobs must stay physically separate so muscle memory
 * holds:
 *   - `/incoming` (Workbench ops-queue) — the LEFT rail hosts durable **Saved
 *     Views** (operator-named facet combinations over one collection).
 *   - `/unbox` scan station (Station, act-and-clear) — the periphery is MRU /
 *     recent scan history / scan bar. It hosts **no** saved-views rail.
 *
 * Both routes dispatch to `ReceivingSidebarPanel` (route key `receiving`), which
 * mode-switches: `incoming` → `IncomingSidebarPanel` (Workbench rail); the scan
 * surfaces (`receive` / `triage`) → scan bands + the recents rail body. This
 * guard pins that boundary in source, plus the two invariants that keep the
 * saved-views apply a pure URL-param facet change:
 *   1. `/incoming` mounts `SavedViewsList` wired to the `receiving_incoming` SoT.
 *   2. The scan-station shared panel + recents rail body mount NO `SavedViewsList`.
 *   3. Facet-apply never mutates a `tableId` (the per-staff prefs bucket) — the
 *      view params carry no `tableId`, and `useSavedViews` never names one.
 *
 * Run: `tsx --test src/components/sidebar/receiving/regional-sidebar-split.guard.test.ts`
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { SAVED_VIEW_PARAM_KEYS } from '@/lib/station/table-url-params';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('Regional sidebar split — scan periphery vs Workbench saved views', () => {
  it('the /incoming Workbench rail mounts SavedViewsList wired to the receiving_incoming SoT', () => {
    const panel = read('src/components/sidebar/receiving/IncomingSidebarPanel.tsx');
    assert.match(panel, /import \{ SavedViewsList \}/, 'IncomingSidebarPanel must compose SavedViewsList');
    assert.match(panel, /<SavedViewsList/, 'IncomingSidebarPanel must mount SavedViewsList');
    // Composes the SoT constants — never a page-local param array (that would
    // drift from `route-params.ts` hygiene and the `saved_views` surface).
    assert.match(panel, /storageKey=\{SAVED_VIEW_STORAGE_KEY\.receiving_incoming\}/);
    assert.match(panel, /paramKeys=\{SAVED_VIEW_PARAM_KEYS\.receiving_incoming\}/);
  });

  it('the scan-station shared panel mounts NO SavedViewsList (saved views are Workbench-only)', () => {
    const shared = read('src/components/sidebar/ReceivingSidebarPanel.tsx');
    assert.doesNotMatch(
      shared,
      /SavedViewsList/,
      'the shared receiving panel must delegate saved views to IncomingSidebarPanel, never mount them in the scan branch',
    );
  });

  it('the scan-surface recents rail body mounts NO SavedViewsList', () => {
    const railBody = read('src/components/sidebar/receiving/ReceivingRailBody.tsx');
    assert.doesNotMatch(
      railBody,
      /SavedViewsList/,
      'the scan periphery (MRU / recents) must never host a saved-views rail',
    );
  });

  it('applying an incoming saved view never mutates a tableId (facets are URL params only)', () => {
    // The view definition carries no prefs-bucket key…
    assert.ok(
      !SAVED_VIEW_PARAM_KEYS.receiving_incoming.includes('tableId'),
      'receiving_incoming saved-view params must not include tableId',
    );
    // …and the ONE apply path cannot touch one either (it only writes the URL).
    const hook = read('src/hooks/useSavedViews.ts');
    assert.doesNotMatch(
      hook,
      /tableId/,
      'useSavedViews must apply views by writing URL params, never by mutating a tableId',
    );
  });
});
