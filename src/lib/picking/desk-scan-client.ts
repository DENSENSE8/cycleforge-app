/**
 * The desk pick scan flow, client half — ONE module for the Picker desk
 * (`useDeskPickController` → `src/hooks/station/handle*Scan.ts`) and the
 * phone (`/m/pick` label mode). Each verb posts to its
 * `/api/picking/desk/*` route and folds the answer into the active order
 * card; the caller owns feedback (toasts, confetti, tones) and caches.
 *
 * Owner 2026-09-28: a phone picks the same way as the desk, printed shipping
 * label included, and every pick is reversible (Undo last step · Unpick).
 * Verbs never throw: a failed request comes back as `{ ok: false, error }`.
 */

import type { ActiveStationOrder } from '@/hooks/station/types';
import type { ShippedOrder } from '@/types/orders';
import { classifyInput, findSerialInCatalog, looksLikeFnsku } from '@/lib/scan-resolver';
import { unwrapScannedSerial } from '@/lib/barcode-routing';
import { detectStationScanType, type StationScanType } from '@/lib/station-scan-routing';
import { normalizeTrackingNumber } from '@/lib/tracking-format';
import type { PhoneScanCorrelation } from '@/lib/scan/phone-scan-intent';
import {
  appendSerialToSkuGroups,
  initSkuSerialGroups,
  mergeSkuSerialGroups,
  rebuildSkuSerialGroups,
} from '@/lib/tech/sku-serial-groups';

type Failure = { ok: false; error: string };

/** The order card a desk route answers with — `buildOrderPayload` (src/lib/tech/order-card.ts) on the wire. */
export interface DeskOrderPayload {
  id: number | null;
  orderId: string;
  productTitle: string;
  itemNumber: string | null;
  sku: string;
  condition: string;
  notes: string;
  tracking: string;
  serialNumbers: string[];
  testDateTime: string | null;
  testedBy: number | null;
  quantity: number | string;
  shipByDate: string | null;
  createdAt: string | null;
  accountSource: string | null;
  status: string | null;
  statusHistory: unknown[];
  isShipped: boolean;
  shipmentId?: number | null;
  scannedSkuCodes?: string[];
  /** `add-to-last` only: false when the anchor matched no order. */
  orderFound?: boolean;
}

export interface DeskPackPlacement {
  locationId: number;
  locationName: string;
}

/** `POST /api/picking/desk/scan` success body. */
export interface DeskTrackingScanPayload {
  found: true;
  orderFound: boolean;
  salId: number | null;
  techActivityId?: number | null;
  techSerialId?: number | null;
  fnskuLogId?: number | null;
  scanSessionId?: string | null;
  warning?: string;
  packPlacement?: DeskPackPlacement | null;
  order: DeskOrderPayload;
}

async function postDesk(
  url: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data: Record<string, any> | null }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as Record<string, any> | null;
  return { ok: res.ok, data };
}

function sessionIdOf(data: Record<string, any> | null, fallback: string | null | undefined): string | null {
  return typeof data?.scanSessionId === 'string' ? data.scanSessionId : (fallback ?? null);
}

// ── Routing ─────────────────────────────────────────────────────────────────

/**
 * Route a raw scan against the card in hand. While the order is still short
 * on serials, a "generic" tracking-looking barcode with no carrier signature
 * is a serial, not a new label.
 */
export function resolveDeskScanType(value: string, contextOrder: ActiveStationOrder | null): StationScanType {
  const base = detectStationScanType(value);
  if (!contextOrder) return base;

  const qty = Math.max(1, Number(contextOrder.quantity) || 1);
  const incomplete = contextOrder.serialNumbers.length < qty;
  if (!incomplete || base !== 'TRACKING') return base;

  return classifyInput(value).carrier ? 'TRACKING' : 'SERIAL';
}

// ── Tracking label → order card + pick scan ────────────────────────────────

export type DeskTrackingResult =
  | Failure
  | {
      ok: true;
      order: ActiveStationOrder;
      /** Success line for a matched order; null for an exception hold (amber card, never a success flash). */
      message: string | null;
      data: DeskTrackingScanPayload;
    };

