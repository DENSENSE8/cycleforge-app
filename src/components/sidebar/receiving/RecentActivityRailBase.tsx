'use client';

import { useCallback, type ReactNode } from 'react';
import type { PaintSurface } from '@/lib/observability/paint-timing';
import { getStaffName } from '@/utils/staff';
import { getStaffThemeById, stationThemeColors } from '@/utils/staff-colors';
import { Camera, Ticket } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { conditionGradeTableLabel, workflowStatusTableLabel, WORKFLOW_BADGE } from '@/components/station/receiving-constants';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { SidebarRailRowContext } from '@/components/sidebar/SidebarRailShell';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import type { SidebarRailShellProps } from '@/components/sidebar/rail-shell/sidebar-rail-shared';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import type { RailRowActionsResolver } from '@/components/sidebar/rail-shell/rail-row-actions';
import { buildRailRowActions } from '@/lib/receiving/rail/row-actions';
import { shareRailLink } from '@/components/sidebar/rail-shell/rail-row-copy';
import { receivingShareUrl } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import {
  RAIL_ENTRY_RESTORED_EVENT,
  RAIL_LINE_RESTORED_EVENT,
} from '@/components/sidebar/receiving/rail-dismiss';
import {
  RailPeekIdentityFacts,
  type RailPeekFact,
} from '@/components/sidebar/rail-shell/RailPeekIdentityFacts';
import {
  RAIL_PEEK_PAD_CLASS,
} from '@/components/sidebar/rail-shell/rail-peek-chrome';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { useCapabilityProviderLabel } from '@/hooks/useCapabilityProviderLabel';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import {
  fulfillmentModeLabel,
  isLocalPickupFulfillment,
  displayTrackingNumber,
} from '@/lib/receiving/fulfillment-mode';
import { getReceivingStatusDotTip } from '@/lib/receiving/rail/status';
import {
  receivingRailRowTitle,
  type ReceivingRailRowTitleMode,
} from '@/lib/receiving/po-group-title';
import { receivingRailReconcileId } from '@/lib/queries/receiving-queries';
import type { RefreshDomain } from '@/lib/refresh/domains';

export interface ApiResponse {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
  total: number;
}

export interface RecentActivityRailBaseProps {
  /** Refresh domains this rail renders (see `@/lib/refresh/domains`). */
  refreshDomains?: readonly RefreshDomain[];
  /** Currently selected line id — gets a highlight ring so the rail mirrors the workspace. */
  selectedLineId: number | null;
  /** Full selected row, when available — keeps the active line always present. */
  selectedRow?: ReceivingLineRow | null;
  /** Optimistic row pinned at the top until its real row lands (e.g. triage "importing" stub). */
  leadingRow?: ReceivingLineRow | null;
  /** Suppress row clicks while a row is still resolving (e.g. triage importing stub). */
  getRowDisabled?: (row: ReceivingLineRow) => boolean;
  /** Cap on rendered rows. */
  limit?: number;

  queryKey: ReadonlyArray<unknown>;
  fetchFn: () => Promise<ApiResponse>;
  /**
   * This staffer's dismissed row ids — hidden as a pure display filter (not a
   * queryKey discriminator), so loading/changing it re-filters in place instead
   * of blanking the rail. See {@link SidebarRailShellProps.excludedIds}.
   */
  excludedIds?: ReadonlySet<number>;
  /**
   * Client-side keep filter — see {@link SidebarRailShellProps.includeRow}.
   */
  includeRow?: (row: ReceivingLineRow) => boolean;
  /**
   * Cold-reload first-paint seed (Upstash-backed). See
   * {@link SidebarRailShellProps.loadSnapshot} / `persistSnapshot`. Unset = off.
   */
  loadSnapshot?: () => Promise<ReceivingLineRow[] | null>;
  persistSnapshot?: (rows: ReceivingLineRow[]) => void;
  updateEvent?: string;
  /** Optimistic delete event ({ id }); drops the row from the rail immediately. */
  deleteEvent?: string;
  /** Optimistic group-delete event (detail = receiving_id); drops the whole carton's rows. */
  deleteGroupEvent?: string;
  refreshEvents: string[];
  /** prev/next CustomEvent name that steps rail selection — drives header chevrons. */
  navigateEvent?: string;
  /**
   * Per-row ⋮ menu. Unset falls back to the receiving verbs WITHOUT Dismiss —
   * see {@link readOnlyReceivingRowActions}. `ReceivingFeedRail` passes its own,
   * because it is the one node that knows whether the mounted rail has a
   * `staff_rail_exclusions` feed key to dismiss into.
   */
  rowActions?: RailRowActionsResolver<ReceivingLineRow>;

