/**
 * Shipping › Labels & docs — two saved views: `label-intake.uploads` (the
 * bare route, named **Bulk**: one row per uploaded PDF, a file explorer —
 * `FilesDesk`) and `label-intake.orders` (`?view=orders`, named **Orders**:
 * one row per ORDER shaped as the slots that ship with it — `OrdersDesk`).
 * Print history remains on each file and document; it is not a third saved
 * view.
 */

import { triageView } from '@/design-system/components/triage-card-list/triage-view';
import { ORDER_PACKET_STATUS_PARAM } from '@/lib/label-prints/order-packet-contracts';
import { PRINT_FILE_STATUS_PARAM } from '@/lib/label-prints/print-file-contracts';

/** The desk's views, bare route first (`?view=`; `uploads` also rides the bare URL). */
export const LABEL_INTAKE_VIEWS = ['uploads', 'orders'] as const;
export type LabelIntakeView = (typeof LABEL_INTAKE_VIEWS)[number];

/** `?view=` → the view; anything else is the bare route (Bulk). */
export function parseLabelIntakeView(raw: string | null | undefined): LabelIntakeView {
  return raw === 'orders' ? 'orders' : 'uploads';
}

/**
 * Bulk — one compact row per uploaded PDF (`PrintFileList`, `TriageRow`):
 * uploaded time · Printed badge (Printed / Printed x/y / none) · PDF icon +
 * file name, then pages, uploader and last print as the row's width allows.
 * Day headers follow the sidebar's Sort (upload day, or last-printed day with
 * never-printed files last) — dated, so the list labels them itself. Print
 * status, Sort, Find and both date windows are the sidebar's (`?printing=` ·
 * `?sort=` · `?q=` · `?from=`/`?to=` · `?printedFrom=`/`?printedTo=`),
 * narrowed on the server. Nothing opens as a record: a row click previews the
 * file in the dock's pane.
 */
export const LABEL_INTAKE_UPLOADS_VIEW = triageView({
  id: 'label-intake.uploads',
  grain: 'file',
  noun: { one: 'file', many: 'files' },
  listLabel: 'Bulk',
  testIdPrefix: 'print-file-row',
  bodyTestId: 'print-file-rows',
  storageKeys: { pageMode: 'cf:print-file-rows:scroll', scrollTop: 'cf:print-file-rows:scroll-top' },
  recordParams: [],
  // The status is the sidebar's single choice (`?printing=`), answered by the server — the face never cuts it.
  chips: { owner: 'host', param: PRINT_FILE_STATUS_PARAM },
  paging: 'server',
  status: 'state',
  slots: { identity: 'uploaded time', channel: 'none', person: 'none', quickLook: 'none', photo: 'none' },
  // Most-needed first; the row discloses them by its own width (`@container/row`).
  facts: [
    { id: 'pages', tier: 'always' },
    { id: 'uploaded-by', tier: 'label' },
    { id: 'printed', tier: 'detail' },
  ],
  sections: null,
  next: [],
});

/**
 * Orders — one compact row per order (`OrderPacketList`, `TriageRow`): state
 * badge (Missing / Ready / Printed) · platform mark + order number (last 8) ·
 * the slot strip (Shipping label · Packing slip · Product paperwork), then
 * gaps, ship-by and Printed ×N. The chevron (→ / ←) folds the order's lines
 * under the row; the open order is reviewed in the dock's pane, never a
 * record. Status, Missing slot, Channel, Sort and Find are the sidebar's
 * (`?status=` · `?gap=` · `?channel=` · `?sort=` · `?q=`), narrowed on the server.
 */
export const LABEL_INTAKE_ORDERS_VIEW = triageView({
  id: 'label-intake.orders',
  grain: 'order',
  noun: { one: 'order', many: 'orders' },
  listLabel: 'Orders',
  testIdPrefix: 'order-packet-row',
  bodyTestId: 'order-packet-rows',
  storageKeys: { pageMode: 'cf:order-packet-rows:scroll', scrollTop: 'cf:order-packet-rows:scroll-top' },
  recordParams: [],
  // The status is the sidebar's single choice (`?status=`), answered by the server — the face never cuts it.
  chips: { owner: 'host', param: ORDER_PACKET_STATUS_PARAM },
  paging: 'server',
  status: 'state',
  slots: { identity: 'platform mark + order number', channel: 'none', person: 'none', quickLook: 'none', photo: 'none' },
  facts: [
    { id: 'gaps', tier: 'always' },
    { id: 'ship-by', tier: 'label' },
    { id: 'printed', tier: 'detail' },
  ],
  sections: null,
  next: [],
});