/** Map the tracking scan's answer to the active order card. */
export function deskOrderFromTrackingScan(data: DeskTrackingScanPayload): ActiveStationOrder {
  const o = data.order;
  const serials = o.serialNumbers || [];
  return {
    id: o.id,
    orderId: o.orderId,
    salId: data.salId ?? null,
    productTitle: o.productTitle,
    itemNumber: o.itemNumber ?? null,
    sku: o.sku,
    condition: o.condition,
    notes: o.notes,
    tracking: o.tracking,
    serialNumbers: serials,
    scannedSkuCodes: Array.isArray(o.scannedSkuCodes) ? o.scannedSkuCodes : [],
    skuSerialGroups: initSkuSerialGroups(o.sku, serials),
    testDateTime: o.testDateTime,
    testedBy: o.testedBy,
    quantity: parseInt(String(o.quantity || 1), 10) || 1,
    shipByDate: o.shipByDate || null,
    createdAt: o.createdAt || null,
    orderFound: data.orderFound !== false,
    /** `orders_exceptions` flow — Undo + UI use the same SAL as matched orders; the label differs. */
    sourceType: data.orderFound === false ? 'exception' : undefined,
    scanSessionId: typeof data.scanSessionId === 'string' ? data.scanSessionId : null,
    inlineMicrocopy:
      data.orderFound === false && !data.fnskuLogId
        ? (data.warning || 'Order not in system — tracking logged for reconciliation.')
        : null,
    packLocationId: data.packPlacement?.locationId ?? null,
    packLocationName: data.packPlacement?.locationName ?? null,
  };
}

/**
 * A To-ship queue row as the order card BEFORE any scan — the phone opens a
 * tapped order on it (`/m/pick?order=<id>`). Read-only: no desk anchor
 * (`salId` / `scanSessionId`) until the pick scan writes one.
 */
export function deskOrderFromQueueRow(row: ShippedOrder): ActiveStationOrder {
  // The queue projection carries the primary tracking as `tracking_number`.
  const wire = row as ShippedOrder & { tracking_number?: string | null };
  const sku = String(row.sku ?? '').trim() || '—';
  return {
    id: Number(row.id),
    orderId: String(row.order_id ?? '').trim() || '—',
    salId: null,
    productTitle: String(row.product_title ?? '').trim() || 'Unknown Product',
    itemNumber: row.item_number ?? null,
    sku,
    condition: String(row.condition ?? '').trim() || '—',
    notes: String(row.notes ?? ''),
    tracking: String(row.shipping_tracking_number || wire.tracking_number || row.tracking_numbers?.[0] || '').trim(),
    serialNumbers: [],
    scannedSkuCodes: [],
    skuSerialGroups: initSkuSerialGroups(sku, []),
    testDateTime: null,
    testedBy: null,
    quantity: parseInt(String(row.quantity || 1), 10) || 1,
    shipByDate: row.ship_by_date ?? null,
    createdAt: row.created_at ?? null,
    orderFound: true,
    scanSessionId: null,
    inlineMicrocopy: null,
  };
}

/**
 * Scan a shipping label: loads the order card and writes the PICK /
 * PICK_SCANNED anchor. USPS IMpb `420`+ZIP prefixes and doubled reads are
 * stripped here; the server resolves the rest (`resolveShipmentId`).
 */
export function scanDeskTracking(
  input: string,
  opts: { idempotencyKey: string; packLocationId?: number | null; correlation?: PhoneScanCorrelation },
): Promise<DeskTrackingResult> {
  return anchorDeskPick(
    {
      type: 'TRACKING',
      value: normalizeTrackingNumber(input),
      idempotencyKey: opts.idempotencyKey,
      ...(opts.packLocationId != null ? { packLocationId: opts.packLocationId } : {}),
      ...(opts.correlation
        ? {
            mobileScanEventId: opts.correlation.mobileScanEventId,
            scanClientEventId: opts.correlation.clientEventId,
          }
        : null),
    },
    'Tracking number not found — logged to exceptions queue.',
  );
}

