import type { ShippedOrder } from '@/types/orders';
import type { Order } from '@/components/station/upnext/upnext-types';
import type { SearchSelection } from '@/lib/search/search-selection';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
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

/** Browser-side photo refresh signal. */
export function dispatchReceivingPhotoChanged(payload: ReceivingPhotoChangedPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('receiving-photo.changed', { detail: payload }));
  refreshDomains(['receiving.lines', 'receiving.poLines']);
}

/** Merge a single row into the dashboard pending queue cache (no full table refetch). */
function dispatchPendingOrderRowRefetch(orderId: number): void {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(orderId) || orderId <= 0) return;
  window.dispatchEvent(new CustomEvent('dashboard-pending-order-refetch', { detail: { orderId } }));
}

export function dispatchCloseShippedDetails(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('close-shipped-details'));
}

export type ShippedDetailsContext = 'shipped' | 'queue' | 'packed';

interface OpenShippedDetailsPayload {
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
function shouldApplyOpenShippedDetails(
  behavior: string,
  payload: Pick<OpenShippedDetailsPayload, 'context' | 'force'>,
): boolean {
  if (payload.force === true) return true;
  if (behavior === 'side_panel' && payload.context === 'queue') return false;
  return true;
}

type ShippedDetailsNavigationDirection = 'up' | 'down';

function dispatchNavigateShippedDetails(direction: ShippedDetailsNavigationDirection): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('navigate-shipped-details', { detail: { direction } }));
}

// ── SKU Stock (desktop) ─────────────────────────────────────────────────────

/** `GlobalDesktopSkuScanner` listens for this to open camera scan from Quick tools FAB. */
export const SKU_STOCK_DESKTOP_SCAN_EVENT = 'sku-stock:open-desktop-scanner';

function dispatchSkuStockDesktopScanner(): void {
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

/** Right-pane "Start" action — fired from `UpNextActionDock` when the tech commits to working the previewed order. */
interface UpNextActionStartPayload {
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
interface UpNextActionOosPayload {
  orderId: number;
  isOutOfStock: boolean;
}

export function dispatchUpNextActionOos(payload: UpNextActionOosPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('tech-upnext-action-oos-set', { detail: payload }));
}

// ── Receiving right-pane workspace ──────────────────────────────────────────

/** Payload for `receiving-workspace-open`. */
interface ReceivingWorkspaceOpenPayload {
  row: ReceivingLineRow;
  accordionBootstrap: 'default' | 'all';
  scanDriven: boolean;
  /** Whether this open stamps the operator's recents (the Recent tab's feed, `receiving_line_views`). */
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

/** Nav state mirror — sidebar dispatches this whenever `scanMatchedRows` or the current line index changes so the workspace header can… */
interface ReceivingWorkspaceNavStatePayload {
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

/** Close whatever DESK occupant is holding `RightRailHost` on a station page — Add inbound (Incoming add walk), Check receipts… */
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
const DASHBOARD_SHIPPED_FOCUS_SEARCH_PARAM = 'focusShippedSearch';

function dashboardShippedFocusSearchHref(): string {
  const p = new URLSearchParams();
  p.set('shipped', '');
  p.set(DASHBOARD_SHIPPED_FOCUS_SEARCH_PARAM, '1');
  return `/shipping/orders?${p.toString()}`;
}

const OPEN_LISTING_STAFF_RULES_EVENT = 'open-listing-staff-rules';

export function dispatchOpenListingStaffRules(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_LISTING_STAFF_RULES_EVENT));
}

const OPEN_ORDER_PAPERWORK_EVENT = 'open-order-paperwork';

/** The record's Paperwork action (top strip ⋮ or below the details) → the open order record shows its paperwork inline. */
export function dispatchOpenOrderPaperwork(orderId: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<{ orderId: number }>(OPEN_ORDER_PAPERWORK_EVENT, { detail: { orderId } }));
}

export function subscribeOpenOrderPaperwork(handler: (orderId: number) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<{ orderId: number }>).detail.orderId);
  window.addEventListener(OPEN_ORDER_PAPERWORK_EVENT, listener);
  return () => window.removeEventListener(OPEN_ORDER_PAPERWORK_EVENT, listener);
}
