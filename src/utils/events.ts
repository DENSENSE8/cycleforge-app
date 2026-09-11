import type { ShippedOrder } from '@/types/orders';
import type { Order } from '@/components/station/upnext/upnext-types';
import type { SearchSelection } from '@/lib/search/search-selection';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ReceivingDetailsLog } from '@/components/station/receiving-details-log';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';

export function dispatchDashboardAndStationRefresh(): void {
  if (typeof window === 'undefined') return;
  refreshDomains(REFRESH_BUNDLES.outboundOrderWrite);
}

export interface ReceivingPhotoChangedPayload {
  action: 'delete' | 'upload' | 'insert' | 'update';
  photoIds?: number[];
  receivingId?: number | null;
  receivingLineIds?: number[];
  totalPhotoCount?: number | null;
}

/**
 * Browser-side photo refresh signal.
 *
 * The `receiving-photo.changed` name matches the realtime event used by the
 * receiving surfaces, while `app-refresh-data` keeps the existing tables in
 * sync immediately after a library delete.
 */
export function dispatchReceivingPhotoChanged(payload: ReceivingPhotoChangedPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('receiving-photo.changed', { detail: payload }));
  refreshDomains(['receiving.lines', 'receiving.poLines']);
}

/** Merge a single row into the dashboard pending queue cache (no full table refetch). */
export function dispatchPendingOrderRowRefetch(orderId: number): void {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(orderId) || orderId <= 0) return;
  window.dispatchEvent(new CustomEvent('dashboard-pending-order-refetch', { detail: { orderId } }));
}

export function dispatchCloseShippedDetails(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('close-shipped-details'));
}

export type ShippedDetailsContext = 'shipped' | 'queue' | 'packed';

export interface OpenShippedDetailsPayload {
  order: ShippedOrder;
  context?: ShippedDetailsContext;
  /**
   * Explicit operator action (gutter "More information"). Always open, even
   * when queue-body clicks are suppressed (`side_panel` preference).
   */
  force?: boolean;
}

export function dispatchOpenShippedDetails(
  order: ShippedOrder,
  context?: ShippedDetailsContext,
  opts?: { force?: boolean },
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('open-shipped-details', {
      detail: { order, context, force: opts?.force === true },
    }),
  );
}

export function getOpenShippedDetailsPayload(detail: unknown): OpenShippedDetailsPayload | null {
  if (!detail || typeof detail !== 'object') return null;

  const payload = detail as {
    order?: ShippedOrder;
    context?: ShippedDetailsContext;
    force?: boolean;
  };
  if (payload.order && typeof payload.order === 'object') {
    return {
      order: payload.order,
      context: payload.context,
      force: payload.force === true,
    };
  }

  return { order: detail as ShippedOrder };
}

/**
 * Queue-body clicks stay suppressed in `side_panel` mode. An explicit
 * operator action (`force`, gutter "More information") always opens.
 */
export function shouldApplyOpenShippedDetails(
  behavior: string,
  payload: Pick<OpenShippedDetailsPayload, 'context' | 'force'>,
): boolean {
  if (payload.force === true) return true;
  if (behavior === 'side_panel' && payload.context === 'queue') return false;
  return true;
}

export type ShippedDetailsNavigationDirection = 'up' | 'down';

export function dispatchNavigateShippedDetails(direction: ShippedDetailsNavigationDirection): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('navigate-shipped-details', { detail: { direction } }));
}

// ── SKU Stock (desktop) ─────────────────────────────────────────────────────

/** `GlobalDesktopSkuScanner` listens for this to open camera scan from Quick tools FAB. */
export const SKU_STOCK_DESKTOP_SCAN_EVENT = 'sku-stock:open-desktop-scanner';

export function dispatchSkuStockDesktopScanner(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SKU_STOCK_DESKTOP_SCAN_EVENT));
}

// ── Tech Up Next preview (right-pane workspace) ─────────────────────────────

/**
 * Selected Up Next item to preview in the `/tech` right pane. `null` clears
 * the preview and returns the pane to the global history (or the active-order
 * workspace, if one is in progress).
 */
export type UpNextPreviewPayload =
  | { kind: 'order'; order: Order }
  | { kind: 'find'; sel: SearchSelection }
  | null;

export function dispatchUpNextPreview(payload: UpNextPreviewPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('tech-upnext-preview', { detail: payload }));
}

/**
 * Right-pane "Start" action — fired from `UpNextActionDock` when the tech
 * commits to working the previewed order. `UpNextOrder` listens and routes
 * to its existing `handleStart` so the API call + parent side-effects
 * (clear active order, kick off scan resolver) match a sidebar Start.
 */