/**
 * Anchor the pick on the order row itself — same writer and answer as
 * {@link scanDeskTracking}, for orders with no label to scan (walk-in /
 * Pickup) and for a walk that already knows which order it opened.
 */
export function scanDeskOrder(
  orderId: number,
  opts: { idempotencyKey: string; correlation?: PhoneScanCorrelation },
): Promise<DeskTrackingResult> {
  return anchorDeskPick({
    type: 'ORDER',
    orderId,
    idempotencyKey: opts.idempotencyKey,
    ...(opts.correlation
      ? {
          mobileScanEventId: opts.correlation.mobileScanEventId,
          scanClientEventId: opts.correlation.clientEventId,
        }
      : null),
  }, 'Order not found.');
}

async function anchorDeskPick(body: Record<string, unknown>, notFound: string): Promise<DeskTrackingResult> {
  try {
    const { ok, data } = await postDesk('/api/picking/desk/scan', body);
    if (!ok || !data?.found) {
      return { ok: false, error: data?.error ? `Scan error: ${data.error}` : notFound };
    }
    const payload = data as DeskTrackingScanPayload;
    const order = deskOrderFromTrackingScan(payload);
    let message: string | null = null;
    if (payload.orderFound !== false) {
      const serialCount = payload.order.serialNumbers?.length || 0;
      const placeHint = payload.packPlacement?.locationName ? ` · at ${payload.packPlacement.locationName}` : '';
      message =
        serialCount > 0
          ? `Order loaded: ${serialCount} serial${serialCount !== 1 ? 's' : ''} already scanned${placeHint}`
          : `Order loaded - ready to scan serials${placeHint}`;
    }
    return { ok: true, order, message, data: payload };
  } catch (err) {
    console.error('Desk pick anchor failed:', err);
    return { ok: false, error: 'Failed to load order. Please try again.' };
  }
}

// ── Serial → attach to the card, pick its allocated unit ───────────────────

export type DeskSerialResult =
  | Failure
  | {
      ok: true;
      /** The next card; null when `add-to-last` could not resolve the order (the serial is still saved). */
      order: ActiveStationOrder | null;
      serial: string;
      attachedToOrder: boolean;
      message: string;
      /** The serial is saved but its unit was not picked for this order. */
      pickWarning: string | null;
      isComplete: boolean;
    };

/**
 * Add a scanned serial. With a card in hand it posts `add` on the card's
 * anchor (a partial serial resolves against the card first); without one it
 * posts `add-to-last` and the server restores the staffer's latest card.
 * Either way the server picks the unit's allocation when it holds one.
 */
