/** Param ownership for the six receiving surfaces. */

import {
  HISTORY_SURFACE_ROUTE,
  INCOMING_SURFACE_ROUTE,
  PICKUP_SURFACE_ROUTE,
  REPAIR_SURFACE_ROUTE,
  TRIAGE_SURFACE_ROUTE,
  UNBOX_SURFACE_ROUTE,
} from '@/lib/receiving/surface-path';
import {
  RECEIVING_HISTORY_URL_PARAMS,
  parseReceivingHistorySearchFieldWire,
  parseReceivingHistorySearchScopeWire,
} from '@/lib/receiving-history-search';
import { HISTORY_SORT_WIRE_IDS } from '@/lib/receiving/receiving-modes';
import { parseInboundDeskSort } from '@/lib/receiving/inbound-lane';
import { parseIncomingViewWire } from '@/lib/receiving/incoming-view';
import { parseIncomingDeliveryStateWire } from '@/lib/receiving/incoming-delivery-state-face';
import { parseUnboxKpiFilterWire } from '@/lib/receiving/unbox-metrics';
import { parseTriageLaneWire } from '@/lib/receiving/triage-lane-policy';
import { parsePickupStatusTabWire } from '@/lib/local-pickup/order-status';
import { isRepairColumnSort } from '@/lib/repair/repair-display-sort';
import { parseRepairTab } from '@/lib/walk-in/history-modes';
import { resolveTriageView } from '@/utils/triage-workspace-state';
import { parseUnboxViewWire } from '@/utils/unbox-workspace-state';
import type { ReceivingMode } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import {
  defineRouteParams,
  paramDateKey,
  paramEnum,
  paramFlag,
  paramPositiveInt,
  paramRoundTrip,
  paramText,
  type RouteParamsSpec,
} from './route-params';

/** Ambient set shared by the two scan surfaces (Unbox + Triage). */
const SCAN_SURFACE_CARRIES = [
  'staff',
  'staffId',
  'recvId',
  'lineId',
  'openReceivingId',
  'colsort',
  'coldir',
  // Every receiving route renders `ReceivingSurfacePage` → `RouteShell`, so the mobile pane toggle applies to all six.
  'pane',
  'layout',
  'weekOffset',
] as const;

/** Ambient set for the browse surfaces — a grid, no scan-selected carton. */
const BROWSE_SURFACE_CARRIES = ['staff', 'staffId', 'colsort', 'coldir', 'pane', 'layout', 'weekOffset'] as const;

/** Server ORDER BY for the two feeds that share the History vocabulary — the `/receiving/history` table and the Unbox workbench's History… */
const historySortParam = () =>
  paramRoundTrip((raw) =>
    (HISTORY_SORT_WIRE_IDS as readonly string[]).includes(raw) ? raw : null,
  );

/** `?unboxview=` — round-tripped via {@link parseUnboxViewWire}. */
const unboxViewParam = () => paramRoundTrip(parseUnboxViewWire);

const historySearchFieldParam = () => paramRoundTrip(parseReceivingHistorySearchFieldWire);
const historySearchScopeParam = () => paramRoundTrip(parseReceivingHistorySearchScopeWire);