  /** Rail name — the listbox's accessible name; no longer painted as a band. */
  eyebrowTitle: string;
  emptyText?: string;
  autoSelectFirstWhenEmpty?: boolean;
  canAutoSelectFirst?: () => boolean;
  /**
   * Forwarded to the shell. False = strict sort order, no selected-row hoist
   * (the unbox rail sets this so a receive can't bounce a row to the top and
   * back). Defaults to true (preserve the pin) for every other rail.
   */
  pinSelectedLead?: boolean;
  /**
   * When true, keep SQL/fetcher order — shell skips client re-sort by activity.
   * Unboxed sets this so first-open is the only axis.
   */
  preserveServerOrder?: boolean;
  /** First-load stagger motion — forwarded to SidebarRailShell. */
  staggerRevealMotion?: 'slide' | 'rise' | 'sidebar';
  /** Dev/observability: stamp paint timing once the rail leaves skeleton. */
  contentPaintSurface?: PaintSurface;

  /**
   * Timestamp the row's relative-time label reads. MUST match the feed's sort
   * axis or the rail's times read shuffled (e.g. sorted by unbox activity but
   * labeled with door-scan time). Defaults to last_activity_at → created_at.
   * Pass a module-scope (stable-identity) function — the shell wires it into
   * a listener effect.
   */
  getActivityAt?: (row: ReceivingLineRow) => string | null | undefined;
  getStatusDot: (row: ReceivingLineRow) => string;
  getStatusDotLabel?: (row: ReceivingLineRow) => string;
  renderQuantity: (row: ReceivingLineRow) => ReactNode;
  getPreviewQty: (row: ReceivingLineRow) => { current: number; total: number | null };
  /**
   * Optional read-only context node rendered inside the hover popover, beneath
   * the badge row (e.g. the unfound triage exception dot + tooltip). Additive —
   * rails that don't pass it render exactly as before.
   */
  renderPopoverContext?: (row: ReceivingLineRow) => ReactNode;
  /** Row title axis — default `line`; unbox Recent uses `po-group`. */
  rowTitleMode?: ReceivingRailRowTitleMode;
  /**
   * Flag rows that already have a filed claim/ticket (`row.zendesk_ticket`) with
   * an inline ticket chip on the collapsed row + a "Claim ticket" badge in the
   * hover popover — so the operator can scan the rail for POs that already have
   * a problem/ticket applied. Additive; defaults on. Set false to hide.
   */
  showTicketFlag?: boolean;
}

/** Filed claim/ticket number on a line, normalized to a `#NNNN` label; null if none. */
function railTicketNumber(row: ReceivingLineRow): string | null {
  const t = (row.zendesk_ticket ?? '').trim();
  if (!t) return null;
  return t.startsWith('#') ? t : `#${t}`;
}

/**
 * Compact ticket flag on the META (qty) row — inline after qty.
 *
 * Boxed at `h-3` (12px) to match `text-role-micro`'s own computed line-height
 * (`0.625rem` / 1.2 ≈ 12px) — the meta line's actual content height. It used
 * to carry the `h-4` (16px) hit-box sized for the TITLE line's
 * `text-role-caption` (line-height ≈ 16px), a leftover from before the flag
 * moved down to the meta row; a 16px box inline with 12px text stretched
 * every ticketed row 4px taller than its ticket-less neighbours (confirmed in
 * DevTools 2026-08-24: 32.2px vs 28.2px). Every rail row must render at the
 * same height regardless of content — see {@link RailRowBody}'s "one tight
 * recent-rail scale" — so the flag now fits the line it sits on instead of
 * growing it.
 */
function TicketRailFlag({ ticket }: { ticket: string }) {
  return (
    <HoverTooltip label={`Claim ticket ${ticket} filed`} asChild focusable={false}>
      <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded text-orange-700">
        <Ticket className="h-2.5 w-2.5" />
      </span>
    </HoverTooltip>
  );
}

