/** Order-inspector contextual SoT — what the right-rail record inspector opens on, which planes it exposes, and which bulk actions its lane… */

import type { ShippedActiveSection } from '@/components/shipped/stacks/types';
import type { DashboardOrderView } from '@/utils/dashboard-search-state';

/** Every context the shared order inspector is mounted under. */
export type OrderInspectorPanelContext =
  | 'dashboard'
  | 'queue'
  | 'fulfillment'
  | 'labels'
  | 'staged'
  | 'shipped'
  | 'station'
  | 'packer'
  | 'packed';

/** How the Documents plane behaves: */
export type OrderInspectorDocumentsMode = 'preview' | 'manage' | 'hidden';

/** Record-plane hand-offs the inspector may offer (deep-links, never mutations). */
export type OrderInspectorRecordCta = 'assign' | 'open_testing' | 'open_pack' | 'open_labels';

export interface OrderInspectorContext {
  /** Tab the inspector opens on, and re-seeds to on record change. */
  defaultTab: ShippedActiveSection;
  showDocumentsTab: boolean;
  documentsMode: OrderInspectorDocumentsMode;
  recordCtas: readonly OrderInspectorRecordCta[];
  /**
   * Mark-shipped / out-of-stock toggles + the header quick-action set — the
   * "this lane can dispatch" cluster. The station / packer / shipped panels
   * observe an order someone else dispatches, so they get none of it.
   */
  showDispatchExtras: boolean;
  /** Delete + the record-plane delete footer. Same lanes as dispatch today. */
  showDelete: boolean;
  /** Whether the footer editor dock mounts at all. */
  showEditorDock: boolean;
  /**
   * Open on the Root Index (Orders golden) instead of jumping into a leaf.
   * Packed uses this — Documents is hidden; the operator picks a topic.
   */
  openOnIndex: boolean;
}

export interface ResolveOrderInspectorContextInput {
  panelContext: OrderInspectorPanelContext;
  /**
   * Present when the inspector is mounted over a dashboard lane. Packed
   * diverges from fulfillment (no Documents tab; open on the Root Index).
   */
  orderView?: DashboardOrderView;
  /**
   * Search deep-link (`?mode=search`) opens journey-first — Item Journey is the
   * reason that link exists. Wins over the context default.
   */
  journeyFirst?: boolean;
}

/** Pending / To Ship + the queue slide-over. */
const FULFILLMENT_CONTEXT: OrderInspectorContext = {
  defaultTab: 'shipping',
  showDocumentsTab: true,
  documentsMode: 'preview',
  recordCtas: ['assign', 'open_testing'],
  showDispatchExtras: true,
  showDelete: true,
  showEditorDock: true,
  openOnIndex: false,
};

/** The Labels station owns document lifecycle — the only `manage` surface. */
const LABELS_CONTEXT: OrderInspectorContext = {
  defaultTab: 'shipping',
  showDocumentsTab: true,
  documentsMode: 'manage',
  recordCtas: ['assign'],
  showDispatchExtras: true,
  showDelete: true,
  showEditorDock: true,
  openOnIndex: false,
};

const DASHBOARD_CONTEXT: OrderInspectorContext = {
  defaultTab: 'shipping',
  showDocumentsTab: true,
  documentsMode: 'preview',
  recordCtas: ['assign'],
  showDispatchExtras: true,
  showDelete: true,
  showEditorDock: true,
  openOnIndex: false,
};

const STAGED_CONTEXT: OrderInspectorContext = {
  defaultTab: 'shipping',
  showDocumentsTab: true,
  documentsMode: 'preview',
  recordCtas: [],
  // Staged/station/packer/shipped observe an order they do not dispatch: no
  // mark-shipped, no delete — but the dock still mounts for its other editors.
  showDispatchExtras: false,
  showDelete: false,
  showEditorDock: true,
  openOnIndex: false,
};

/** Station / packer / shipped panels keep the legacy shipping-first body. */
const STATION_CONTEXT: OrderInspectorContext = {
  defaultTab: 'shipping',
  showDocumentsTab: false,
  documentsMode: 'hidden',
  recordCtas: [],
  showDispatchExtras: false,
  showDelete: false,
  showEditorDock: true,
  openOnIndex: false,
};

/**
 * To-ship Packed — post-pack staged list. Documents live on Labels; row
 * click opens the Root Index (Order · Timeline · Conversation).
 */