export async function addDeskSerial(opts: {
  input: string;
  contextOrder: ActiveStationOrder | null;
  scanSessionId: string | null;
  idempotencyKey: string;
  correlation?: PhoneScanCorrelation | null;
}): Promise<DeskSerialResult> {
  const { contextOrder } = opts;
  /** The serial as it should be STORED. */
  let serial = unwrapScannedSerial(opts.input).toUpperCase();

  if (contextOrder && classifyInput(serial).type === 'serial_partial' && contextOrder.serialNumbers.length > 0) {
    const { matchType, matches } = findSerialInCatalog(serial, contextOrder.serialNumbers);
    if (matchType !== 'none' && matches.length === 1) {
      serial = matches[0].toUpperCase();
    } else if (matches.length > 1) {
      return {
        ok: false,
        error: `Partial "${serial}" is ambiguous — ${matches.length} serials match. Scan the full serial.`,
      };
    }
  }

  try {
    const sessionId = (contextOrder?.scanSessionId ?? opts.scanSessionId) || undefined;
    const trk = String(contextOrder?.tracking || '').trim();
    const { data } = await postDesk(
      '/api/picking/desk/serial',
      contextOrder
        ? {
            action: 'add',
            salId: contextOrder.salId || undefined,
            tracking: contextOrder.tracking,
            serial,
            allowFbaDuplicates: looksLikeFnsku(trk) || /^FBA/i.test(trk),
            scanSessionId: sessionId,
            idempotencyKey: opts.idempotencyKey,
            mobileScanEventId: opts.correlation?.mobileScanEventId ?? null,
            scanClientEventId: opts.correlation?.clientEventId ?? null,
          }
        : {
            action: 'add-to-last',
            serial,
            scanSessionId: sessionId,
            idempotencyKey: opts.idempotencyKey,
            mobileScanEventId: opts.correlation?.mobileScanEventId ?? null,
            scanClientEventId: opts.correlation?.clientEventId ?? null,
          },
    );
    if (!data?.success) return { ok: false, error: data?.error || 'Failed to add serial' };

    const attachedToOrder = data.attachedToOrder !== false;
    const warning = typeof data.warning === 'string' ? data.warning : undefined;
    let order: ActiveStationOrder | null;

    if (contextOrder) {
      order = {
        ...contextOrder,
        serialNumbers: Array.isArray(data.serialNumbers) ? data.serialNumbers : contextOrder.serialNumbers,
        skuSerialGroups: appendSerialToSkuGroups(contextOrder.skuSerialGroups, contextOrder.sku, serial),
        orderFound: attachedToOrder ? contextOrder.orderFound : false,
        sourceType: attachedToOrder ? contextOrder.sourceType : 'exception',
        inlineMicrocopy: warning ?? contextOrder.inlineMicrocopy,
        scanSessionId: sessionIdOf(data, contextOrder.scanSessionId ?? opts.scanSessionId),
      };
    } else {
      // The serial is persisted server-side regardless; only card restoration
      // depends on the resolved `order`. Degrade-not-block if it's absent.
      const restored: string[] = Array.isArray(data.serialNumbers) ? data.serialNumbers : [];
      const o = data.order as DeskOrderPayload | null | undefined;
      order = o
        ? {
            id: o.id ?? null,
            orderId: o.orderId,
            productTitle: o.productTitle,
            itemNumber: o.itemNumber ?? null,
            sku: o.sku,
            condition: o.condition,
            notes: o.notes,
            tracking: o.tracking,
            serialNumbers: restored,
            skuSerialGroups: initSkuSerialGroups(o.sku, restored),
            testDateTime: null,
            testedBy: null,
            quantity: Number(o.quantity) || 1,
            shipByDate: o.shipByDate ?? null,
            createdAt: o.createdAt ?? null,
            orderFound: o.orderFound !== false && attachedToOrder,
            sourceType: attachedToOrder ? undefined : 'exception',
            inlineMicrocopy: warning,
            scanSessionId: sessionIdOf(data, opts.scanSessionId),
          }
        : null;
    }

    const total = Array.isArray(data.serialNumbers) ? data.serialNumbers.length : 0;
    return {
      ok: true,
      order,
      serial,
      attachedToOrder,
      message: attachedToOrder
        ? `Serial ${serial} added ✓ (${total} total)`
        : `Serial ${serial} held on exception (${total} total)`,
      pickWarning: typeof data.pickWarning === 'string' ? data.pickWarning : null,
      isComplete: data.isComplete === true && attachedToOrder,
    };
  } catch (err) {
    console.error('Add serial error:', err);
    return { ok: false, error: 'Network error occurred' };
  }
}

// ── SKU code (`1809:A03`) → stock pull + serials ───────────────────────────

export type DeskSkuResult =
  | Failure
  | { ok: true; order: ActiveStationOrder; message: string; notes: string | null };