// Stable module-scope callbacks. The shell wires `getId` into its optimistic-
// patch listener effect; passing a fresh arrow each render made that effect
// tear down and re-add its window listener on every parent re-render (a window
// where a `receiving-line-updated` event could be dropped). Hoisting pins the
// identity so the effect subscribes once.
const getRowId = (r: ReceivingLineRow) => r.id;
// Durable render key: carton identity (`client_event_id` / `carton:{receiving_id}`)
// survives stub→real swaps so AnimatePresence updates in place instead of remounting.
const getRowReconcileId = (r: ReceivingLineRow): string | number => receivingRailReconcileId(r);
const getRowGroupId = (r: ReceivingLineRow) => r.receiving_id ?? null;
const getRowActivityAt = (r: ReceivingLineRow) => r.last_activity_at ?? r.created_at;
const selectRow = (r: ReceivingLineRow) => dispatchSelectLine(r);

/** Popover badge tone from the feed-scoped status dot (not raw workflow_status). */
function railStatusBadgeTone(dot: string, fallbackWorkflowStatus: string): string {
  if (dot.includes('emerald')) return 'bg-emerald-100 text-emerald-700';
  if (dot.includes('sky')) return 'bg-sky-100 text-sky-700';
  if (dot.includes('blue')) return 'bg-blue-100 text-blue-700';
  if (dot.includes('indigo')) return 'bg-indigo-100 text-indigo-700';
  if (dot.includes('violet')) return 'bg-violet-100 text-violet-700';
  if (dot.includes('amber')) return 'bg-amber-100 text-amber-700';
  if (dot.includes('teal')) return 'bg-teal-100 text-teal-700';
  if (dot.includes('rose')) return 'bg-rose-100 text-rose-700';
  if (dot.includes('purple')) return 'bg-purple-100 text-purple-700';
  if (dot.includes('slate')) return 'bg-surface-strong text-text-muted';
  return WORKFLOW_BADGE[fallbackWorkflowStatus] ?? 'bg-surface-sunken text-text-muted';
}

/**
 * Receiving row verbs for a rail mounted OUTSIDE `ReceivingFeedRail` — today
 * just the Testing dock. Read verbs only: Hide needs a
 * `staff_rail_exclusions` feed key (`railExclusionFeedKey` covers the two scan
 * surfaces only) and Delete needs the permission gate that lives one level up,
 * so neither is offered here rather than offered broken.
 */
const readOnlyReceivingRowActions: RailRowActionsResolver<ReceivingLineRow> = (row) => {
  const cartonId = Number(row.receiving_id);
  const hasCarton = Number.isFinite(cartonId) && cartonId > 0;
  return buildRailRowActions('receiving', {
    select: null,
    share: hasCarton
      ? () => void shareRailLink(receivingShareUrl(cartonId, row.id), rowShareTitle(row))
      : null,
    hide: null,
    remove: null,
  });
};

/** Share-sheet title for a row — the PO when it has one, else the package id. */
function rowShareTitle(row: ReceivingLineRow): string {
  const po = (row.zoho_purchaseorder_number || '').trim();
  return `Receiving — ${po || `Package #${row.receiving_id}`}`;
}

function canAutoSelectReceivingRailFirst(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('recvId')) return false;
  // Unbox (`receive`, the bare path) and the triage rails (`triage`) auto-select
  // the top of their queue so a mode shows its most-recent item, not an empty
  // background. Each rail only renders in its own mode, so allowing both is safe.
  const m = params.get('mode') ?? 'receive';
  return m === 'receive' || m === 'triage';
}

/**
 * Receiving/Testing recent-activity rail. A thin domain wrapper over the
 * generic {@link SidebarRailShell} — it supplies the ReceivingLineRow row body
 * and hover-preview content; the shell owns the skeleton + interactions.
 */
