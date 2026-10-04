/**
 * Print station › FNSKU labels — triage cards. One card per catalog FNSKU:
 * the FNSKU → title · ASIN · condition (when set); the top-right is its print
 * state here (Printed / Not printed, the last print on hover). Find narrows on
 * the server.
 *
 * Every card is an Amazon FBA FNSKU whose one verb is Print, so the view
 * declares no channel, no next step and no photo (the FBA catalog carries no
 * `sku_catalog` link to read one from): a slot every card paints the same is noise.
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
  status: 'state',
  slots: { identity: 'FNSKU', channel: 'none', person: 'none', quickLook: 'none', photo: 'none' },
  facts: [
    { id: 'asin', tier: 'always' },
    { id: 'condition', tier: 'always' },
  ],
  sections: null,
  next: [],
});
