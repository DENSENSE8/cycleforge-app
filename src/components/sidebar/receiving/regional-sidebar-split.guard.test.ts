/**
 * Guard — Regional sidebar split (scan periphery ≠ Workbench saved views).
 *
 * Directive: `docs/todo/regional-sidebar-split-HANDOFF.md` + harden §1.1/§1.3.
 * SoT: `.claude/rules/display/workbench-ops-queue.md` → Tabs vs saved views;
 * `source-of-truth.md` → Band-3 Views (inner refinement).
 *
 * The two receiving operator jobs must stay physically separate so muscle memory
 * holds:
 *   - `/incoming` (Workbench ops-queue) — Band-3 **Views ▾** hosts durable
 *     saved views (operator-named facet combinations over the POS collection).
 *   - `/unbox` scan station (Station, act-and-clear) — the periphery is MRU /
 *     recent scan history / scan bar. It hosts **no** saved-views control.
 *
 * Guard pins:
 *   1. Incoming Band 3 mounts `WorkbenchViewsMenu` wired to `receiving_incoming`.
 *   2. Incoming left rail does NOT remount SavedViewsList (Band 3 is the locus).
 *   3. Scan-station shared panel + recents rail body mount NO SavedViewsList.
 *   4. Facet-apply never mutates a `tableId`.
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
  it('Incoming Band 3 mounts WorkbenchViewsMenu wired to the receiving_incoming SoT', () => {
    const header = read('src/components/sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx');
    assert.match(header, /WorkbenchViewsMenu/, 'IncomingWorkspaceHeader must compose WorkbenchViewsMenu');
    assert.match(header, /storageKey=\{SAVED_VIEW_STORAGE_KEY\.receiving_incoming\}/);
    assert.match(header, /paramKeys=\{SAVED_VIEW_PARAM_KEYS\.receiving_incoming\}/);
    assert.match(header, /views=\{/, 'Views must use the WorkbenchTriageBand `views` slot');
  });

  it('Incoming left rail does not remount SavedViewsList (Band 3 is the locus)', () => {
    const panel = read('src/components/sidebar/receiving/IncomingSidebarPanel.tsx');
    assert.doesNotMatch(
      panel,
      /SavedViewsList/,
      'IncomingSidebarPanel must not host SavedViewsList — that is Band-3 Views ▾',
    );
  });

  it('the scan-station shared panel mounts NO SavedViewsList (saved views are Workbench-only)', () => {
    const shared = read('src/components/sidebar/ReceivingSidebarPanel.tsx');
    assert.doesNotMatch(
      shared,
      /SavedViewsList/,
      'the shared receiving panel must never mount saved views in the scan branch',
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
    assert.ok(
      !SAVED_VIEW_PARAM_KEYS.receiving_incoming.includes('tableId'),
      'receiving_incoming saved-view params must not include tableId',
    );
    const hook = read('src/hooks/useSavedViews.ts');
    assert.doesNotMatch(
      hook,
      /tableId/,
      'useSavedViews must apply views by writing URL params, never by mutating a tableId',
    );
  });
});