export function RecentActivityRailBase({
  selectedLineId,
  selectedRow = null,
  leadingRow = null,
  getRowDisabled,
  limit = 25,
  queryKey,
  fetchFn,
  excludedIds,
  includeRow,
  loadSnapshot,
  persistSnapshot,
  updateEvent,
  deleteEvent,
  deleteGroupEvent,
  refreshEvents,
  refreshDomains,
  navigateEvent,
  rowActions,
  eyebrowTitle,
  emptyText,
  autoSelectFirstWhenEmpty = false,
  canAutoSelectFirst: canAutoSelectFirstProp,
  pinSelectedLead = true,
  preserveServerOrder = false,
  staggerRevealMotion,
  contentPaintSurface,
  getActivityAt = getRowActivityAt,
  getStatusDot,
  getStatusDotLabel,
  renderQuantity,
  getPreviewQty,
  renderPopoverContext,
  rowTitleMode = 'line',
  showTicketFlag = true,
}: RecentActivityRailBaseProps) {
  const resolvePlatformMeta = usePlatformMeta();
  const { label: inventoryProviderLabel } = useCapabilityProviderLabel('inventory');
  const rowTitle = useCallback(
    (row: ReceivingLineRow) =>
      receivingRailRowTitle(row, rowTitleMode, (raw) => resolvePlatformMeta(raw).label),
    [rowTitleMode, resolvePlatformMeta],
  );
  /** Short chip label — never the sync tip sentence. */
  const shortStatusLabel = (row: ReceivingLineRow) =>
    getStatusDotLabel?.(row) ?? workflowStatusTableLabel(row.workflow_status || 'EXPECTED');
  /** Dot hover: Unboxed sync tip when coarse UNBOXED, else short label. */
  const statusDotHoverLabel = (row: ReceivingLineRow) =>
    getReceivingStatusDotTip(row, inventoryProviderLabel) ?? shortStatusLabel(row);

  return (
    <SidebarRecentRailBase<ReceivingLineRow>
      queryKey={queryKey}
      fetchFn={async () => (await fetchFn()).receiving_lines ?? []}
      excludedIds={excludedIds}
      includeRow={includeRow}
      loadSnapshot={loadSnapshot}
      persistSnapshot={persistSnapshot}
      updateEvent={updateEvent}
      deleteEvent={deleteEvent}
      deleteGroupEvent={deleteGroupEvent}
      // Undo channels, paired 1:1 with the delete channels above: a dismiss is
      // REVERSIBLE, so the engine's sticky delete-suppression has to be
      // clearable or the row would be refetched and filtered straight back out.
      restoreEvent={deleteEvent ? RAIL_LINE_RESTORED_EVENT : undefined}
      restoreGroupEvent={deleteGroupEvent ? RAIL_ENTRY_RESTORED_EVENT : undefined}
      refreshEvents={refreshEvents}
      refreshDomains={refreshDomains}
      navigateEvent={navigateEvent}
      rowActions={rowActions ?? readOnlyReceivingRowActions}
      selectedId={selectedLineId}
      selectedRow={selectedRow}
      leadingRow={leadingRow}
      getRowDisabled={getRowDisabled}
      limit={limit}
      pinSelectedLead={pinSelectedLead}
      preserveServerOrder={preserveServerOrder}
      staggerRevealMotion={staggerRevealMotion}
      contentPaintSurface={contentPaintSurface}
      getCollapsePinLabel={rowTitle}
      getCollapsePinMeta={(row) => {
        const trk = displayTrackingNumber(row)?.trim();
        if (trk) return trk;
        const po = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
        if (po) return po;
        const sku = (row.sku || '').trim();
        return sku || null;
      }}
      eyebrowTitle={eyebrowTitle}
      emptyText={emptyText}
      autoSelectFirstWhenEmpty={autoSelectFirstWhenEmpty}
      canAutoSelectFirst={
        canAutoSelectFirstProp
          ?? (autoSelectFirstWhenEmpty ? canAutoSelectReceivingRailFirst : undefined)
      }
      getId={getRowId}
      getReconcileId={getRowReconcileId}
      getGroupId={getRowGroupId}
      navRegionId="left"
      getActivityAt={getActivityAt}
      onSelect={selectRow}
      getStatusDot={getStatusDot}
      getStatusDotLabel={statusDotHoverLabel}
      renderRowMain={(row, ctx) => (
        <ReceivingRowMain
          row={row}
          ctx={ctx}
          renderQuantity={renderQuantity}
          title={rowTitle(row)}
          ticket={showTicketFlag ? railTicketNumber(row) : null}
        />
      )}
      renderPopover={(row, p) => (
        <ReceivingPopoverContent
          row={row}
          title={rowTitle(row)}
          groupSize={p.groupSize}
          getQty={getPreviewQty}
          statusDot={getStatusDot(row)}
          statusLabel={shortStatusLabel(row)}
          ticket={showTicketFlag ? railTicketNumber(row) : null}
          contextSlot={renderPopoverContext?.(row)}
        />
      )}
    />
  );
}