export interface UpNextActionStartPayload {
  orderId: number;
  shipping_tracking_number: string;
  order_id: string;
}

export function dispatchUpNextActionStart(payload: UpNextActionStartPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('tech-upnext-action-start', { detail: payload }));
}

/**
 * Right-pane "Out of stock" toggle — `UpNextOrder` routes this to
 * `handleMissingParts`, which POSTs `isOutOfStock` and refreshes the queue.
 */
export interface UpNextActionOosPayload {
  orderId: number;
  isOutOfStock: boolean;
}

export function dispatchUpNextActionOos(payload: UpNextActionOosPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('tech-upnext-action-oos-set', { detail: payload }));
}

// ── Receiving right-pane workspace ──────────────────────────────────────────

/**
 * Payload for `receiving-workspace-open`. The sidebar dispatches this whenever
 * a line is selected (via row click, scan resolution, or sidebar prev/next nav)
 * so the right pane can swap from history table → focused workspace.
 *
 * - `accordionBootstrap: 'all'` opens every FlowSection on mount (used after a
 *   table row click where the operator is inspecting the full record).
 * - `scanDriven: true` puts LineEditPanel in its compact density mode (matches
 *   today's sidebar behavior for scan-resolved lines).
 */
export interface ReceivingWorkspaceOpenPayload {
  row: ReceivingLineRow;
  accordionBootstrap: 'default' | 'all';
  scanDriven: boolean;
  /**
   * Whether this open stamps the operator's recents (the Recent tab's feed,
   * `receiving_line_views`). Omitted = true, which is every path that predates
   * the Unbox feed's click-to-open: scan resolve, recent rail, sibling PO line,
   * deep-link restore. See `readSelectLineDetail`.
   */
  recordView?: boolean;
  /**
   * Preview stance — open the pane for reading only. It paints as a scan's open
   * does, but is inert and wrote nothing. Implies `recordView: false`.
   */
  preview?: boolean;
}

export function dispatchReceivingWorkspaceOpen(
  payload: ReceivingWorkspaceOpenPayload,
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('receiving-workspace-open', { detail: payload }),
  );
}

export function dispatchReceivingWorkspaceClose(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('receiving-workspace-close'));
}

/**
 * Open Package Pairing on the PO tab (search + LINK). Hosts expand the pairing
 * hub first, then dispatch so {@link CartonMatchHub} can select `zoho_po` and
 * scroll into view — same waist as `receiving-open-pairing-add` (Store tab).
 */
export const RECEIVING_OPEN_PAIRING_PO_EVENT = 'receiving-open-pairing-po';

export function dispatchReceivingOpenPairingPo(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RECEIVING_OPEN_PAIRING_PO_EVENT));
}

/**
 * Nav state mirror — sidebar dispatches this whenever `scanMatchedRows` or the
 * current line index changes so the workspace header can render Prev/Next
 * chevrons + Line N of M without lifting the scanMatchedRows array up. The
 * actual prev/next handlers still live in the sidebar (they trigger
 * `receiving-select-line` via `dispatchSelectLine`).
 */
export interface ReceivingWorkspaceNavStatePayload {
  currentIndex: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
}

export function dispatchReceivingWorkspaceNavState(
  payload: ReceivingWorkspaceNavStatePayload,
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('receiving-workspace-nav-state', { detail: payload }),
  );
}

export type ReceivingDetailsOverlayDetail = {
  receivingId: number;
  /** Row/list fields for instant overlay render before the enrich fetch lands. */
  seed?: Partial<ReceivingDetailsLog>;
};

/**
 * Open the Incoming connection details panel (PO / inbound / shipment) on the
 * receiving right rail — same inspector Incoming mode uses. Dispatched from
 * Unbox/Triage order-chip "Details" so connection CRUD is available without
 * leaving the station workspace.
 *
 * Listener: {@link useReceivingDetailOverlays}. Mount: {@link ReceivingRightPane}.
 */
export const RECEIVING_OPEN_INCOMING_DETAILS_EVENT = 'receiving-open-incoming-details';

export type ReceivingOpenIncomingDetailsDetail = {
  poId: string | null;
  poNumber: string | null;
  shipmentId?: number | null;
  inboundSourceType?: string | null;
  inboundSourceOrderId?: string | null;
  /** Open Unbox/Triage carton — details API prefers this receiving row for notes/shipment. */
  receivingId?: number | null;
  /** Active receiving_line id — PoTab highlights the matching line item. */
  receivingLineId?: number | null;
};

