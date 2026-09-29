/**
 * Print station › FNSKU labels — three-row triage cards. One card per catalog
 * FNSKU: FBA identity → title · condition → “Print”. Find narrows on the server.
 *
 * Not in `TRIAGE_VIEWS`, like QC labels: the page's one nav view is not a
 * server scope, so there is no `page.view` id to check against.
 */

import type { TriageViewDecl } from '@/design-system/components/triage-card-list/triage-view';
import { PRINT_STATION_FNSKU_PARAM } from '@/lib/print-station/fnsku';

export const PRINT_STATION_FNSKU_VIEW: TriageViewDecl = {
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
  facts: [{ id: 'condition', tier: 'always' }],
  sections: null,
  next: ['Print'],
};