function ReceivingRowMain({
  row, ctx, renderQuantity, title, ticket,
}: {
  row: ReceivingLineRow;
  ctx: SidebarRailRowContext;
  renderQuantity: (row: ReceivingLineRow) => ReactNode;
  title: string;
  /** Filed claim/ticket label (`#NNNN`) when this line has one; null hides the flag. */
  ticket: string | null;
}) {
  const techId = row.assigned_tech_id ?? null;
  const techColor = techId ? stationThemeColors[getStaffThemeById(techId)].text : 'text-text-faint';

  // Render identical content whether or not the row is selected — selection is
  // a pure ring/background highlight (see SidebarRailShell). Any size/content
  // difference here would change the row's height and shove its neighbors.
  // Shared row anatomy via `RailRowBody` (`rail` density) — the same primitive
  // the tech Up-Next `OrderCard` renders; only the slot content differs.
  return (
    <RailRowBody
      vm={{
        title,
        titleAttr: title,
        titleAccessory: ctx.pkgChip,
        // Ticket sits on the qty line (right of qty), not the title — keeps the
        // title clean. The flag itself is boxed to the qty line's own height
        // (see TicketRailFlag) so a ticketed row is not taller than its peers.
        meta: (
          <span className="flex min-w-0 items-center gap-1 font-semibold uppercase tracking-widest text-text-soft">
            <span className="truncate">
              {renderQuantity(row)}
              {techId ? <span className={`ml-1 ${techColor}`}>· {getStaffName(techId)}</span> : null}
            </span>
            {ticket ? <TicketRailFlag ticket={ticket} /> : null}
          </span>
        ),
      }}
    />
  );
}

