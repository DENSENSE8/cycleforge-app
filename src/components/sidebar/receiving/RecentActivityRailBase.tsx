'use client';

import type { ReactNode } from 'react';
import type { PaintSurface } from '@/lib/observability/paint-timing';
import { motion } from 'framer-motion';
import { motionBezier } from '@/design-system/foundations/motion-framer';
import { getStaffName } from '@/utils/staff';
import { getStaffThemeById, stationThemeColors } from '@/utils/staff-colors';
import { Camera, Ticket } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives';
import { conditionGradeTableLabel, workflowStatusTableLabel, WORKFLOW_BADGE } from '@/components/station/receiving-constants';
import {
  OrderIdChip, TrackingChip, SkuScanRefChip, SerialChip, TicketChip, getLast4,
} from '@/components/ui/CopyChip';
import { dispatchSelectLine } from '@/components/station/ReceivingLinesTable';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { railRelativeTime, type SidebarRailRowContext } from '@/components/sidebar/SidebarRailShell';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import {
  fulfillmentModeLabel,
  isLocalPickupFulfillment,
  displayTrackingNumber,
} from '@/lib/receiving/fulfillment-mode';
import {
  receivingRailRowTitle,
  type ReceivingRailRowTitleMode,
} from '@/lib/receiving/po-group-title';
import { receivingRailReconcileId } from '@/lib/queries/receiving-queries';

export interface ApiResponse {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
  total: number;
}

export interface RecentActivityRailBaseProps {
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

