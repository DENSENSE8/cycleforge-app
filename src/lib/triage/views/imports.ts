/**
 * Operations › Imports — `imports.runs` and `imports.rows` (the import record,
 * `/operations/imports`). Goal: see at a glance what each import brought in.
 *
 * Runs: one card per run — line 1 reads `Run N` → trigger → the sources that
 * ran; the title is the totals sentence; the top-right is the run's status
 * face; bottom-right "→ Review N" while the run parked orders. Status chips
 * write the sidebar's `?status=` facet (the server narrows; the facet counts
 * are the chips' counts).
 *
 * Orders (`?view=rows`): one card per order a run touched — order number →
 * channel → source; the title is the SKU identity title; the facts are
 * tracking and where in the source it came from; the top-right is the
 * outcome face. Outcome chips write the sidebar's `?outcome=` facet (the
 * server narrows; the facet counts are the chips' counts).
 *
 * Sections are PT days under the default (newest) sort — dynamic bands, so the
 * host labels them (`sections: null` here; see `importDaySection`).
 */

import { triageView } from '@/design-system/components/triage-card-list/triage-view';

export const IMPORT_RUNS_VIEW = triageView({
  id: 'imports.runs',
  grain: 'import run',
  noun: { one: 'run', many: 'runs' },
  listLabel: 'Import runs',
  testIdPrefix: 'import-run-card',
  bodyTestId: 'import-run-cards',
  storageKeys: { pageMode: 'cf:import-run-cards:page-mode', scrollTop: 'cf:import-run-cards:scroll-top' },
  recordParams: ['run'],
  chips: { owner: 'host', param: 'status' },
  paging: 'client',
  status: 'state',
  slots: { identity: 'run number · trigger', channel: 'brand', person: 'none', quickLook: 'peek', photo: 'none' },
  facts: [{ id: 'error', tier: 'always' }],
  sections: null,
  next: ['Review'],
});

export const IMPORT_ROWS_VIEW = triageView({
  id: 'imports.rows',
  grain: 'imported order',
  noun: { one: 'order', many: 'orders' },
  listLabel: 'Imported orders',
  testIdPrefix: 'import-row-card',
  bodyTestId: 'import-row-cards',
  storageKeys: { pageMode: 'cf:import-row-cards:page-mode', scrollTop: 'cf:import-row-cards:scroll-top' },
  recordParams: ['row'],
  chips: { owner: 'host', param: 'outcome' },
  paging: 'client',
  status: 'state',
  slots: { identity: 'order number', channel: 'brand', person: 'source', quickLook: 'peek', photo: 'none' },
  facts: [
    { id: 'tracking', tier: 'always' },
    { id: 'locator', tier: 'always' },
    { id: 'reason', tier: 'always' },
  ],
  sections: null,
  next: [],
});
