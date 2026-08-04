/**
 * Param ownership for the six receiving surfaces.
 *
 * These routes graduated to first-class paths (`/unbox`, `/triage`, `/incoming`,
 * `/pickup`, `/repair`, `/receiving/history`) — the URL names the operator's job.
 * What they did NOT get is isolation: `applyChildTarget` / `updateMode` copied the
 * whole query string across a mode switch and hand-deleted the keys someone had
 * remembered to list, which is what `MODE_SCOPED_PARAMS` was. This registry
 * replaces the remembering with a declaration.
 *
 * Vocabularies compose their existing SoT (`resolveTriageView`, `parseRepairTab`,
 * `isRepairColumnSort`, `HISTORY_SORT_OPTIONS`) via {@link paramRoundTrip} —
 * never a second copy of the value list.
 *
 * Contract + rationale: `@/lib/routing/route-params`.
 */

import {
  HISTORY_SURFACE_ROUTE,
  INCOMING_SURFACE_ROUTE,
  PICKUP_SURFACE_ROUTE,
  REPAIR_SURFACE_ROUTE,
  TRIAGE_SURFACE_ROUTE,
  UNBOX_SURFACE_ROUTE,
} from '@/lib/receiving/surface-path';
import { RECEIVING_HISTORY_URL_PARAMS } from '@/lib/receiving-history-search';
import { HISTORY_SORT_OPTIONS } from '@/lib/receiving/receiving-modes';
import { parseInboundDeskSort } from '@/lib/receiving/inbound-lane';
import { isRepairColumnSort } from '@/lib/repair/repair-display-sort';
import { parseRepairTab } from '@/lib/walk-in/history-modes';
import { resolveTriageView } from '@/utils/triage-workspace-state';
import type { ReceivingMode } from '@/components/sidebar/receiving/receiving-sidebar-shared';
// Dependency-free vocabulary module (no React, no imports) — safe at this altitude.
import { UNBOX_SIDE_TAB_ORDER } from '@/components/receiving/workspace/line-edit/unbox-side-tabs';
import {
  defineRouteParams,
  paramDateKey,
  paramEnum,
  paramEnumUpper,
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
  // Every receiving route renders `ReceivingSurfacePage` → `RouteShell`, so the
  // mobile pane toggle applies to all six. Without this the hygiene hook that
  // `ReceivingSidebarPanel` mounts stripped `?pane=actions` the moment the
  // operator tapped it.
  'pane',
  // `ReceivingLinesTable` reads `?layout=` and mounts `TableDensityProvider`.
  'layout',
  'density',
  'weekOffset',
] as const;

/** Ambient set for the browse surfaces — a grid, no scan-selected carton. */
const BROWSE_SURFACE_CARRIES = ['staff', 'staffId', 'colsort', 'coldir', 'pane', 'layout', 'density', 'weekOffset'] as const;

/**
 * Server ORDER BY for the two feeds that share the History vocabulary — the
 * `/receiving/history` table and the Unbox workbench's History tab, which mount
 * the same header chrome (`normalizeHistorySort`). Round-tripped against
 * `HISTORY_SORT_OPTIONS` so the list stays in one place.
 */
const historySortParam = () =>
  paramRoundTrip((raw) =>
    HISTORY_SORT_OPTIONS.some((option) => option.id === raw) ? raw : null,
  );

/**
 * `?display=` — round-tripped against `UNBOX_SIDE_TAB_ORDER`, never re-typed.
 *
 * This was a hand-copied `paramEnum([...])` until 2026-08-02, and it drifted the
 * first time the vocabulary grew: `pairing` was added to the side-tab SoT when
 * Package Pairing became a display, but not here — so surface hygiene stripped
 * `?display=pairing` on the very next pass. Every layer above was correct (the
 * chip fired, `setDisplay` built the right URL), and the column simply never
 * opened, from the `# ----` chip, the strip cell, or a shared link alike.
 *
 * That is the exact failure `paramRoundTrip` exists to prevent — a duplicated
 * list is a second SoT.
 */
const unboxDisplayParam = () =>
  paramRoundTrip((raw) => UNBOX_SIDE_TAB_ORDER.find((tab) => tab === raw) ?? null);

