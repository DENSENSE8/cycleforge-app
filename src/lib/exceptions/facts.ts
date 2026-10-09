/**
 * Exceptions hub — the per-kind `facts` a resolver needs (`GET
 * /api/exceptions/[key]`) and the per-kind resolve inputs the hooks in
 * `src/hooks/exceptions` accept. Pure types: every resolve input names the
 * EXISTING endpoint body it posts, so desk and phone resolve through the same
 * writes the lane surfaces already use.
 */

import type { LabelIngestionDto } from '@/lib/label-ingestions/http-client';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import type { OrderExceptionRow } from '@/lib/orders/order-exception-types';
import type { PaperworkSource } from '@/lib/manuals/paperwork-pairing';
import type { UnmatchedScanSourceStation } from '@/lib/orders-exceptions';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ClaimType } from '@/lib/receiving-claim-type';
import type { LabelPurpose } from '@/lib/shipping/label-purpose';
import type { ExceptionRow } from './types';

/** The order a label / paperwork exception blocks. */
export interface ExceptionOrderRef {
  /** `orders.id` — every order endpoint's `[id]`. */
  id: number;
  orderNumber: string | null;
  accountSource: string | null;
  sku: string | null;
  itemNumber: string | null;
  productTitle: string | null;
  trackingNumber: string | null;
}

export interface FbmExceptionFacts {
  kind: 'fbm';
  /** The order-exception row the lane desk already renders (routing, gates, notes). */
  order: OrderExceptionRow;
}

export type PairsExceptionFacts =
  | {
      kind: 'pairs';
      source: 'order';
      /** `order.blockers` names what is missing (unpaired / no item number). */
      order: OrderExceptionRow;
    }
  | {
      kind: 'pairs';
      source: 'placeholder';
      /** The on-hold `TMP-` product (`GET /api/sku-catalog/provisional/[sku]`). */
      placeholder: ProvisionalSkuDetail;
    };

export interface PaperworkExceptionFacts {
  kind: 'paperwork';
  order: ExceptionOrderRef;
  /** G3: a shipping-label document is linked to the order. */
  hasShippingLabelDocument: boolean;
  /** G2: a non-label document linked to the order, or product paperwork resolved for it (order › item number › SKU). */
  hasDocuments: boolean;
  /** The order-level G2 exemption (`orders.docs_not_required`). */
  docsNotRequired: boolean;
  /** The SKU-level G2 exemption (`sku_catalog.paperwork_not_required`). */
  skuPaperworkNotRequired: boolean;
  /** What fails, in gate order. */
  missing: Array<'documents' | 'label'>;
}

export interface LabelsExceptionFacts {
  kind: 'labels';
  order: ExceptionOrderRef;
  /** The order's latest label ingestion (QUARANTINED or FAILED). */
  ingestion: LabelIngestionDto;
}

export interface BinsExceptionFacts {
  kind: 'bins';
  alert: {
    id: number;
    sku: string;
    binId: number | null;
    binBarcode: string | null;
    /** The larger absolute drift across warehouse / boxed stock. */
    qtyAtTrigger: number | null;
    /** The drift-check evidence line (`drift: warehouse stored=… ledger=… (Δ=…)`). */
    notes: string | null;
    raisedAt: string | null;
    productTitle: string | null;
  };
}

