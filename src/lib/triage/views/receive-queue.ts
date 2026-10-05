/**
 * Unbox › Queue and Recent — `receive.queue`. The cartons the door scanned and
 * matched (Queue, server priority order) and the lines this operator opened
 * (Recent), one card per carton. Opening a card loads the carton into the
 * Unbox line workspace; the scan bar's `?recvId=` / `?lineId=` deep link opens
 * the same way. `/unbox` is the `receive` station page: its Queue · Recent ·
 * History strip is `?unboxview=`, not a nav view, so this view is not keyed in
 * `TRIAGE_VIEWS` (same as `repair.queue`, `pickup.history`).
 */

import { triageView } from '@/design-system/components/triage-card-list/triage-view';
import { UNBOX_KPI_FILTER_PARAM } from '@/lib/receiving/unbox-metrics';
import { DOCKED_NEXT_STEPS } from '@/lib/receiving/docked-record-state';

export const RECEIVE_QUEUE_VIEW = triageView({
  id: 'receive.queue',
  grain: 'carton',
  noun: { one: 'carton', many: 'cartons' },
  listLabel: 'Unbox cartons',
  testIdPrefix: 'unbox-card',
  bodyTestId: 'unbox-cards',
  storageKeys: { pageMode: 'cf:unbox-cards:scroll', scrollTop: 'cf:unbox-cards:scroll-top' },
  recordParams: ['recvId', 'lineId'],
  // The KPI cut (`?ukpi=`, one at a time, the sidebar's KPI facet): the host filters the rows it loads.
  chips: { owner: 'host', param: UNBOX_KPI_FILTER_PARAM },
  paging: 'client',
  // The carton's workflow state is the rail; the unboxer, once there is one, is the far-right fact.
  status: 'none',
  facts: [
    { id: 'qty', tier: 'always' },
    { id: 'condition', tier: 'always' },
    { id: 'sku', tier: 'label' },
    { id: 'bin', tier: 'always' },
    { id: 'price', tier: 'always' },
  ],
  slots: {
    identity: 'purchase order number, else carton number',
    channel: 'brand',
    person: 'vendor',
    quickLook: 'peek',
    photo: 'line',
  },
  // Queue keeps the server's priority order and Recent its recency: no day bands.
  sections: null,
  next: [...DOCKED_NEXT_STEPS],
});