/** `/unbox` — the Unbox workspace. */
export const UNBOX_ROUTE_PARAMS = defineRouteParams({
  route: UNBOX_SURFACE_ROUTE,
  owns: {
    /**
     * Workbench tab, on the WIRE. History is the default and omits the param;
     * `viewed` carries the Recent tab (the server-side name for that feed — see
     * `utils/unbox-workspace-state.ts` on the two vocabularies). `recent` is the
     * pre-2026-08-01 wire value for History, kept in the enum so an old link is
     * tolerated rather than stripped; the parser maps it back to History.
     */
    unboxview: paramEnum(['recent', 'queue', 'viewed'] as const),
    /** Inline support-ticket editor toggle — line-scoped, never rides a mode switch. */
    ticketView: paramFlag,
    /** Unbox Claim push column — mutually exclusive with ticketView. */
    claimView: paramFlag,
    /** Claim wizard tab when claimView is on — omit / create = New ticket; link = Link existing. */
    claimMode: paramEnum(['create', 'link'] as const),
    /**
     * Unbox Displays push column — which side display is open. Absence IS
     * closed (no separate flag). Mutually exclusive with ticketView / claimView.
     * NOT `unboxview`, which is the queue/viewed BROWSE tab on this same route.
     */
    display: unboxDisplayParam(),
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
    ulane: paramEnumUpper(['PO_STOCKOUT', 'PO_STANDARD', 'RETURN', 'HOLD'] as const),
    /**
     * KPI-tile row filter (`UnboxChromeKpiCluster` ↔ `ReceivingLinesTable`).
     * Values match filterable metric ids in `unbox-metrics.ts` — informational
     * tiles (`queue-depth`, `oldest-wait`) never write this param.
     */
    ukpi: paramEnum([
      'opened-today',
      'awaiting-test',
      'stuck',
      'priority',
      'viewed-today',
      'unfinished',
    ] as const),
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
    /**
     * History tab search triple (`rh_*`). Same keys as `/receiving/history` and
     * Incoming Docked — Unbox History chrome + drill parent-map footer write
     * `?rh_q=`. Must be owned here or `useSurfaceParamHygiene` strips the query
     * on the next commit (filter flashes then resets).
     */
    [RECEIVING_HISTORY_URL_PARAMS.q]: paramText,
    [RECEIVING_HISTORY_URL_PARAMS.field]: paramEnum([
      'all',
      'po',
      'tracking',
      'sku',
      'product',
      'serial',
    ] as const),
    [RECEIVING_HISTORY_URL_PARAMS.scope]: paramEnum(['all', 'zoho_po', 'unmatched'] as const),
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
  },
  carries: SCAN_SURFACE_CARRIES,
});

/**
 * `/incoming` — Inbound desk: Pipeline (expected/in-transit) + Docked (landed
 * activity, former Receiving Board). `?lane=docked` selects Docked; omit = Pipeline.
 */
export const INCOMING_ROUTE_PARAMS = defineRouteParams({
  route: INCOMING_SURFACE_ROUTE,
  owns: {
    /** Desk lane (`pipeline` default, omitted | `docked`). */
    lane: paramEnum(['pipeline', 'docked'] as const),
    /** Right-pane sub-view (`pos` default | `email` | `removed`) — Pipeline only. */
    incview: paramEnum(['pos', 'email', 'removed'] as const),
    /**
     * Bulk tracking paste filter — canonical keys, comma-joined. Names specific
     * rows, so it deliberately relaxes the lane's own predicate; written only by
     * the bulk-tracking panel.
     */
    tracking_in: paramText,
    /** Delivery-state tile filter. */
    state: paramEnumUpper([
      'DELIVERED_UNOPENED',
      'DELIVERED_NOT_UNBOXED',
      'ARRIVING_TODAY',
      'STALLED',
      'IN_TRANSIT',
      'TRACKING_UNAVAILABLE',
      'PENDING_CARRIER',
      'CARRIER_MISMATCH',
      'AWAITING_TRACKING',
      'WRONG_DESTINATION',
    ] as const),
    /** Source tab (`all` default | `zoho` | `ebay`) — Pipeline only. */
    inbound: paramEnum(['all', 'zoho', 'ebay'] as const),
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
    [RECEIVING_HISTORY_URL_PARAMS.field]: paramEnum([
      'all',
      'po',
      'tracking',
      'sku',
      'product',
      'serial',
    ] as const),
    [RECEIVING_HISTORY_URL_PARAMS.scope]: paramEnum(['all', 'zoho_po', 'unmatched'] as const),
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
    status: paramEnum(['all', 'process', 'draft', 'done'] as const),
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
    [RECEIVING_HISTORY_URL_PARAMS.field]: paramEnum([
      'all',
      'po',
      'tracking',
      'sku',
      'product',
      'serial',
    ] as const),
    [RECEIVING_HISTORY_URL_PARAMS.scope]: paramEnum(['all', 'zoho_po', 'unmatched'] as const),
    /** 1-based page. */
    page: paramPositiveInt,
  },
  carries: BROWSE_SURFACE_CARRIES,
});

/**
 * `/carton/[id]` — the durable READ record for one carton.
 *
 * Not a mode of the six surfaces above: it has no sidebar entry, no scan bar and
 * no queue, so it owns a vocabulary of its own. The registry matches by prefix
 * (`routeParamsFor` accepts `/carton/50354` for a `/carton` spec), so declaring
 * it here is what lets the read record's URL survive the boundary parse rather
 * than being dropped as an unknown key.
 *
 * `carries` is deliberately empty. Every other receiving route carries the scan
 * / browse ambient set because an operator moves between them mid-task; a read
 * record is somewhere you ARRIVE — from search, ⌘K, or a pasted link — so
 * inheriting a previous surface's selection state would be the leak the whole
 * registry exists to stop.
 */
const CARTON_READ_ROUTE_PARAMS = defineRouteParams({
  route: '/carton',
  owns: {
    /**
     * Photo triage open. Durable because `/carton/[id]` exists to be shareable —
     * "look at this box's photos" has to survive a reload and paste into a
     * ticket. The lane and drill INSIDE the panel stay local: those are a
     * reading posture, not an address.
     */
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
