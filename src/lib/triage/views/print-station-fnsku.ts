/**
 * Print station › FNSKU labels — find a label, print it (owner 2026-10-04).
 * One record per catalog FNSKU, read in the station's order: the FNSKU (last
 * 8 — the `X00` lead repeats on almost every label), title, condition, then
 * ASIN · SKU at the right. Compact (one line) is the default; Full puts ASIN
 * · SKU at the right of the top row. No print state, no next step, no
 * channel, no photo: every card is an Amazon FBA label whose one verb is
 * Print (the open record), and the FBA catalog carries no `sku_catalog` link
 * to read a photo from.
 *
 * Not in `TRIAGE_VIEWS`, like QC labels: the page's one nav view is not a
 * server scope, so there is no `page.view` id to check against.
 */

import { triageView } from '@/design-system/components/triage-card-list/triage-view';
import { PRINT_STATION_FNSKU_PARAM } from '@/lib/print-station/fnsku';

export const PRINT_STATION_FNSKU_VIEW = triageView({
  id: 'print-station.fnsku',
  grain: 'FNSKU',
  noun: { one: 'FNSKU', many: 'FNSKUs' },
  listLabel: 'FNSKU labels',
  testIdPrefix: 'fnsku-print-row',
  bodyTestId: 'fnsku-print-rows',
  storageKeys: { pageMode: 'cf:fnsku-print-rows:page-mode', scrollTop: 'cf:fnsku-print-rows:scroll-top' },
  recordParams: [PRINT_STATION_FNSKU_PARAM],
  chips: { owner: 'face', param: 'cardStatus' },
  paging: 'client',
  status: 'none',
  slots: { identity: 'FNSKU · ASIN · SKU', channel: 'none', person: 'none', quickLook: 'none', photo: 'none' },
  facts: [{ id: 'condition', tier: 'always' }],
  sections: null,
  next: [],
});