/** `/unbox` — the Unbox workspace. */
export const UNBOX_ROUTE_PARAMS = defineRouteParams({
  route: UNBOX_SURFACE_ROUTE,
  owns: {
    /**
     * Workbench tab, on the WIRE. Queue is the default and omits the param;
     * `history` / `incoming` / `viewed` (Recent) / `all` write explicit values
     * — see `utils/unbox-workspace-state.ts`. Never a hand-copied enum.
     */
    unboxview: unboxViewParam(),
    /**
     * Desk mode — workbench tables after Back to list. Absent = station-first
     * (MRU carton or empty scan bench). See `unbox-selection-url.ts`.
     */
    unboxdesk: paramFlag,
    /** Server ORDER BY for the History tab (`UnboxWorkspaceHeader` reads + writes it). */
    sort: historySortParam(),
    /** Stock-image preview for the photo peek — no NAS captures needed. */
    photoPeekDemo: paramFlag,
    /**
     * Queue readiness facet — `staged` (shelf+lane) / `unstaged`. Omitted = all.
     * Only meaningful on the Queue tab; surface hygiene keeps it across tab flips
     * so returning to Queue restores the filter.
     */
    ustage: paramEnum(['staged', 'unstaged'] as const),
    /** Queue priority-lane facet — triage lane values. Omitted = all lanes. */
    ulane: paramRoundTrip(parseTriageLaneWire),
    /**
     * Unbox Urgent tab (`?unboxview=urgent`) — narrows the door queue to
     * explicit priority cartons. Written by `normalizeUnboxViewParams`;
     * cleared when leaving Urgent. Same key Testing Urgent uses on its feeds.
     */
    priority_only: paramFlag,
    /**
     * KPI-tile row filter (`UnboxChromeKpiCluster` ↔ `ReceivingLinesTable`).
     * Values match filterable metric ids in `unbox-metrics.ts` — informational
     * tiles (`queue-depth`, `oldest-wait`) never write this param.
     */
    ukpi: paramRoundTrip(parseUnboxKpiFilterWire),
    /** Band 2 KPI canvas time window (`UnboxKpiCanvas`). Default 7d when omitted. */
    urange: paramEnum(['24h', '7d', '30d', '90d'] as const),
    /** Band 2 KPI canvas viz mode — tiles · bars · pie · line. Default pie. */
    uviz: paramEnum(['tiles', 'bars', 'pie', 'line'] as const),
    /**
     * TradingView-like compare layout — `single` (default, omitted) · `split`
     * · `quad`. Pane recipes ride `c0`…`c3`.
     */
    clayout: paramEnum(['single', 'split', 'quad'] as const),
    c0: paramText,
    c1: paramText,
    c2: paramText,
    c3: paramText,
    /**
     * History linked parent→child drill vs folded list. Default (omitted) =
     * list (classic single PO-fold grid). `drill` opts into linked dual panes.
     * Orthogonal to `clayout` compare.
     */
    hlayout: paramEnum(['drill', 'list'] as const),
    /** Selected PO-group key while History drill is active (`po:…` / `src:…` / `line:…`). */
    drillPo: paramText,
    /** History tab search triple (`rh_*`). */
    [RECEIVING_HISTORY_URL_PARAMS.q]: paramText,
    [RECEIVING_HISTORY_URL_PARAMS.field]: historySearchFieldParam(),
    [RECEIVING_HISTORY_URL_PARAMS.scope]: historySearchScopeParam(),
    /**
     * Station composer destination — `label` (default, omitted) · `ticket`.
     * Shared with Testing (`SHARED_OWNED_KEYS.composerMode`).
     */
    composerMode: paramEnum(['unbox', 'ticket', 'label'] as const),
    /**
     * History / Inbound tab record plane — the open row's `receiving_line` id
     * (negative for a lineless unfound carton). `DeskRecordPlane` shows it in
     * place of the list, or beside it when the staffer chose fullscreen.
     */
    openLine: paramText,
  },
  carries: SCAN_SURFACE_CARRIES,
});

/** `/triage` — Arrival (dock scan / identify before unboxing). */
export const TRIAGE_ROUTE_PARAMS = defineRouteParams({
  route: TRIAGE_SURFACE_ROUTE,
  owns: {
    /** Workbench tab (`triage` default | `found` | `unfound` | `done`). */
    triview: paramRoundTrip(resolveTriageView),
    /** Carton-list filter — finds a carton already scanned in, not a Zoho search. */
    triq: paramText,
    /** Unfound queue filters, scoped to the Unfound tab. */
    uf_q: paramText,
    uf_kind: paramText,
    /** Station composer destination — Arrival mounts the same notes dock. */
    composerMode: paramEnum(['unbox', 'ticket', 'label'] as const),
  },
  carries: SCAN_SURFACE_CARRIES,
});

/**
 * `/incoming` — Inbound desk: Pipeline (expected/in-transit) + Docked (landed
 * activity, former Receiving Board). `?lane=docked` selects Docked; omit =
 * Pipeline. Retired PO Mailbox links fall back to the delivery ledger.
 */
export const INCOMING_ROUTE_PARAMS = defineRouteParams({
  route: INCOMING_SURFACE_ROUTE,
  owns: {
    /** Desk lane (`pipeline` default, omitted | `docked`). */
    lane: paramEnum(['pipeline', 'docked'] as const),
    /** Retired Incoming collection face (`pos` only). Hygiene strips leftovers. */
    incview: paramRoundTrip(parseIncomingViewWire),
    /**
     * Bulk tracking paste filter — canonical keys, comma-joined. Names specific
     * rows, so it deliberately relaxes the lane's own predicate; written only by
     * the bulk-tracking panel.
     */
    tracking_in: paramText,
    /** Delivery-state tile filter. */
    state: paramRoundTrip(parseIncomingDeliveryStateWire),
    /** Source filter (`all` default | `zoho` | `ebay` | `amazon` | `manual`) — Pipeline. */
    inbound: paramEnum(['all', 'zoho', 'ebay', 'amazon', 'manual'] as const),
    /** Intake kind filter (`all` omitted | `purchase` | `return`) — Pipeline. */
    inkind: paramEnum(['all', 'purchase', 'return'] as const),
    /** Returns CSV/TSV staging owns the desk centre while set. */
    import: paramEnum(['csv'] as const),
    /**
     * Server ORDER BY — Pipeline ∪ Docked union so hygiene does not strip the
     * other lane’s sort on a deep link. Lane switch clears the incompatible id
     * via `clearCrossLaneParams`.
     */
    sort: paramRoundTrip(parseInboundDeskSort),
    /** PO purchase-date range → `zoho_po_mirror.po_date`. Civil day keys. */
    po_from: paramDateKey,
    po_to: paramDateKey,
    /** 1-based page (`INCOMING_PAGE_SIZE` rows). Page 1 is omitted. */
    page: paramPositiveInt,
    /** Shared receiving search box. */
    [RECEIVING_HISTORY_URL_PARAMS.q]: paramText,
    /** Docked (history) search field / carton-source scope. */
    [RECEIVING_HISTORY_URL_PARAMS.field]: historySearchFieldParam(),
    [RECEIVING_HISTORY_URL_PARAMS.scope]: historySearchScopeParam(),
    /**
     * Record plane — the open row's `receiving_line` id on either lane.
     * `DeskRecordPlane` shows it in place of the list, or beside it when the
     * staffer chose fullscreen; a reload restores it.
     */
    openLine: paramText,
  },
  carries: BROWSE_SURFACE_CARRIES,
});