export async function scanDeskSku(opts: {
  input: string;
  contextOrder: ActiveStationOrder | null;
  scanSessionId: string | null;
  idempotencyKey: string;
  correlation?: PhoneScanCorrelation | null;
}): Promise<DeskSkuResult> {
  const { input, contextOrder } = opts;
  if (!contextOrder) {
    return { ok: false, error: 'Scan a tracking number or FNSKU first, then scan the SKU code' };
  }
  try {
    const { data } = await postDesk('/api/picking/desk/sku', {
      skuCode: input,
      tracking: contextOrder.tracking,
      salId: contextOrder.salId ?? null,
      scanSessionId: (contextOrder.scanSessionId ?? opts.scanSessionId) || undefined,
      idempotencyKey: opts.idempotencyKey,
      mobileScanEventId: opts.correlation?.mobileScanEventId ?? null,
      scanClientEventId: opts.correlation?.clientEventId ?? null,
    });
    if (!data?.success) return { ok: false, error: data?.error || 'SKU not found' };

    // Accumulate every storage SKU code scanned this session so the card can
    // show which physical bins were pulled.
    const matchedSku = typeof data.matchedSku === 'string' ? data.matchedSku : input.split(':')[0].trim();
    const prevSkuCodes = contextOrder.scannedSkuCodes ?? [];
    const added: string[] = Array.isArray(data.serialNumbers) ? data.serialNumbers : [];
    const order: ActiveStationOrder = {
      ...contextOrder,
      serialNumbers: Array.isArray(data.updatedSerials) ? data.updatedSerials : contextOrder.serialNumbers,
      scannedSkuCodes: prevSkuCodes.includes(matchedSku) ? prevSkuCodes : [...prevSkuCodes, matchedSku],
      skuSerialGroups: mergeSkuSerialGroups(contextOrder.skuSerialGroups, matchedSku, added),
      scanSessionId: sessionIdOf(data, contextOrder.scanSessionId ?? opts.scanSessionId),
    };

    const titleSuffix = data.productTitle ? ` · ${data.productTitle}` : '';
    const notesSuffix = data.notes ? ' · Notes on file' : '';
    const message =
      added.length > 0
        ? `SKU matched — added ${added.length} serial${added.length !== 1 ? 's' : ''} · Stock: −${data.quantityDecremented}${titleSuffix}${notesSuffix}`
        : `SKU matched — Stock: −${data.quantityDecremented}${titleSuffix}${notesSuffix}`;
    return { ok: true, order, message, notes: data.notes ? String(data.notes) : null };
  } catch (err) {
    console.error('SKU scan error:', err);
    return { ok: false, error: 'Failed to process SKU scan' };
  }
}

// ── Reversal: Undo last step · Unpick order ─────────────────────────────────

/** A picked unit put back to ALLOCATED by a reversal. */
export interface DeskUnpickedUnit {
  orderId: number;
  allocationId: number;
  serialUnitId: number;
}

export type DeskUndoResult =
  | Failure
  | {
      ok: true;
      /** The card after the undo; null when the label scan itself was undone. */
      order: ActiveStationOrder | null;
      undone: 'serial' | 'label';
      removedSerial: string | null;
      unpicked: DeskUnpickedUnit | null;
      message: string;
    };

/**
 * Undo the card's last step. With serials on the card: drop the newest one
 * (`desk/serial undo`), which also puts its picked unit back to ALLOCATED.
 * With none left: undo the label scan itself (`desk/delete` of the anchor).
 */
export async function undoLastDeskStep(opts: {
  order: ActiveStationOrder;
  idempotencyKey: string;
}): Promise<DeskUndoResult> {
  const { order } = opts;
  const salId = order.salId || null;
  try {
    if (order.serialNumbers.length > 0) {
      const { data } = await postDesk('/api/picking/desk/serial', {
        action: 'undo',
        salId: salId ?? undefined,
        idempotencyKey: opts.idempotencyKey,
      });
      if (!data?.success) return { ok: false, error: data?.error || 'Nothing to undo' };
      const serialNumbers: string[] = Array.isArray(data.serialNumbers) ? data.serialNumbers : [];
      const removedSerial = typeof data.removedSerial === 'string' ? data.removedSerial : null;
      return {
        ok: true,
        order: {
          ...order,
          serialNumbers,
          skuSerialGroups: rebuildSkuSerialGroups(order.skuSerialGroups, serialNumbers, order.sku),
        },
        undone: 'serial',
        removedSerial,
        unpicked: (data.unpicked as DeskUnpickedUnit | null | undefined) ?? null,
        message: removedSerial ? `Undo successful: removed ${removedSerial}` : 'Undo successful',
      };
    }
    if (!salId) return { ok: false, error: 'This scan has no session to undo' };
    const { data } = await postDesk('/api/picking/desk/delete', { salId });
    if (!data?.success) return { ok: false, error: data?.error || 'Could not undo the label scan' };
    return {
      ok: true,
      order: null,
      undone: 'label',
      removedSerial: null,
      unpicked: null,
      message: `Label scan undone · ${order.orderId}`,
    };
  } catch (err) {
    console.error('Desk undo error:', err);
    return { ok: false, error: 'Network error occurred' };
  }
}

