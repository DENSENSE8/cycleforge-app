/**
 * Order-inspector contextual SoT — what the right-rail record inspector opens
 * on, which planes it exposes, and which bulk actions its lane supports.
 *
 * One resolver so the panel, the bulk bar, and the E2E expectations can never
 * disagree about "what does Pending offer". The lifecycle scoping already lived
 * in `useDashboardBulkSelection` as inline `isPrePack` / `isPostPack`
 * predicates; this module is where that decision now lives, and the hook reads
 * from it.
 *
 * **Docs-first on Pending.** The pre-pack queue's first question is "does this
 * order have its shipping label and packing slip yet" — that is what decides
 * whether it can move to Pack at all. Opening on Shipping made the operator pay
 * a tab click on every single row to answer it. Buying / fetching / deleting
 * those documents stays on the Labels station (`documentsMode: 'manage'`); the
 * dashboard only previews (`'preview'`).
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

/** Bulk-action keys, matching `SelectionAction.key` in `useDashboardBulkSelection`. */
export type OrderBulkActionKey =
  | 'copy'
  | 'assign'
  | 'listing-rule'
  | 'ship-by'
  | 'print'
  | 'print-shipping'
  | 'flag'
  | 'export'
  | 'delete';

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
 * Pending / To Ship + the queue slide-over. Docs-first, read-only documents,
 * and a Testing hand-off (the next station for a pre-pack order).
 */
const FULFILLMENT_CONTEXT: OrderInspectorContext = {
  defaultTab: 'documents',
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

/**
 * Bulk-action keys a dashboard lane supports — the SoT the selection bar reads.
 *
 * Pre-pack lanes prep the unit (assign a tester, set a date, print the SKU
 * label); post-pack lanes reprint the shipping document that now exists.
 * `copy` / `export` / `delete` read the rows themselves, so they hold on every
 * lane. `flag` holds on every lane too: a shipped order can still be Damaged,
 * and a triage tag is an annotation on the record rather than a step in the
 * pipeline.
 */
export function orderBulkActionKeys(orderView: DashboardOrderView): readonly OrderBulkActionKey[] {
  const isPostPack = orderView === 'packed' || orderView === 'shipped';
  return isPostPack
    ? ['copy', 'print-shipping', 'flag', 'export', 'delete']
    : ['copy', 'assign', 'listing-rule', 'ship-by', 'print', 'flag', 'export', 'delete'];
}

/** Pending / To Ship — named so specs assert against the registry, not a literal. */
export const PENDING_BULK_ACTION_KEYS = orderBulkActionKeys('unshipped');