/** `/pickup` — Local Pickup (LCPU) orders. */
const PICKUP_ROUTE_PARAMS = defineRouteParams({
  route: PICKUP_SURFACE_ROUTE,
  owns: {
    /** Selected local-pickup order id. */
    lcpu: paramPositiveInt,
    /** Status tab over the pickup lines. */
    status: paramRoundTrip(parsePickupStatusTabWire),
    /** Pickup's own list filter (distinct from History's namespaced `rh_q`). */
    q: paramText,
  },
  carries: BROWSE_SURFACE_CARRIES,
});

/** `/repair` — repair intake + queue. */
const REPAIR_ROUTE_PARAMS = defineRouteParams({
  route: REPAIR_SURFACE_ROUTE,
  owns: {
    /** Queue tab (`active` default | `incoming` | `done`). */
    tab: paramRoundTrip(parseRepairTab),
    /** Open the intake form on arrival. */
    new: paramEnum(['true'] as const),
    /** Deep-link a repair order open. */
    openRepair: paramPositiveInt,
    /** Queue search box. */
    search: paramText,
    /** Display sort — `newest` or a grid column key (SoT: repair-display-sort). */
    sort: paramRoundTrip((raw) => (raw === 'newest' || isRepairColumnSort(raw) ? raw : null)),
    dir: paramEnum(['asc', 'desc'] as const),
  },
  carries: BROWSE_SURFACE_CARRIES,
});

/** `/receiving/history` — the unboxed-carton history feed. */
export const HISTORY_ROUTE_PARAMS = defineRouteParams({
  route: HISTORY_SURFACE_ROUTE,
  owns: {
    /** Server ORDER BY — the lifecycle timestamp day-banding keys off. */
    sort: historySortParam(),
    dir: paramEnum(['asc', 'desc'] as const),
    /** History's own namespaced search triple (`rh_*`). */
    [RECEIVING_HISTORY_URL_PARAMS.q]: paramText,
    [RECEIVING_HISTORY_URL_PARAMS.field]: historySearchFieldParam(),
    [RECEIVING_HISTORY_URL_PARAMS.scope]: historySearchScopeParam(),
    /** 1-based page. */
    page: paramPositiveInt,
  },
  carries: BROWSE_SURFACE_CARRIES,
});

/** `/carton/[id]` — the durable READ record for one carton. */
const CARTON_READ_ROUTE_PARAMS = defineRouteParams({
  route: '/carton',
  owns: {
    /** Photo triage open. */
    photos: paramFlag,
  },
  carries: [],
});

/**
 * Sidebar mode id → the spec for the route that mode lands on. The one mapping;
 * `useReceivingMode` reads its target route from here rather than keeping a
 * second `mode → path` ladder that could drift out of step with the specs.
 */
export const RECEIVING_MODE_ROUTE_PARAMS = {
  receive: UNBOX_ROUTE_PARAMS,
  triage: TRIAGE_ROUTE_PARAMS,
  incoming: INCOMING_ROUTE_PARAMS,
  pickup: PICKUP_ROUTE_PARAMS,
  repair: REPAIR_ROUTE_PARAMS,
  history: HISTORY_ROUTE_PARAMS,
} as const satisfies Record<ReceivingMode, RouteParamsSpec>;

/**
 * Every receiving route spec. Resolution order is the registry's job
 * (`@/lib/routing/registry` sorts longest-route-first so `/receiving/history`
 * beats any `/receiving` prefix) — there is one resolver, not one per family.
 */
export const RECEIVING_ROUTE_PARAMS: readonly RouteParamsSpec[] = [
  UNBOX_ROUTE_PARAMS,
  TRIAGE_ROUTE_PARAMS,
  INCOMING_ROUTE_PARAMS,
  PICKUP_ROUTE_PARAMS,
  REPAIR_ROUTE_PARAMS,
  HISTORY_ROUTE_PARAMS,
  CARTON_READ_ROUTE_PARAMS,
];