function ReceivingPopoverContent({
  row, title, groupSize, getQty, statusDot, statusLabel, ticket, contextSlot,
}: {
  row: ReceivingLineRow;
  title: string;
  groupSize: number;
  getQty: (row: ReceivingLineRow) => { current: number; total: number | null };
  /** Feed-scoped status dot class — drives the popover badge tone. */
  statusDot: string;
  /** Feed-scoped status label — replaces raw workflow_status in the badge. */
  statusLabel: string;
  /** Filed claim/ticket label (`#NNNN`) when this line has one; null hides the badge. */
  ticket: string | null;
  /** Optional read-only context (e.g. unfound exception dot) under the badges. */
  contextSlot?: ReactNode;
}) {
  const { current: qtyCurrent, total: qtyTotal } = getQty(row);
  const isComplete = qtyTotal != null && qtyTotal > 0 && qtyCurrent >= qtyTotal;

  const condGrade = (row.condition_grade || '').trim().toUpperCase();
  const conditionLabel = conditionGradeTableLabel(row.condition_grade);
  const conditionTone =
    condGrade === 'BRAND_NEW' ? 'bg-yellow-50 text-yellow-700 ring-yellow-200'
      : condGrade === 'USED_A' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
        : condGrade === 'USED_B' ? 'bg-blue-50 text-blue-700 ring-blue-200'
          : condGrade === 'USED_C' ? 'bg-surface-sunken text-text-muted ring-border-default'
            : condGrade === 'PARTS' ? 'bg-orange-50 text-orange-900 ring-orange-200'
              : 'bg-surface-sunken text-text-soft ring-border-soft';

  const workflowLabel = statusLabel;
  const workflowTone = railStatusBadgeTone(
    statusDot,
    String(row.workflow_status || 'EXPECTED').toUpperCase(),
  );

  const skuValue = (row.sku || '').trim();
  const poValue = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
  const serialsCsv = (row.serials ?? []).map((s) => (s.serial_number || '').trim()).filter(Boolean).join(', ');
  const isPickup = isLocalPickupFulfillment(row);
  const pickupLabel = fulfillmentModeLabel(row);
  const displayTrk = displayTrackingNumber(row);
  // Ticket id sans leading `#` — the TicketChip's tone icon already renders `#`.
  const ticketDigits = ticket ? ticket.replace(/^#/, '') : null;

  return (
    <div className={RAIL_PEEK_PAD_CLASS}>
      <div>
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm font-semibold leading-snug text-text-default">{title}</p>
          {groupSize > 1 ? (
            <span className="shrink-0 rounded bg-indigo-100 inset-chip text-role-micro uppercase tracking-widest text-indigo-700">PKG · {groupSize}</span>
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className={`shrink-0 text-role-caption font-semibold tabular-nums ${isComplete ? 'text-emerald-600' : 'text-text-muted'}`}>
            {qtyCurrent}<span className="text-text-faint mx-0.5">/</span><span className="text-text-faint">{qtyTotal ?? '?'}</span>
          </span>
          <span className={`rounded inset-chip text-role-eyebrow uppercase tracking-widest ring-1 ring-inset ${conditionTone}`}>{conditionLabel}</span>
          <span className={`rounded inset-chip text-role-eyebrow uppercase tracking-widest ${workflowTone}`}>{workflowLabel}</span>
          {/* Unfound cartons have no Zoho PO — their RECEIVED state is local-only
              (no Zoho receive). The "No PO" tag marks that the website↔Zoho gap
              is intentional, not a failed sync. */}
          {row.receiving_source === 'unmatched' ? (
            <HoverTooltip label="No matching PO — received locally only" asChild>
              <span className="rounded bg-surface-sunken inset-chip text-role-eyebrow uppercase tracking-widest text-text-soft ring-1 ring-inset ring-border-soft">No PO</span>
            </HoverTooltip>
          ) : null}
          {/* Phase 2: a physically-present box whose Zoho PO already reads
              billed/closed stays in the queue (not hidden) with this badge,
              surfacing the physical-vs-financial mismatch instead of vanishing.
              Skip `received` — it duplicates the green workflow RECEIVED chip. */}
          {['billed', 'closed', 'cancelled', 'rejected'].includes(
            String(row.zoho_status || '').toLowerCase(),
          ) ? (
            <HoverTooltip label={`The inventory system marks this PO "${row.zoho_status}" — already received/closed upstream, but the box is still here to unbox`} asChild>
              <span className="rounded bg-amber-100 inset-chip text-role-eyebrow uppercase tracking-widest text-amber-700 ring-1 ring-inset ring-amber-200">PO: {String(row.zoho_status)}</span>
            </HoverTooltip>
          ) : null}
          {row.needs_test ? (
            <span className="rounded bg-orange-100 inset-chip text-role-eyebrow uppercase tracking-widest text-orange-700">Test</span>
          ) : null}
          {pickupLabel ? (
            <span className="rounded bg-emerald-50 inset-chip text-role-eyebrow uppercase tracking-widest text-emerald-700 ring-1 ring-inset ring-emerald-200">
              {pickupLabel}
            </span>
          ) : null}
          <HoverTooltip
            label={`Photos ${row.photo_count ?? 0}`}
            asChild
          >
            <span
              className={`ml-auto inline-flex items-center gap-1 rounded inset-chip text-role-eyebrow uppercase tracking-widest ${
                (row.photo_count ?? 0) > 0 ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200' : 'bg-surface-canvas text-text-faint ring-1 ring-inset ring-border-soft'
              }`}
            >
              <Camera className="h-3 w-3" />
              {row.photo_count ?? 0}
            </span>
          </HoverTooltip>
        </div>
      </div>

      {contextSlot ? <div className="mt-2.5">{contextSlot}</div> : null}

      {/* Identity: order · tracking header + stacked sku / serial / ticket.
          Shared SoT with RailPeekCard — never a local flex-wrap twin. */}
      <RailPeekIdentityFacts
        facts={([
          {
            tone: 'order',
            // Unfound / unmatched cartons have no PO — keep the top-row order
            // slot with a quiet placeholder so tracking stays justify-between end.
            value: poValue,
            keepEmpty: true,
            platformValue: row.source_platform_pill || row.source_platform,
          },
          ...(isPickup
            ? []
            : [{
                tone: 'tracking' as const,
                value: displayTrk ?? '',
                carrierHint: row.carrier,
              }]),
          { tone: 'sku', value: skuValue },
          // Omit empty serial — no `----` placeholder row in the peek.
          { tone: 'serial', value: serialsCsv },
          ...(ticketDigits
            ? [{ tone: 'ticket' as const, value: ticketDigits, display: ticketDigits }]
            : []),
        ] satisfies RailPeekFact[])}
        headerRight={isPickup ? <FulfillmentPickupPill /> : undefined}
      />
    </div>
  );
}