export function dispatchReceivingOpenIncomingDetails(
  detail: ReceivingOpenIncomingDetailsDetail,
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(RECEIVING_OPEN_INCOMING_DETAILS_EVENT, { detail }),
  );
}

/**
 * Open the Unbox History carton triage slide-over (`detail:history`).
 * Left-click on History rows dispatches this; double-click still opens
 * LineEditPanel via `dispatchSelectLine`.
 *
 * Listener: {@link useReceivingDetailOverlays}. Mount: {@link ReceivingRightPane}.
 */
export function dispatchReceivingOpenHistoryTriage(detail: {
  receivingId: number;
  receivingLineId?: number | null;
  poNumber?: string | null;
  title?: string | null;
  tracking?: string | null;
  status?: string | null;
}): void {
  emitReceiving('receiving-open-history-triage', detail);
}

export function dispatchReceivingCloseHistoryTriage(): void {
  emitReceiving('receiving-close-history-triage');
}

/**
 * Open event for `ReceivingDetailsStack` (`receiving-open-details-overlay`).
 * Observe openers navigate to `/carton/[id]` instead; the dashboard listener
 * remains for any residual custom-event opens. Ticket mutual-exclusion still
 * closes via {@link dispatchReceivingDetailsOverlayClose}.
 */

/**
 * Close the receiving details float (`detail:receiving`). Dispatched when Unbox
 * Ticket (`?ticketView=1`), Claim (`?claimView=1`), or a tool push (move photos /
 * photo note / audit) opens so details and the station push column stay mutually
 * exclusive (one coherent right-edge surface).
 */
export function dispatchReceivingDetailsOverlayClose(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('receiving-close-details-overlay'));
}

/**
 * Close the global assistant dock (header Sparkles / ⌘J).
 * Unbox station push openers dispatch this so AI and Ticket/Claim/Displays/tool
 * cannot both occupy a full right column (source-of-truth → Right-rail modality).
 */
export const ASSISTANT_DOCK_CLOSE_EVENT = 'assistant-dock-close';

/** Fired when the assistant dock transitions closed→open (Sparkles / ⌘J). */
export const ASSISTANT_DOCK_OPEN_EVENT = 'assistant-dock-open';

export function dispatchAssistantDockClose(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ASSISTANT_DOCK_CLOSE_EVENT));
}

export function dispatchAssistantDockOpen(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ASSISTANT_DOCK_OPEN_EVENT));
}

/**
 * Close whatever DESK occupant is holding `RightRailHost` on a station page —
 * Add inbound (Incoming add walk), Check receipts
 * (`IncomingBulkTrackingPanel`), and any future Band-1 tool that mounts there.
 *
 * Dispatched when Station Displays open, so a desk occupant and the station's
 * Displays column never both push the right edge (source-of-truth →
 * Right-rail modality · one wrapper). The twin direction is
 * `yieldStationRightEdgeForDeskOccupant`, which the occupant calls as it opens.
 *
 * **Named for the ROLE, not for one panel** (renamed from
 * `INCOMING_ADD_INBOUND_CLOSE_EVENT` 2026-08-10): while it named a single
 * overlay, the second occupant to arrive — Check — silently did not join the
 * wrapper, and shipped as a second full right column beside Displays.
 * The wire value is unchanged so nothing in flight breaks.
 */
export const STATION_DESK_OCCUPANT_CLOSE_EVENT = 'incoming-add-inbound-close';

export function dispatchStationDeskOccupantClose(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STATION_DESK_OCCUPANT_CLOSE_EVENT));
}

/**
 * Close Arrival (and any station) Displays push that is React-state owned, not
 * URL `?display=`. Add inbound dispatches this before claiming RightRailHost.
 */
export const STATION_DISPLAYS_CLOSE_EVENT = 'station-displays-close';

export function dispatchStationDisplaysClose(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STATION_DISPLAYS_CLOSE_EVENT));
}

// ── Dashboard shipped search ─────────────────────────────────────────────────

/** When `=1`, embedded Shipped sidebar focuses search, then strips this param from the URL. */
export const DASHBOARD_SHIPPED_FOCUS_SEARCH_PARAM = 'focusShippedSearch';

export function dashboardShippedFocusSearchHref(): string {
  const p = new URLSearchParams();
  p.set('shipped', '');
  p.set(DASHBOARD_SHIPPED_FOCUS_SEARCH_PARAM, '1');
  return `/shipping/orders?${p.toString()}`;
}

export const OPEN_LISTING_STAFF_RULES_EVENT = 'open-listing-staff-rules';

export function dispatchOpenListingStaffRules(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_LISTING_STAFF_RULES_EVENT));
}
