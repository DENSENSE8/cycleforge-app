/**
 * Inventory › QC labels — the one-row density (`TriageCardList
 * density="row"`, owner 2026-09-28). Goal: find a unit's printed sticker and
 * where it is in the outbound loop. One row per labelled serial unit: state
 * (`QC_LABEL_LIFECYCLE`) → unit id → title → SN · SKU · order · reprints →
 * "→ Pick" / "→ Pack". No chips: the view (`?view=`) and Find (`?q=`) are the
 * sidebar's, narrowed on the server.
 *
 * Not in `TRIAGE_VIEWS`: `qc-labels` is a page with no nav views (its
 * `?view=` ladder is a server scope), so there is no `page.view` id to check.
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';

export const QC_LABELS_VIEW: TriageViewDecl = {
  id: 'qc-labels.list',
  grain: 'QC label',
  noun: { one: 'label', many: 'labels' },
  listLabel: 'QC labels',
  testIdPrefix: 'qc-label-row',
  bodyTestId: 'qc-label-rows',
  storageKeys: { pageMode: 'cf:qc-label-rows:page-mode', scrollTop: 'cf:qc-label-rows:scroll-top' },
  recordParams: ['open'],
  chips: { owner: 'face', param: 'cardStatus' },
  paging: 'client',
  status: 'state',
  facts: [
    { id: 'serial', tier: 'always' },
    { id: 'sku', tier: 'always' },
    { id: 'order', tier: 'always' },
    { id: 'prints', tier: 'always' },
  ],
  sections: null,
  next: ['Pick', 'Pack'],
};
