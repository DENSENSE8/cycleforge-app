/**
 * Order-inspector contextual SoT — what the right-rail record inspector opens
 * on and which planes it exposes.
 *
 * One resolver so every mount of the shared inspector agrees about "what does
 * Pending open on". It does NOT decide which verbs a lane offers: that is row
 * state, read by the family verb catalog (`@/lib/selection/order-verb-state`).
 * The action list that used to live here was deleted 2026-09-05 — see the note
 * at the foot of this file.
 *
 * **To-ship row body does not open the inspector** (checkbox + column-foot
 * own the desk). When the rail does open, seed Shipping — not Documents —
 * so a Documents right-rail / slide-over is not the first paint. Buying /
 * fetching / deleting documents stays on the Labels station
 * (`documentsMode: 'manage'`); the dashboard only previews (`'preview'`).
 */

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

/**
 * How the Documents plane behaves:
 * - `manage` — full tray (buy / fetch / upload / delete). Labels station only.
 * - `preview` — read-only list + the slide-over previewer.
 * - `hidden` — no Documents tab on this surface.
 */
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

/**
 * Pending / To Ship + the queue slide-over. Shipping-first (not Documents) —
 * row click no longer opens the inspector on To-ship; when the rail does open
 * (deep link, Labels walk), Documents is available but not the seed leaf.
 * Buying / fetching / deleting those documents stays on the Labels station
 * (`documentsMode: 'manage'`); the dashboard only previews (`'preview'`).
 */
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

/*
 * `orderBulkActionKeys` / `PENDING_BULK_ACTION_KEYS` / `OrderBulkActionKey` were
 * DELETED here on 2026-09-05.
 *
 * They were the hardcoded per-lane action list `TABLE_ENGINE_LAW.verbsBindToFields`
 * forbids: "A hardcoded per-lane key list is a fork of the catalog." The
 * distinction they encoded was real — pre-pack lanes prep the unit, post-pack
 * lanes reprint the shipping document — but it is a fact about the ROW's
 * lifecycle, not about the route, and every row already carries it. It now lives
 * in `@/lib/selection/order-verb-state` as predicates the verb catalog binds
 * (`isInBuilding`, `hasShippingPaperwork`), so a new outbound surface inherits
 * the right verbs with no list to update.
 *
 * This module keeps the INSPECTOR context, which is a different question (which
 * planes a panel opens on). Do not re-add an action list here.
 */