  eyebrowTitle: string;
  eyebrowSuffix?: string;
  /** Right-aligned eyebrow slot (e.g. a refresh button); takes precedence over suffix. */
  eyebrowAction?: ReactNode;
  /** Hide the TITLE · N eyebrow when workbench chrome owns tabs + select. */
  hideEyebrow?: boolean;
  emptyText?: string;
  autoSelectFirstWhenEmpty?: boolean;
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
  previewQtyLabel: string;
  getPreviewQty: (row: ReceivingLineRow) => { current: number; total: number | null };
  /**
   * Optional read-only context node rendered inside the hover popover, beneath
   * the badge row (e.g. the unfound triage exception dot + tooltip). Additive —
   * rails that don't pass it render exactly as before.
   */
  renderPopoverContext?: (row: ReceivingLineRow) => ReactNode;
  /**
   * Optional action node rendered in the popover footer, left of "Open →" (e.g.
   * the unfound triage "File claim" button). `dismiss` closes the popover.
   * Additive — unset = today's footer.
   */
  renderPopoverActions?: (row: ReceivingLineRow, ctx: { dismiss: () => void }) => ReactNode;
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
 * Compact ticket flag on the TITLE row (same line as the PO/order id) — never
 * on the meta line. A padded chip on the meta row made ticket-flagged rows
 * taller than their neighbors on selection.
 */
function TicketRailFlag({ ticket }: { ticket: string }) {
  return (
    <HoverTooltip label={`Claim ticket ${ticket} filed`} asChild focusable={false}>
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-orange-700">
        <Ticket className="h-3 w-3" />
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
  loadSnapshot,
  persistSnapshot,
  updateEvent,
  deleteEvent,
  deleteGroupEvent,
  refreshEvents,
  navigateEvent,
  eyebrowTitle,
  eyebrowSuffix,
  eyebrowAction,
  hideEyebrow = false,
  emptyText,
  autoSelectFirstWhenEmpty = false,
  pinSelectedLead = true,
  preserveServerOrder = false,
  staggerRevealMotion,
  contentPaintSurface,
  getActivityAt = getRowActivityAt,
  getStatusDot,
  getStatusDotLabel,
  renderQuantity,
  previewQtyLabel,
  getPreviewQty,
  renderPopoverContext,
  renderPopoverActions,
  rowTitleMode = 'line',
  showTicketFlag = true,
}: RecentActivityRailBaseProps) {
  const resolvePlatformMeta = usePlatformMeta();
  const resolvePlatformLabel = (raw: string) => resolvePlatformMeta(raw).label;
  const rowTitle = (row: ReceivingLineRow) =>
    receivingRailRowTitle(row, rowTitleMode, resolvePlatformLabel);

  return (
    <SidebarRecentRailBase<ReceivingLineRow>
      queryKey={queryKey}
      fetchFn={async () => (await fetchFn()).receiving_lines ?? []}
      excludedIds={excludedIds}
      loadSnapshot={loadSnapshot}
      persistSnapshot={persistSnapshot}
      updateEvent={updateEvent}
      deleteEvent={deleteEvent}
      deleteGroupEvent={deleteGroupEvent}
      refreshEvents={refreshEvents}
      navigateEvent={navigateEvent}
      selectedId={selectedLineId}
      selectedRow={selectedRow}
      leadingRow={leadingRow}
      getRowDisabled={getRowDisabled}
      limit={limit}
      pinSelectedLead={pinSelectedLead}
      preserveServerOrder={preserveServerOrder}
      staggerRevealMotion={staggerRevealMotion}
      contentPaintSurface={contentPaintSurface}
      eyebrowTitle={eyebrowTitle}
      eyebrowSuffix={eyebrowSuffix}
      eyebrowAction={eyebrowAction}
      hideEyebrow={hideEyebrow}
      emptyText={emptyText}
      autoSelectFirstWhenEmpty={autoSelectFirstWhenEmpty}
      canAutoSelectFirst={
        autoSelectFirstWhenEmpty ? canAutoSelectReceivingRailFirst : undefined
      }
      getId={getRowId}
      getReconcileId={getRowReconcileId}
      getGroupId={getRowGroupId}
      getActivityAt={getActivityAt}
      onSelect={selectRow}
      getStatusDot={getStatusDot}
      getStatusDotLabel={getStatusDotLabel}
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
          qtyLabel={previewQtyLabel}
          getQty={getPreviewQty}
          activityAt={getActivityAt(row) ?? null}
          statusDot={getStatusDot(row)}
          statusLabel={getStatusDotLabel?.(row) ?? workflowStatusTableLabel(row.workflow_status || 'EXPECTED')}
          onOpenWorkspace={() => { p.openWorkspace(); p.dismiss(); }}
          ticket={showTicketFlag ? railTicketNumber(row) : null}
          contextSlot={renderPopoverContext?.(row)}
          actionsSlot={renderPopoverActions?.(row, { dismiss: p.dismiss })}
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
        // Ticket flag shares the title row with PKG chip so meta height stays
        // identical to non-ticket rows (same width / rhythm as every other display).
        titleAccessory: (
          <>
            {ticket ? <TicketRailFlag ticket={ticket} /> : null}
            {ctx.pkgChip}
          </>
        ),
        meta: (
          <span className="block truncate font-semibold uppercase tracking-widest text-text-soft">
            {renderQuantity(row)}
            {techId ? <span className={`ml-1 ${techColor}`}>· {getStaffName(techId)}</span> : null}
          </span>
        ),
      }}
    />
  );
}

