/**
 * Every triage view → the adapter that paints its card, and the faces that
 * adapter paints: its REAL model builder run over sample records (a card with
 * no model — `LabelCard`, `BatchCard`, the one-row `TriageRow` faces — states
 * its one fixed face). `checkCardViews()` runs each through
 * `cardViewMismatches` (`card-view-contract.ts`); `triage-views.test.ts`
 * fails on any mismatch or on a view with no entry here, and
 * `scripts/card-views-guard.ts` prints the same report.
 *
 * Quick look: a `RecordCard` adapter's peek is its exported peek component —
 * the compiler already refuses `RecordCard` a peek its view does not declare
 * (or a missing one it does), see `ViewQuickLookProps`.
 */

import type { ComponentType } from 'react';
import type { RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import type { TriageViewDecl, TriageViewSlots } from '@/design-system/components/triage-card-list/triage-view';
import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import type { LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import type { ExceptionRow } from '@/lib/exceptions/types';
import type { ImportRunListItem, ImportRunRowItem } from '@/lib/imports/types';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { orderCardModel } from '@/lib/orders/order-card-model';
import type { PrintStationFnskuRow } from '@/lib/print-station/fnsku';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { pickupCardModel, pickupOrderRecords, pickupRecordCard } from '@/lib/receiving/pickup/pickup-card-model';
import type { PickupLine } from '@/lib/receiving/pickup/pickup-lines';
import { repairCardModel } from '@/lib/repair/repair-card-model';
import type { DerivedPackerRecord } from '@/lib/shipped-records';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { outboundOrderIdentity } from '@/lib/operational-identity';
import { ExceptionCardPeek } from '@/components/exceptions/cards/ExceptionCard';
import { exceptionCardModel, exceptionRecordCard } from '@/components/exceptions/cards/exception-card-model';
import { ImportCardPeek } from '@/components/imports/cards/ImportCardPeek';
import { importRowRecordCard } from '@/components/imports/cards/ImportRowCard';
import { importRunRecordCard } from '@/components/imports/cards/ImportRunCard';
import { StockRackPeek } from '@/components/inventory/stock/StockRackPeek';
import { stockRecordCard } from '@/components/inventory/stock/stock-card-model';
import { OrderCardPeek } from '@/components/outbound/orders/cards/OrderCardPeek';
import { orderRecordCard } from '@/components/outbound/orders/cards/OrderCard';
import { CartonCardPeek } from '@/components/receiving/history/cards/CartonCard';
import { cartonCardModel, cartonRecordCard, groupCartons } from '@/components/receiving/history/cards/carton-card-model';
import { ReceiptCardPeek } from '@/components/receiving/incoming/cards/IncomingDeliveryCard';
import { receiptCardModel, receiptRecordCard } from '@/components/receiving/incoming/cards/receipt-card-model';
import { PickupCardPeek } from '@/components/receiving/pickup/cards/PickupCard';
import { RepairCardPeek } from '@/components/repair/cards/RepairCard';
import { ShippedCardPeek } from '@/components/shipped/ledger/ShippedPackageCard';
import { shippedRecordCard } from '@/components/shipped/ledger/shipped-card-model';
import { rackRecordCard } from '@/components/warehouse/racks/rack-card-model';
import { fnskuRecordCard } from '@/features/print-station/FnskuPrintDesk';
import type { RackSummary } from '@/lib/locations/rack-types';
import { cardViewMismatches, recordCardFace, type PaintedCardFace } from './card-view-contract';
import * as views from './index';

export interface CardViewAdapter {
  view: TriageViewDecl;
  /** The file (and component) that paints this view's card. */
  adapter: string;
  /** The faces the adapter paints — its model builder over sample records, or a fixed-anatomy card's one face. */
  faces: () => readonly PaintedCardFace[];
}

export interface CardViewReport {
  id: string;
  slots: TriageViewSlots;
  status: TriageViewDecl['status'];
  adapter: string | null;
  mismatches: string[];
}

/** The `RecordCard` faces of `models`, folding `peek` (the adapter's quick look; null = none). */
const recordCards = (models: readonly Pick<RecordCardModel, 'status' | 'channel' | 'person' | 'lines'>[], peek: ComponentType<never> | null) =>
  models.map((model) => recordCardFace(model, peek != null));

// ── Sample records: one realistic record per adapter, every slot's data present ──

const NOW = '2026-10-02T17:30:00.000Z';
const TODAY = '2026-10-02';
/** A catalog-resolved storefront, as the adapters' channel hooks hand it in. */
const CHANNEL: RecordCardModel['channel'] = { label: 'eBay', tooltip: 'eBay', dot: null, badge: null };

const receivingLine = (fields: Partial<ReceivingLineRow>) =>
  ({
    id: 501,
    receiving_id: 77,
    workflow_status: 'DONE',
    sku: 'BOSE-251-BLK',
    product_title: 'Bose 251 speaker',
    quantity_expected: 2,
    quantity_received: 2,
    tracking_number: '1Z3Y496R0398693994',
    carrier: 'UPS',
    vendor_name: 'Aero Deals',
    source_platform: 'ebay',
    zoho_purchaseorder_number: 'PO-1520',
    expected_delivery_date: '2026-10-04',
    scanned_at: NOW,
    last_activity_at: NOW,
    ...fields,
  }) as ReceivingLineRow;
const carton = (rows: ReceivingLineRow[]): RowGroup<ReceivingLineRow> => groupCartons(rows)[0]!;
const docked = carton([receivingLine({ unboxed_at: null })]);
const unboxed = carton([receivingLine({ unboxed_at: NOW, unboxed_by_name: 'Dana', received_done_at: NOW })]);

const order = {
  id: 9001,
  order_id: '21-15192-45235',
  account_source: 'ebay',
  item_number: '205512345678',
  sku: 'BOSE-251-BLK',
  product_title: 'Bose 251 speaker',
  quantity: 1,
  condition: 'USED_GOOD',
  ship_by_date: '2026-10-03',
  created_at: NOW,
  shipstation_ship_to: { name: 'Ana Ruiz' },
} as unknown as ShippedOrder;

const stockRow = (fields: Partial<LocationStockTableRow>): LocationStockTableRow => ({
  location_id: 12,
  location_name: 'A-01-02-00',
  location_barcode: 'A-01-02-00',
  room: 'Main',
  aisle: 1,
  bay: 2,
  level: 0,
  position: 0,
  sku: 'BOSE-251-BLK',
  stock_id: 3,
  home_location: 'A-01-02-00',
  product_title: 'Bose 251 speaker',
  image_url: null,
  cover_photo_url: null,
  is_provisional: false,
  source: 'bin',
  qty: 4,
  last_moved: '2026-09-30T18:00:00.000Z',
  last_counted: '2026-10-01T16:00:00.000Z',
  ...fields,
  min_qty: fields.min_qty ?? null,
});
const rack = [stockRow({}), stockRow({ location_id: 13, location_barcode: 'A-01-02-01', position: 1, sku: 'REMOTE-V20', qty: 2, last_counted: null })];

const importRun: ImportRunListItem = {
  id: 310,
  kind: 'pipeline',
  trigger: 'cron',
  triggeredBy: null,
  status: 'partial',
  startedAt: NOW,
  finishedAt: NOW,
  durationMs: 4200,
  sources: ['ebay', 'shipstation'],
  totals: { inserted: 4, backfilled: 1, trackingFilled: 2, needsReview: 1, skipped: 0, failed: 1 } as ImportRunListItem['totals'],
  error: 'shipstation: 429 Too Many Requests',
  cronRunId: 88,
};
const importRow: ImportRunRowItem = {
  id: 4401,
  runId: 310,
  stepId: 2,
  orderRowId: 9001,
  externalOrderId: '21-15192-45235',
  accountSource: 'ebay',
  platform: 'ebay',
  source: 'ebay',
  outcome: 'inserted' as ImportRunRowItem['outcome'],
  reason: null,
  filledFields: ['tracking'],
  trackingNumber: '1Z3Y496R0398693994',
  shipmentId: null,
  skuCatalogId: null,
  itemNumber: '205512345678',
  title: 'Bose 251 speaker',
  shipstationOrderId: null,
  shipstationShipmentId: null,
  sheetTab: null,
  sheetRow: null,
  importExceptionId: null,
  createdAt: NOW,
};

const exception: ExceptionRow = {
  key: 'fbm:9001',
  kind: 'fbm',
  domain: 'outbound' as ExceptionRow['domain'],
  sourceId: '9001',
  tag: { label: 'Invalid address', tone: 'danger' },
  entity: { type: 'order' as ExceptionRow['entity']['type'], id: '9001', label: '21-15192-45235' },
  title: 'Bose 251 speaker',
  detail: 'ShipStation rejected the ship-to address',
  order: { accountSource: 'ebay', buyerNote: null, staffNote: null },
  resolveVerb: 'Edit address',
  raisedAt: NOW,
};

const shipped = {
  id: 7001,
  order_id: '21-15192-45235',
  account_source: 'ebay',
  package_tracking: '1Z3Y496R0398693994',
  carrier: 'UPS',
  product_title: 'Bose 251 speaker',
  sku: 'BOSE-251-BLK',
  ship_confirmed_at: NOW,
  row_source: 'packer',
  outboundState: 'SCANNED_OUT',
  package_lines: [],
} as unknown as DerivedPackerRecord;

const pickupLine: PickupLine = {
  id: 1,
  order_id: 41,
  sku: 'BOSE-251-BLK',
  product_title: 'Bose 251 speaker',
  image_url: null,
  quantity: 1,
  condition_grade: 'USED_GOOD',
  parts_status: 'COMPLETE',
  missing_parts_note: null,
  condition_note: null,
  total_price: '370.00',
  po_number: 'LCPU-JOAQUIN-012926',
  reference_number: 'PICKUP-41',
  customer_name: 'Joaquin',
  order_status: 'DRAFT',
  receiving_id: null,
  pickup_date: TODAY,
  order_created_at: NOW,
  zoho_po_id: null,
  zoho_status: null,
  zoho_total: null,
  zoho_po_date: null,
  zoho_vendor_name: null,
} as PickupLine;

const repair = {
  id: 4894,
  created_at: '2026-09-28 10:30:00',
  updated_at: '2026-09-28 10:30:00',
  ticket_number: '10089',
  contact_info: '',
  product_title: 'Bose 251 speaker',
  price: '168.00',
  issue: 'Left channel crackles',
  serial_number: 'SN-251-7788',
  status: 'Pending Repair',
  intake_channel: 'pickup',
  customer_name: 'Ana Ruiz',
  receiving_line_id: null,
  receiving_id: null,
  received_at: '2026-09-28 10:30:00',
  due_at: '2026-10-04 10:30:00',
} as RSRecord;

const movableRack = (fields: Partial<RackSummary>) => {
  const lead: RackSummary = {
    id: 12,
    code: 'RK12',
    name: 'Rack 12',
    rackNumber: 12,
    placement: { id: 4, code: 'ROOM-C', name: 'Room C', kind: 'ROOM' },
    room: { id: 4, name: 'Room C', code: 'ROOM-C' },
    shelfCount: 5,
    lastMovedAt: NOW,
    ...fields,
  };
  return { key: lead.code, ids: [lead.id], lead };
};

const fnsku = (fields: Partial<PrintStationFnskuRow>) => ({
  key: 'X00ABC1234',
  ids: [1],
  lead: {
    fnsku: 'X00ABC1234',
    title: 'Bose 251 speaker',
    asin: 'B000123456',
    sku: 'BOSE-251-BLK',
    condition: 'Used - Very Good',
    ...fields,
    ordinal: 1,
  },
});

/** The one-row density (`TriageRow`): a state badge leads, no channel / person slot, no quick look passed, no line photo. */
const TRIAGE_ROW_FACE: PaintedCardFace = { status: 'state', channel: false, person: false, quickLook: false, photo: false };

export const CARD_VIEW_ADAPTERS: readonly CardViewAdapter[] = [
  {
    view: views.OUTBOUND_TRIAGE_VIEW,
    adapter: 'src/components/outbound/orders/cards/OrderCard.tsx',
    faces: () => {
      const model = orderCardModel('order:9001', [order], TODAY);
      const identity = outboundOrderIdentity(model.orderId, { label: 'eBay', meta: sourcePlatformMeta('ebay') });
      return recordCards([orderRecordCard(model, identity, CHANNEL)], OrderCardPeek);
    },
  },
  {
    view: views.INCOMING_PIPELINE_VIEW,
    adapter: 'src/components/receiving/incoming/cards/IncomingDeliveryCard.tsx',
    faces: () => {
      const group = groupRowsBy([receivingLine({ unboxed_at: null })], (row) => `po:${row.zoho_purchaseorder_number}`)[0]!;
      return recordCards([receiptRecordCard(receiptCardModel(group))], ReceiptCardPeek);
    },
  },
  {
    view: views.INCOMING_DOCKED_VIEW,
    adapter: 'src/components/receiving/history/cards/CartonCard.tsx#ReceivingCartonCard (docked)',
    faces: () =>
      recordCards(
        [
          cartonRecordCard(cartonCardModel(docked, 'scanned', 'docked'), CHANNEL),
          // No vendor promise: the arrival stamp, untoned.
          cartonRecordCard(cartonCardModel(carton([receivingLine({ unboxed_at: null, expected_delivery_date: null })]), 'scanned', 'docked'), CHANNEL),
        ],
        CartonCardPeek,
      ),
  },
  {
    view: views.INCOMING_UNBOXED_VIEW,
    adapter: 'src/components/receiving/history/cards/CartonCard.tsx#CartonCard',
    faces: () => recordCards([cartonRecordCard(cartonCardModel(unboxed, 'unboxed', 'unboxed'), CHANNEL)], CartonCardPeek),
  },
  {
    view: views.RECEIVE_QUEUE_VIEW,
    adapter: 'src/components/receiving/unbox/UnboxCartonCards.tsx → ReceivingCartonCard',
    faces: () => recordCards([cartonRecordCard(cartonCardModel(unboxed, 'unboxed'), CHANNEL)], CartonCardPeek),
  },
  {
    view: views.LABEL_INTAKE_UPLOADS_VIEW,
    adapter: 'src/features/labels-docs/BatchCard.tsx',
    // Fixed anatomy: file name … the print state pill ("12 to print" / "All printed"); no channel, person, peek or photo.
    faces: () => [{ status: 'state', channel: false, person: false, quickLook: false, photo: false }],
  },
  ...[views.LABEL_INTAKE_LABELS_VIEW, views.LABEL_INTAKE_PAPERWORK_VIEW].map((view) => ({
    view,
    adapter: 'src/features/labels-docs/LabelCard.tsx',
    // Fixed anatomy: order number + the platform's dot and name; its products beneath (titles, no photo); no status, person or peek.
    faces: () => [{ status: 'none', channel: true, person: false, quickLook: false, photo: false }] as const,
  })),
  {
    view: views.IMPORT_RUNS_VIEW,
    adapter: 'src/components/imports/cards/ImportRunCard.tsx',
    faces: () =>
      recordCards(
        [importRunRecordCard({ key: 'run:310', ids: [310], lead: importRun }, sourcePlatformMeta)],
        ImportCardPeek,
      ),
  },
  {
    view: views.IMPORT_ROWS_VIEW,
    adapter: 'src/components/imports/cards/ImportRowCard.tsx',
    faces: () => recordCards([importRowRecordCard({ key: 'row:4401', ids: [4401], lead: importRow }, CHANNEL)], ImportCardPeek),
  },
  {
    view: views.INVENTORY_STOCK_VIEW,
    adapter: 'src/components/inventory/stock/StockLedger.tsx#StockRow',
    faces: () =>
      recordCards(
        [
          stockRecordCard({ key: 'rack:MAIN:A-01-02', ids: [1, 2], lead: rack[0]!, rows: rack }, (row) => row.location_id ?? 0),
          // A rack nobody has counted or moved still paints its date status.
          stockRecordCard(
            { key: 'rack:MAIN:A-09-01', ids: [3], lead: stockRow({ last_counted: null, last_moved: null }), rows: [stockRow({ last_counted: null, last_moved: null })] },
            (row) => row.location_id ?? 0,
          ),
        ],
        StockRackPeek,
      ),
  },
  { view: views.INVENTORY_REPLENISH_VIEW, adapter: 'src/components/replenish/ReplenishmentNeedTable.tsx → TriageRow', faces: () => [TRIAGE_ROW_FACE] },
  {
    view: views.OUTBOUND_SHIPPED_VIEW,
    adapter: 'src/components/shipped/ledger/ShippedPackageCard.tsx',
    faces: () => recordCards([shippedRecordCard({ key: '1Z3Y496R0398693994', ids: [7001], lead: shipped })], ShippedCardPeek),
  },
  { view: views.PRODUCTS_CATALOG_VIEW, adapter: 'src/components/products/catalog/ProductCatalogList.tsx → TriageRow', faces: () => [TRIAGE_ROW_FACE] },
  {
    view: views.PRODUCTS_CATALOG_IMPORT_VIEW,
    adapter: 'src/components/products/catalog/CatalogImportReview.tsx → TriageRow',
    faces: () => [TRIAGE_ROW_FACE],
  },
  {
    view: views.EXCEPTIONS_VIEW,
    adapter: 'src/components/exceptions/cards/ExceptionCard.tsx',
    faces: () => {
      const group = groupRowsBy([exception], (row) => row.key)[0]!;
      // The hub (`showKind`): the kind names the person slot.
      return recordCards([exceptionRecordCard(exceptionCardModel(group), true, CHANNEL)], ExceptionCardPeek);
    },
  },
  {
    view: views.PICKUP_HISTORY_VIEW,
    adapter: 'src/components/receiving/pickup/cards/PickupCard.tsx',
    faces: () =>
      recordCards([pickupRecordCard(pickupCardModel({ key: 'pickup:41', rows: pickupOrderRecords([pickupLine]) }))], PickupCardPeek),
  },
  {
    view: views.PRINT_STATION_FNSKU_VIEW,
    adapter: 'src/features/print-station/FnskuPrintDesk.tsx#FnskuCard, #FnskuRow',
    faces: () => [
      ...recordCards([fnskuRecordCard(fnsku({})), fnskuRecordCard(fnsku({ asin: null, sku: null, condition: null }))], null),
      // Compact: no state badge, channel, person or peek.
      { status: 'none', channel: false, person: false, quickLook: false, photo: false },
    ],
  },
  { view: views.PRINT_STATIONS_VIEW, adapter: 'src/features/print-station/PrintStationsDesk.tsx → TriageRow', faces: () => [TRIAGE_ROW_FACE] },
  {
    view: views.LOCATIONS_RACKS_VIEW,
    adapter: 'src/components/warehouse/racks/RacksDesk.tsx#RackCard',
    faces: () =>
      recordCards(
        [
          rackRecordCard(movableRack({})),
          rackRecordCard(movableRack({
            id: 13,
            code: 'RK13',
            name: 'Rack 13',
            rackNumber: 13,
            placement: { id: 9, code: 'C-FLOOR-2', name: 'Floor spot 2', kind: 'STAGING' },
            room: null,
            shelfCount: 1,
          })),
        ],
        null,
      ),
  },
  { view: views.QC_LABELS_VIEW, adapter: 'src/components/inventory/qc-labels/QcLabelsLedger.tsx → TriageRow', faces: () => [TRIAGE_ROW_FACE] },
  {
    view: views.REPAIR_QUEUE_VIEW,
    adapter: 'src/components/repair/cards/RepairCard.tsx',
    faces: () => recordCards([repairCardModel(repair, TODAY).record], RepairCardPeek),
  },
];

/** Every view `./index` exports — a new view with no adapter entry here fails the check. */
export function allTriageViews(): TriageViewDecl[] {
  return (Object.values(views) as unknown[]).filter(
    (value): value is TriageViewDecl => typeof value === 'object' && value != null && 'slots' in value && 'testIdPrefix' in value,
  );
}

/** The contract over every view: each adapter's faces against its view's declaration. */
export function checkCardViews(): CardViewReport[] {
  return allTriageViews().map((view) => {
    const entries = CARD_VIEW_ADAPTERS.filter((entry) => entry.view === view);
    const mismatches =
      entries.length === 0
        ? [`no adapter registered in card-view-adapters.ts for ${view.id}`]
        : entries.flatMap((entry) => entry.faces().flatMap((face) => cardViewMismatches(view, face)));
    return {
      id: view.id,
      slots: view.slots,
      status: view.status,
      adapter: entries.map((entry) => entry.adapter).join(', ') || null,
      mismatches: [...new Set(mismatches)],
    };
  });
}