export type DeskRemoveSerialsResult =
  | Failure
  | {
      ok: true;
      order: ActiveStationOrder;
      removed: string[];
      /** Picked units the dropped serials put back to ALLOCATED. */
      unpickedUnits: number;
      message: string;
    };

/**
 * Drop chosen serials off the card (`desk/serial update` with the set that
 * stays): each dropped serial's picked unit goes back to ALLOCATED, same as
 * Undo. Needs the card's desk anchor (`salId`).
 */
export async function removeDeskSerials(opts: {
  order: ActiveStationOrder;
  serials: readonly string[];
  idempotencyKey: string;
}): Promise<DeskRemoveSerialsResult> {
  const { order } = opts;
  if (!order.salId) return { ok: false, error: 'Scan a serial or SKU first — this pick has no desk session yet' };
  const drop = new Set(opts.serials.map((s) => s.trim().toUpperCase()).filter(Boolean));
  const removed = order.serialNumbers.filter((s) => drop.has(s.toUpperCase()));
  if (removed.length === 0) return { ok: false, error: 'That serial is not on this pick' };
  try {
    const { data } = await postDesk('/api/picking/desk/serial', {
      action: 'update',
      salId: order.salId,
      serials: order.serialNumbers.filter((s) => !drop.has(s.toUpperCase())),
      idempotencyKey: opts.idempotencyKey,
    });
    if (!data?.success) return { ok: false, error: data?.error || 'Could not remove the serial' };
    const serialNumbers: string[] = Array.isArray(data.serialNumbers) ? data.serialNumbers : [];
    const unpickedUnits = Array.isArray(data.unpickedUnits) ? data.unpickedUnits.length : 0;
    return {
      ok: true,
      order: {
        ...order,
        serialNumbers,
        skuSerialGroups: rebuildSkuSerialGroups(order.skuSerialGroups, serialNumbers, order.sku),
      },
      removed,
      unpickedUnits,
      message: `Removed ${removed.join(', ')}${unpickedUnits > 0 ? ` · ${unpickedUnits} unit${unpickedUnits === 1 ? '' : 's'} back to allocated` : ''}`,
    };
  } catch (err) {
    console.error('Desk remove serial error:', err);
    return { ok: false, error: 'Network error occurred' };
  }
}

export type DeskUnpickResult =
  | Failure
  | {
      ok: true;
      orderId: number;
      unpickedUnits: number;
      voidedScans: number;
      alreadyUnpicked: boolean;
      message: string;
    };

/**
 * Unpick the whole order (`desk/unpick`): every picked unit back to
 * ALLOCATED, its PICK scans voided, open picking sessions closed. Idempotent.
 */
export async function unpickDeskOrder(opts: { orderId: number; orderLabel?: string }): Promise<DeskUnpickResult> {
  try {
    const { data } = await postDesk('/api/picking/desk/unpick', { orderId: opts.orderId });
    if (!data?.success) return { ok: false, error: data?.error || 'Could not unpick the order' };
    const units = Number(data.unpickedUnits) || 0;
    const label = opts.orderLabel ?? `#${opts.orderId}`;
    return {
      ok: true,
      orderId: Number(data.orderId) || opts.orderId,
      unpickedUnits: units,
      voidedScans: Number(data.voidedScans) || 0,
      alreadyUnpicked: data.alreadyUnpicked === true,
      message:
        data.alreadyUnpicked === true
          ? `${label} was not picked`
          : `Unpicked ${label}${units > 0 ? ` · ${units} unit${units === 1 ? '' : 's'} back to allocated` : ''}`,
    };
  } catch (err) {
    console.error('Desk unpick error:', err);
    return { ok: false, error: 'Network error occurred' };
  }
}