function ReceivingPopoverContent({
  row, title, groupSize, qtyLabel, getQty, activityAt, statusDot, statusLabel, onOpenWorkspace, ticket, contextSlot, actionsSlot,
}: {
  row: ReceivingLineRow;
  title: string;
  groupSize: number;
  qtyLabel: string;
  getQty: (row: ReceivingLineRow) => { current: number; total: number | null };
  /** Same timestamp the row's relative-time label shows (the feed's sort axis). */
  activityAt: string | null;
  /** Feed-scoped status dot class — drives the popover badge tone. */
  statusDot: string;
  /** Feed-scoped status label — replaces raw workflow_status in the badge. */
  statusLabel: string;
  onOpenWorkspace: () => void;
  /** Filed claim/ticket label (`#NNNN`) when this line has one; null hides the badge. */
  ticket: string | null;
  /** Optional read-only context (e.g. unfound exception dot) under the badges. */
  contextSlot?: ReactNode;
  /** Optional footer action (e.g. "File claim"), left of "Open →". */
  actionsSlot?: ReactNode;
}) {
  const { current: qtyCurrent, total: qtyTotal } = getQty(row);
  const isComplete = qtyTotal != null && qtyTotal > 0 && qtyCurrent >= qtyTotal;
  const progressPct =
    qtyTotal != null && qtyTotal > 0 ? Math.min(100, Math.round((qtyCurrent / qtyTotal) * 100)) : qtyCurrent > 0 ? 100 : 0;

  const condGrade = (row.condition_grade || '').trim().toUpperCase();
  const conditionLabel = conditionGradeTableLabel(row.condition_grade);
  const conditionTone =
    condGrade === 'BRAND_NEW' ? 'bg-yellow-50 text-yellow-700 ring-yellow-200'
      : condGrade === 'USED_A' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
        : condGrade === 'USED_B' ? 'bg-blue-50 text-blue-700 ring-blue-200'
          : condGrade === 'USED_C' ? 'bg-surface-sunken text-text-muted ring-border-default'
            : condGrade === 'PARTS' ? 'bg-amber-50 text-amber-700 ring-amber-200'
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
    <div className="space-y-3 p-3.5">
      <div>
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm font-black leading-snug text-text-default">{title}</p>
          {groupSize > 1 ? (
            <span className="shrink-0 rounded bg-indigo-100 inset-chip text-[8.5px] font-black uppercase tracking-widest text-indigo-700">PKG · {groupSize}</span>
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
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
              received/closed stays in the queue (not hidden) with this badge,
              surfacing the physical-vs-financial mismatch instead of vanishing. */}
          {['billed', 'closed', 'cancelled', 'received', 'rejected'].includes(
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
            label={`${row.photo_count ?? 0} ${(row.photo_count ?? 0) === 1 ? 'photo' : 'photos'}`}
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

      {contextSlot ? <div>{contextSlot}</div> : null}

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-role-eyebrow uppercase tracking-widest text-text-faint">{qtyLabel}</span>
          <span className={`text-role-caption font-black tabular-nums ${isComplete ? 'text-emerald-600' : 'text-text-muted'}`}>
            {qtyCurrent}<span className="text-text-faint mx-0.5">/</span><span className="text-text-faint">{qtyTotal ?? '?'}</span>
          </span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
          <motion.div initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.35, ease: motionBezier.easeOut }} className={`h-full ${isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`} />
        </div>
      </div>

      {/* Wrap (not scroll): the ticket chip makes this a 5-chip row that can't
          fit the 360px popover on one line. flex-wrap keeps every chip full-size
          and drops the overflow chip to a second line; justify-between still
          spreads the common 4-chip row edge-to-edge (PO left · serial right). */}
      <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-2 border-t border-border-hairline pt-3 [&>*]:shrink-0">
        <OrderIdChip value={poValue} display={getLast4(poValue)} />
        <SkuScanRefChip value={skuValue} display={getLast4(skuValue)} />
        {isPickup ? (
          <FulfillmentPickupPill />
        ) : (
          <TrackingChip value={displayTrk ?? ''} display={getLast4(displayTrk ?? '')} />
        )}
        {/* Always render the serial chip — even with no serial it shows the
            `----` placeholder (resolveSerialDisplay) so the column stays put and
            lines up across rows. Content-fit width (not the default w-[84px])
            so the value hugs the right edge of this justify-end row instead of
            leaving dead space to its right. */}
        <SerialChip value={serialsCsv} width="w-fit shrink-0" />
        {/* Filed claim/ticket id — the ticket lives in the copy-chip row (orange
            `TicketChip`, hash icon), not as a status-row badge. Only present when
            the line has a ticket. The tone's `#` glyph supplies the hash, so the
            display drops the leading `#`. */}
        {ticketDigits ? <TicketChip value={ticketDigits} display={ticketDigits} /> : null}
      </div>

      <div className="flex items-center justify-between border-t border-border-hairline pt-2.5">
        <span className="text-role-eyebrow font-bold uppercase tracking-widest text-text-faint">
          {activityAt
            ? `${railRelativeTime(activityAt)} ago`
            : '—'}
          {row.assigned_tech_id ? ` · ${getStaffName(row.assigned_tech_id)}` : ''}
        </span>
        <div className="flex items-center gap-1.5">
          {actionsSlot}
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenWorkspace}
            className="h-auto rounded-md px-2.5 py-1 text-role-micro uppercase tracking-widest"
          >
            Open →
          </Button>
        </div>
      </div>
    </div>
  );
}