const PACKED_CONTEXT: OrderInspectorContext = {
  defaultTab: 'shipping',
  showDocumentsTab: false,
  documentsMode: 'hidden',
  recordCtas: [],
  showDispatchExtras: true,
  showDelete: true,
  showEditorDock: true,
  openOnIndex: true,
};

export function resolveOrderInspectorContext({
  panelContext,
  orderView,
  journeyFirst = false,
}: ResolveOrderInspectorContextInput): OrderInspectorContext {
  const base = (() => {
    if (orderView === 'packed' || panelContext === 'packed') {
      return PACKED_CONTEXT;
    }
    switch (panelContext) {
      case 'queue':
      case 'fulfillment':
        return FULFILLMENT_CONTEXT;
      case 'labels':
        return LABELS_CONTEXT;
      case 'dashboard':
        return DASHBOARD_CONTEXT;
      case 'staged':
        return STAGED_CONTEXT;
      default:
        return STATION_CONTEXT;
    }
  })();

  return journeyFirst ? { ...base, defaultTab: 'timeline', openOnIndex: false } : base;
}

// ── Desk order record (DeskRecordPlane) ─────────────────────────────────────

/**
 * The outbound desk an order record opens on.
 * sections paint, in both views (owner 2026-09-25, desk-surface handoff Step 2).
 */
export type OrderRecordMode = 'to-ship' | 'pending' | 'exceptions' | 'shipped' | 'search';

/** Every section the order record can paint. */
export type OrderRecordSectionId =
  /** Lifecycle code and where the order goes next. */
  | 'state'
  | 'buyer-note'
  /** Pair the item number to a catalog SKU — the write that un-cages a held order. */
  | 'resolve'
  /** Each line of the order: photo, Zoho-governed title, SKU, item # paperwork, bin, qty, condition. */
  | 'item'
  /** Each line's fulfilment chain: who picked · packed · QC'd · pre-boxed it, and when. */
  | 'stages'
  /** The chain's Pick / Pack assign popovers and the line's auto-assign rule — work still to do. */
  | 'assign'
  /** The shipment once it has left: scanned out by + when, carrier / TRK#, tracking status. */
  | 'shipment'
  /** Outbound label status + print the stored label / slip. */
  | 'labels'
  /** Every label on the order, return and replacement stories included. */
  | 'label-entries'
  /** Persisted ShipStation price breakdown. */
  | 'price'
  /** The order's own note (`order_notes`). */
  | 'note'
  | 'customer'
  /** Shipping facts: platform, order #, listing, TRK#, ship by, ordered. */
  | 'facts'
  /** The order's documents (labels, slips, paperwork) — `OrderDocumentsSection`. */
  | 'documents'
  /** The order's staff conversation thread — `ThreadPanel`. */
  | 'conversation';

/**
 * What a mode may never paint — listing it in {@link ORDER_RECORD_SECTIONS} is a type error.
 * (owner 2026-09-25); the pairing form is the Exceptions desk's job alone; a
 */
interface OrderRecordForbiddenSections {
  'to-ship': 'label-entries' | 'resolve';
  pending: 'label-entries' | 'resolve';
  exceptions: 'label-entries';
  shipped: 'resolve' | 'assign';
  search: 'resolve';
}

/** The order record's sections per desk, in paint order within each column. */
export const ORDER_RECORD_SECTIONS: {
  readonly [M in OrderRecordMode]: readonly Exclude<OrderRecordSectionId, OrderRecordForbiddenSections[M]>[];
} = {
  'to-ship': ['state', 'buyer-note', 'item', 'stages', 'assign', 'labels', 'price', 'note', 'customer', 'facts'],
  pending: ['state', 'buyer-note', 'item', 'stages', 'assign', 'labels', 'price', 'note', 'customer', 'facts'],
  // A held order's job is the pairing; its notes field carries the routing
  // text (`exceptionRowToQueueRow`), so the note editor stays off.
  exceptions: ['state', 'buyer-note', 'resolve', 'item', 'stages', 'assign', 'customer', 'facts'],
  // The shipped archive: what left, who handled each step, where it is now.
  shipped: [
    'state',
    'buyer-note',
    'item',
    'stages',
    'shipment',
    'facts',
    'customer',
    'labels',
    'label-entries',
    'price',
    'note',
    'documents',
    'conversation',
  ],
  // The on-the-phone lookup: returns and replacements are why the caller rang.
  search: [
    'state',
    'buyer-note',
    'item',
    'stages',
    'assign',
    'labels',
    'label-entries',
    'price',
    'note',
    'customer',
    'facts',
  ],
};