export interface TrackingExceptionFacts {
  kind: 'tracking';
  exception: {
    id: number;
    trackingNumber: string;
    domain: 'orders' | 'receiving';
    sourceStation: string | null;
    staffName: string | null;
    exceptionReason: string | null;
    notes: string | null;
    status: 'open' | 'resolved' | 'discarded';
    shipmentId: number | null;
    receivingId: number | null;
    lastZohoCheckAt: string | null;
    zohoCheckCount: number;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

/** An open unmatched pack / dock scan (`orders_exceptions`, `sqlOpenUnmatchedScan`) — the Fulfilled desk's dock miss. */
export interface UnmatchedScanExceptionFacts {
  kind: 'unmatched';
  scan: {
    id: number;
    tracking: string;
    sourceStation: UnmatchedScanSourceStation;
    staffName: string | null;
    notes: string | null;
    /** ISO. */
    createdAt: string;
    /** The scan's package (`shipment_id`, Fulfilled's `?shipment=` record that resolves it); null when none is known. */
    shipmentId: number | null;
  };
}

/** A received carton (Claim · Short · Unfound) — its lines as the Unboxed ledger reads them. */
export interface CartonExceptionFacts {
  kind: 'claim' | 'short' | 'unfound';
  carton: {
    receivingId: number;
    poNumber: string | null;
    zohoPurchaseorderId: string | null;
    tracking: string | null;
    carrier: string | null;
    source: string | null;
    unboxedAt: string | null;
  };
  /** Every line on the carton (an unfound carton with no line yet is one placeholder, `id < 0`). */
  lines: ReceivingLineRow[];
  /** Claim only: the OPEN claim reasons, one per filed ticket. */
  claims: Array<{ code: string; label: string; ticket: string }>;
}

export type ExceptionFacts =
  | FbmExceptionFacts
  | PairsExceptionFacts
  | PaperworkExceptionFacts
  | LabelsExceptionFacts
  | BinsExceptionFacts
  | TrackingExceptionFacts
  | UnmatchedScanExceptionFacts
  | CartonExceptionFacts;

/** `GET /api/exceptions/[key]` response. */
export interface ExceptionRecordResponse {
  row: ExceptionRow;
  facts: ExceptionFacts;
}

// ─── Resolve inputs (one per kind) ──────────────────────────────────────────

/** FBM: `PATCH /api/orders/[id]` (out-of-stock / identity fields). */
export type FbmResolveInput = {
  action: 'update-order';
  orderId: number;
  patch: { isOutOfStock?: boolean; itemNumber?: string | null; sku?: string | null; productTitle?: string };
};

/**
 * Missing pairs. Order: optional identity fix (`PATCH /api/orders/[id]`),
 * then `POST /api/sku-catalog/pair` — or mint the catalog item first
 * (`POST /api/sku-catalog`). Placeholder: `POST /api/sku-catalog/provisional/merge`.
 */
export type PairsResolveInput =
  | {
      action: 'pair-order';
      orderId: number;
      skuCatalogId: number;
      /** Pairing key: the order's item number (else its SKU). */
      itemNumber: string;
      /** `accountSource` lowercased (`'manual'` when none). */
      platform: string;
      fields?: { itemNumber?: string | null; sku?: string | null; productTitle?: string };
    }
  | {
      action: 'create-and-pair-order';
      orderId: number;
      sku: string;
      productTitle: string;
      itemNumber: string;
      platform: string;
      fields?: { itemNumber?: string | null; sku?: string | null; productTitle?: string };
    }
  | { action: 'merge-placeholder'; provisionalSku: string; targetSku: string };

/** Paperwork: G2 exemption (`POST /api/orders/[id]/cage-release`) or G3 label link (`POST /api/orders/[id]/labels`); document / manual writes go through `usePaperworkExceptionActions`. */
export type PaperworkResolveInput =
  | { action: 'docs-not-required'; orderId: number; value: boolean }
  | {
      action: 'link-label';
      orderId: number;
      shipstationShipmentId: number;
      purpose: LabelPurpose;
      /** Minted once per intended link (8–128 chars). */
      clientEventId: string;
    }
  | { action: 'pair-manual'; orderId: number; manualId: number; pairTo: PaperworkSource };

/** Labels: re-ingest (`POST /api/v1/label-ingestions/[id]/retry`) or pair the quarantined ShipStation label to its order (`POST /api/orders/[id]/labels`). */
export type LabelsResolveInput =
  | { action: 'retry'; ingestionId: number }
  | {
      action: 'link-to-order';
      orderId: number;
      shipstationShipmentId: number;
      purpose: LabelPurpose;
      clientEventId: string;
    };

/** Bin errors: `POST /api/inventory/alerts/[id]/ack`. */
export interface BinsResolveInput {
  alertId: number;
  note?: string;
}

/** Tracking: `POST /api/tracking-exceptions/[id]/refresh` or `PATCH /api/tracking-exceptions/[id]`. */
export type TrackingResolveInput =
  | { action: 'refresh'; id: number }
  | {
      action: 'update';
      id: number;
      patch: {
        status?: 'open' | 'resolved' | 'discarded';
        notes?: string | null;
        tracking_number?: string;
        exception_reason?: string;
      };
    };

/** Claim: settle every open claim reason this ticket recorded on the carton or its lines (`POST /api/receiving/[id]/claims/resolve`). */
export interface ClaimResolveInput {
  receivingId: number;
  ticket: string;
}

/** Short: correct the counts (`PATCH /api/receiving-lines`) or file a claim (`POST /api/receiving/zendesk-claim`, which moves the carton to Claim). */
export type ShortResolveInput =
  | { action: 'set-quantity'; lineId: number; quantityReceived?: number; quantityExpected?: number }
  | { action: 'file-claim'; receivingId: number; lineId: number | null; claimType: ClaimType; reason?: string };

/** Unfound: pair the carton to its PO (`POST /api/receiving/relink`, carton scope). */
export interface UnfoundResolveInput {
  receivingId: number;
  zohoPurchaseorderId: string;
  zohoPurchaseorderNumber?: string | null;
}
