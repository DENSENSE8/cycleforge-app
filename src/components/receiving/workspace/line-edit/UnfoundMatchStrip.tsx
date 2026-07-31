'use client';

/**
 * Auto-match row for an UNFOUND carton — lives inside {@link POUnboxingSection}
 * below PO Items, above Package Pairing. Operator-initiated only; nothing here
 * runs on the scan path (see useUnfoundRefetchActions).
 *
 * Four resolution actions on a compact grid (default lane). Return # opens a
 * local search; Zoho / Amazon fire platform fetches; Find ticket opens the
 * helpdesk picker. Nothing auto-runs on scan.
 *
 *   • **Return #** (Search) — opens the search row (back chip · return #
 *     input · search icon). Typing surfaces a live list of matching shipped
 *     orders; an EXACT order-number match auto-links the order onto the
 *     carton (import-sales-order), and picking a list row links that order.
 *     The search icon runs the read-only serial compare instead (for
 *     verifying before linking) — a confirmed match then logs the serial /
 *     files a support ticket inline. Back returns to the compact action grid.
 *   • **Zoho** (RefreshCw) — FETCH: re-run the Zoho PO tracking search.
 *   • **Amazon return** (PackageCheck) — FETCH: reverse-tracking SP-API lookup.
 *   • **Find ticket** (TicketHelp) — search the helpdesk for a ticket matching
 *     this carton's TRACKING NUMBER and link the picked one to the carton/line.
 *     Composes the shared link waist (`TicketLinkPopover`), seeded with the
 *     tracking number — the reverse of "File ticket", which mints a new one.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  RefreshCw,
  Search,
  Check,
  Info,
  AlertTriangle,
  ChevronLeft,
  TicketHelp,
  PackageCheck,
  ExternalLink,
  Send,
  Database,
} from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { Popover } from '@/design-system/primitives/Popover';
import { PaneHeaderTabs } from '@/components/ui/pane-header';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ListingUrlChip, OrderIdChip, SerialChip } from '@/components/ui/CopyChip';
import { getLast4 } from '@/lib/copy-chip-format';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { dispatchUnboxRailLineUpdated } from '@/components/sidebar/receiving/unbox-rail-events';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  useUnfoundRefetchActions,
  type RefetchState,
} from './hooks/useUnfoundRefetchActions';
import { pickMergedRefetchNotice } from './hooks/useUnfoundRefetchActions.classify';
import { useShippedOrderCompare } from './hooks/useShippedOrderCompare';
import { useShippedOrderSuggest } from './hooks/useShippedOrderSuggest';
import type {
  ShippedOrderCompare,
  SerialCompareOutcome,
  ShippedOrderSuggestion,
} from '@/lib/receiving/returned-serial-link';
import { diffSerials, pickClosestShippedSerial } from '@/lib/receiving/serial-diff';
import { TicketLinkPopover } from '@/components/support/context/TicketLinkPopover';
import { ClaimTicketReply } from '@/components/receiving/workspace/claim/components/ClaimTicketReply';
import { useClaimTicketReply } from '@/components/receiving/workspace/claim/hooks/useClaimTicketReply';
import type { FiledTicket } from '@/components/receiving/workspace/claim/claim-types';
import { WorkspaceSectionTitle } from '../WorkspaceSectionLabel';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface UnfoundMatchStripProps {
  receivingId: number | null;
  /** Active line — the ticket entity (create / reply) is scoped to it. */
  lineId?: number | null;
  trackingNumber: string | null;
  /** The serial in hand (last scanned on this carton), compared against the
   *  searched order's shipped serials. Null when nothing has been scanned yet. */
  receivedSerial?: string | null;
  /** Linked Zendesk ticket id → reply mode; null → create mode. */
  providerTicketId?: number | null;
  /** Ticket display label ("#9395"), when linked. */
  ticketNumber?: string | null;
  /** Zendesk deep link, when known. */
  ticketUrl?: string | null;
  /** Refetch the support-ticket link after a create/reply. */
  onTicketChanged?: () => void;
  /** When false, omit top divider (e.g. first block in a pairing-only card). */
  showTopRule?: boolean;
}

export function UnfoundMatchStrip({
  receivingId,
  lineId = null,
  trackingNumber,
  receivedSerial = null,
  providerTicketId = null,
  ticketNumber = null,
  ticketUrl = null,
  onTicketChanged,
  showTopRule = true,
}: UnfoundMatchStripProps) {
  const { zoho, amazon, busy, checkZoho, checkAmazon } = useUnfoundRefetchActions(
    receivingId,
    trackingNumber,
  );
  const compare = useShippedOrderCompare();
  // Compact action grid is the default (Return # · Zoho · Amazon · Find ticket).
  // Return # opens the search lane; Find ticket opens the helpdesk picker; both
  // return here on back / link.
  const [lane, setLane] = useState<'order' | 'ticket' | 'actions'>('actions');
  const trimmedTracking = (trackingNumber ?? '').trim();
  const hasTracking = Boolean(trimmedTracking);
  const noReceiving = receivingId == null;
  const notice = pickMergedRefetchNotice(zoho, amazon);

  const closeTicketLane = () => setLane('actions');
  const toggleTicketLane = () => {
    if (lane === 'ticket') {
      closeTicketLane();
      return;
    }
    setLane('ticket');
  };

  const closeSearch = () => {
    setLane('actions');
    compare.reset();
  };

  // Crossfade the search bar ⇄ the action grid — one focus surface swaps for the
  // other. Opacity + small-y via the shared workbench-pane preset; reduced motion
  // collapses to opacity automatically through the hook bridge.
  const stepPresence = useMotionPresence(framerPresence.workbenchPane);
  const stepTransition = useMotionTransition(framerTransition.workbenchPaneMount);

  return (
    <div
      className={showTopRule ? 'space-y-2 border-t border-border-hairline pt-2' : 'space-y-2'}
    >
      <WorkspaceSectionTitle as="p">Auto-match</WorkspaceSectionTitle>

      <AnimatePresence mode="wait" initial={false}>
        {lane === 'ticket' ? (
          <motion.div key="ticket-search" {...stepPresence} transition={stepTransition}>
            <TicketMatchLane
              receivingId={receivingId}
              lineId={lineId}
              trackingNumber={trimmedTracking}
              onBack={closeTicketLane}
              onLinked={() => {
                onTicketChanged?.();
                closeTicketLane();
              }}
            />
          </motion.div>
        ) : lane === 'order' ? (
          <motion.div key="order-search" {...stepPresence} transition={stepTransition}>
            <OrderSearchRow
              state={compare.state}
              receivedSerial={receivedSerial}
              disabled={noReceiving}
              receivingId={receivingId}
              lineId={lineId}
              providerTicketId={providerTicketId}
              ticketNumber={ticketNumber}
              ticketUrl={ticketUrl}
              onTicketChanged={onTicketChanged}
              onBack={closeSearch}
              onLinked={closeSearch}
              onSearch={(order, serial) => void compare.search(order, serial)}
              onClear={compare.reset}
            />
          </motion.div>
        ) : (
          <motion.div
            key="actions"
            {...stepPresence}
            transition={stepTransition}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
          >
            {/* Return # opens a LOCAL search rather than firing a platform fetch;
                chrome matches the Zoho / Amazon / Find ticket peers. */}
            <StripButton
              icon={Search}
              label="Return #"
              tooltip="Search our shipped records by return / order number"
              disabled={noReceiving}
              onClick={() => setLane('order')}
            />
            <StripButton
              icon={RefreshCw}
              label="Zoho"
              tooltip="Fetch from platform — re-run the Zoho PO tracking search"
              state={zoho}
              disabled={noReceiving || busy}
              onClick={() => void checkZoho()}
            />
            <StripButton
              icon={PackageCheck}
              label="Amazon return"
              tooltip={
                hasTracking
                  ? 'Fetch from platform — match by reverse tracking ID (Amazon Returns SP-API)'
                  : 'Add a tracking number to this carton first'
              }
              state={amazon}
              disabled={noReceiving || !hasTracking || busy}
              onClick={() => void checkAmazon()}
            />
            {/* Reverse of "File ticket": find an EXISTING helpdesk ticket for
                this carton by its tracking number and link it. */}
            <StripButton
              icon={TicketHelp}
              label="Find ticket"
              tooltip={
                hasTracking
                  ? 'Search the helpdesk for a ticket matching this tracking number'
                  : 'Add a tracking number to this carton first'
              }
              disabled={noReceiving || !hasTracking}
              onClick={toggleTicketLane}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {lane === 'actions' && notice ? <MergedNotice state={notice} /> : null}
    </div>
  );
}

/** One Auto-match action in the collapsed grid. Async lanes (Zoho / Amazon) pass
 *  `state` for the loading spinner. All four actions share secondary (white)
 *  chrome. */
function StripButton({
  icon: Icon,
  label,
  tooltip,
  state,
  disabled,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  tooltip: string;
  state?: RefetchState;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <HoverTooltip label={tooltip} asChild focusable={false}>
      <Button
        variant="secondary"
        size="sm"
        loading={state?.status === 'loading'}
        disabled={disabled}
        onClick={onClick}
        className="min-h-11 w-full justify-start gap-2 rounded-lg px-3"
        icon={<Icon className="h-4 w-4 shrink-0" />}
      >
        <span className="truncate text-role-caption font-semibold">{label}</span>
      </Button>
    </HoverTooltip>
  );
}

/**
 * "Find ticket" lane — search the helpdesk for an EXISTING ticket about this
 * carton and link it. The query is seeded with the carton's tracking number, so
 * the operator lands on the matching ticket without typing (and can still edit
 * the box or paste a `#id`).
 *
 * Composes the shared link waist rather than forking a second picker: the
 * candidate list + link mutation are {@link TicketLinkPopover}
 * (GET/POST `/api/support/tickets/link`, anchor = this receiving carton/line).
 */
function TicketMatchLane({
  receivingId,
  lineId,
  trackingNumber,
  onBack,
  onLinked,
}: {
  receivingId: number | null;
  lineId: number | null;
  trackingNumber: string;
  onBack: () => void;
  onLinked: () => void;
}) {
  if (receivingId == null) return null;
  return (
    <div className="flex min-w-0 items-start gap-2">
      <IconButton
        type="button"
        icon={<ChevronLeft className="h-4 w-4" />}
        ariaLabel="Back to auto-match options"
        tone="neutral"
        onClick={onBack}
        className="grid h-11 w-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset ring-border-soft hover:bg-surface-canvas"
      />
      <div className="min-w-0 flex-1">
        <TicketLinkPopover
          open
          title="Find ticket by tracking"
          initialQuery={trackingNumber}
          linkable={{
            canLinkTicket: true,
            anchorType: 'receiving',
            anchorId: receivingId,
            receivingId,
            lineId: lineId ?? null,
            trackingNumber,
          }}
          onClose={onBack}
          onLinked={onLinked}
        />
      </div>
    </div>
  );
}

/**
 * The return-# search bar — one row: back chip (leftmost) · return # input ·
 * search icon (rightmost, tooltip). Typing surfaces a live list of matching
 * shipped orders; an EXACT order-number match auto-links the order onto the
 * carton (import-sales-order) — the same auto-import the PO# field does.
 * Picking a list row links that order. The search icon runs the read-only serial
 * compare instead, for when the operator wants to verify before linking.
 */
function OrderSearchRow({
  state,
  receivedSerial,
  disabled,
  receivingId,
  lineId,
  providerTicketId,
  ticketNumber,
  ticketUrl,
  onTicketChanged,
  onBack,
  onLinked,
  onSearch,
  onClear,
}: {
  state: ReturnType<typeof useShippedOrderCompare>['state'];
  receivedSerial: string | null;
  disabled: boolean;
  receivingId: number | null;
  lineId: number | null;
  providerTicketId: number | null;
  ticketNumber: string | null;
  ticketUrl: string | null;
  onTicketChanged?: () => void;
  onBack: () => void;
  onLinked: () => void;
  onSearch: (orderNumber: string, serial: string) => void;
  onClear: () => void;
}) {
  const [orderNumber, setOrderNumber] = useState('');
  const trimmedOrder = orderNumber.trim();
  // The serial in hand comes from the scan already done in the PO-lines
  // accordion — there's no serial input here, we compare against `receivedSerial`.
  const trimmedSerial = (receivedSerial ?? '').trim();

  // Live suggestions while typing — paused once a compare is in flight/resolved
  // (the compare result takes over the space below the bar).
  const canLink = !disabled && receivingId != null && lineId != null;
  const { candidates, loading: suggesting } = useShippedOrderSuggest(
    orderNumber,
    !disabled && state.status === 'idle',
  );

  const [linkingId, setLinkingId] = useState<string | null>(null);
  // The order value we've already AUTO-attempted, so a failed exact match
  // (import returns imported:false) doesn't loop the effect. Cleared on edit.
  const autoAttemptedRef = useRef<string | null>(null);

  const linkOrder = useCallback(
    async (rawOrderId: string) => {
      const orderId = rawOrderId.trim();
      if (!orderId || linkingId || !canLink || receivingId == null || lineId == null) return;
      setLinkingId(orderId);
      try {
        const res = await fetch('/api/receiving/import-sales-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': safeRandomUUID() },
          body: JSON.stringify({
            order_number: orderId,
            receiving_id: receivingId,
            receiving_line_id: lineId,
          }),
        });
        const data = (await res.json().catch(() => null)) as
          | {
              success?: boolean;
              imported?: boolean;
              error?: string;
              matched_order?: { order_id?: string };
              line_patch?: (Partial<ReceivingLineRow> & { id: number }) | null;
            }
          | null;
        if (!res.ok || !data?.success || !data.imported) {
          toast.error(data?.error || `No shipped order “${orderId}” to link`);
          return;
        }
        toast.success(`Linked order ${data.matched_order?.order_id ?? orderId} as a return`);
        // The server returns the exact row patch (type→RETURN, listing, carton
        // source, order#, status). Apply it optimistically so the accordion /
        // table / rail flip within a frame — the old field-less
        // `receiving-line-updated {id}` was a no-op that left everything waiting
        // on the app-refresh-data refetch. Keep app-refresh-data for the
        // cross-feed reconcile (the carton also leaves the Unfound queue).
        if (data.line_patch?.id) {
          dispatchUnboxRailLineUpdated(data.line_patch);
        }
        refreshDomains(REFRESH_BUNDLES.receivingWrite);
        onLinked();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Network error');
      } finally {
        setLinkingId(null);
      }
    },
    [linkingId, canLink, receivingId, lineId, onLinked],
  );

  // Auto-link when what's typed is an EXACT order-number match to a suggestion.
  // Mark the attempt BEFORE firing so a non-importable exact match doesn't loop.
  const exactMatch = candidates.find(
    (c) => c.order_id.toLowerCase() === trimmedOrder.toLowerCase(),
  );
  useEffect(() => {
    if (!exactMatch || !canLink || linkingId) return;
    if (autoAttemptedRef.current === exactMatch.order_id) return;
    autoAttemptedRef.current = exactMatch.order_id;
    void linkOrder(exactMatch.order_id);
  }, [exactMatch, canLink, linkingId, linkOrder]);

  const showList =
    state.status === 'idle' && trimmedOrder.length >= 2 && candidates.length > 0 && !linkingId;

  return (
    <div className="space-y-2">
      {/* The scanned serial already shows in the PO-lines accordion row above;
          it isn't re-displayed here. `receivedSerial` still drives the compare. */}
      <form
        className="flex min-w-0 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmedOrder) onSearch(trimmedOrder, trimmedSerial);
        }}
      >
        {/* Back — collapse to the Auto-match action grid (leftmost). */}
        <IconButton
          type="button"
          icon={<ChevronLeft className="h-4 w-4" />}
          ariaLabel="Back to auto-match options"
          tone="neutral"
          onClick={onBack}
          className="grid h-11 w-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset ring-border-soft hover:bg-surface-canvas"
        />
        {/* Return # — find what we shipped and link (exact) or compare (search). */}
        <div className="min-w-0 flex-1">
          <input
            autoFocus
            value={orderNumber}
            onChange={(e) => {
              setOrderNumber(e.target.value);
              autoAttemptedRef.current = null;
              if (state.status !== 'idle') onClear();
            }}
            placeholder="Return #…"
            disabled={disabled}
            className="min-h-11 w-full min-w-0 rounded-lg border-0 bg-surface-card px-3 text-role-caption font-semibold text-text-default ring-1 ring-inset ring-border-soft placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-border-soft"
          />
        </div>
        {/* Rightmost search icon — runs the read-only serial compare. */}
        <HoverTooltip label="Search shipped records by return / order number" asChild focusable={false}>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            loading={state.status === 'loading' || linkingId != null}
            disabled={disabled || !trimmedOrder}
            ariaLabel="Search by return number"
            className="min-h-11 w-11 shrink-0 justify-center rounded-lg px-0"
            icon={<Search className="h-4 w-4 shrink-0" />}
          />
        </HoverTooltip>
      </form>

      {showList ? (
        <OrderSuggestList
          candidates={candidates}
          onPick={(c) => void linkOrder(c.order_id)}
        />
      ) : null}
      {suggesting && !showList && state.status === 'idle' && trimmedOrder.length >= 2 ? (
        <p className="px-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
          Searching orders…
        </p>
      ) : null}

      {state.status === 'error' && state.message ? (
        <CompareLine tone="danger" icon={AlertTriangle} text={state.message} />
      ) : null}
      {state.status === 'not-found' && state.message ? (
        <CompareLine tone="warning" icon={Info} text={state.message} />
      ) : null}
      {state.status === 'found' && state.result?.order ? (
        <CompareResult
          result={state.result}
          receivedSerial={trimmedSerial || null}
          receivingId={receivingId}
          lineId={lineId}
          providerTicketId={providerTicketId}
          ticketNumber={ticketNumber}
          ticketUrl={ticketUrl}
          onTicketChanged={onTicketChanged}
          onClear={onClear}
        />
      ) : null}
    </div>
  );
}

/** Live order-number suggestions while typing. Picking a row links that order
 *  onto the carton (import-sales-order); an exact match auto-links without a tap. */
function OrderSuggestList({
  candidates,
  onPick,
}: {
  candidates: ShippedOrderSuggestion[];
  onPick: (candidate: ShippedOrderSuggestion) => void;
}) {
  return (
    <ul className="divide-y divide-border-hairline overflow-hidden rounded-lg bg-surface-card ring-1 ring-inset ring-border-soft">
      {candidates.map((c) => (
        <li key={c.order_pk}>
          <button
            type="button"
            onClick={() => onPick(c)}
            className="flex w-full items-center justify-between gap-2 inset-field text-left hover:bg-blue-50"
          >
            <span className="min-w-0">
              {c.product_title ? (
                // ds-allow-title
                <span className="block truncate text-role-caption font-semibold text-text-default">
                  {c.product_title}
                </span>
              ) : (
                <span className="block text-role-caption font-semibold text-text-muted">Order</span>
              )}
              {c.sku ? (
                <span className="block truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
                  {c.sku}
                </span>
              ) : null}
            </span>
            <span className="shrink-0">
              <OrderIdChip value={c.order_id} display={getLast4(c.order_id)} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const OUTCOME_META: Record<
  SerialCompareOutcome,
  { tone: 'success' | 'danger' | 'warning' | 'neutral'; icon: IconComponent; label: string }
> = {
  match: { tone: 'success', icon: Check, label: 'Serials match — this is the unit we shipped' },
  mismatch: { tone: 'danger', icon: AlertTriangle, label: 'Serial mismatch — not the unit on this order' },
  no_received: { tone: 'neutral', icon: Info, label: 'Scan a serial to compare against this order' },
  no_shipped_serial: { tone: 'warning', icon: Info, label: 'No serial on record for this order' },
};

/** Serial-anchored compare summary → the claim prefill. */
function buildTicketPrefill(result: ShippedOrderCompare, receivedSerial: string | null): string {
  const o = result.order;
  const shipped = result.shipped_serials[0] ?? '—';
  const verdict =
    result.serial_match === 'match'
      ? 'serials match'
      : result.serial_match === 'mismatch'
        ? 'SERIAL MISMATCH'
        : result.serial_match === 'no_shipped_serial'
          ? 'no serial on record for this order'
          : 'no received serial to compare';
  return [
    o?.order_id ? `Return for order ${o.order_id}` : 'Return — order lookup',
    o?.product_title ? `Item: ${o.product_title}` : '',
    `Shipped serial: ${shipped}`,
    `Received serial: ${receivedSerial ?? '—'}`,
    `Serial check: ${verdict}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Found-order display: title + order chip, then the serial comparison as the
 * crux (shipped vs received via the shared CopyChip last-4 chips), a single
 * tone-carrying verdict line, and the actions (listing + support-ticket popover).
 */
function CompareResult({
  result,
  receivedSerial,
  receivingId,
  lineId,
  providerTicketId,
  ticketNumber,
  ticketUrl,
  onTicketChanged,
  onClear,
}: {
  result: ShippedOrderCompare;
  receivedSerial: string | null;
  receivingId: number | null;
  lineId: number | null;
  providerTicketId: number | null;
  ticketNumber: string | null;
  ticketUrl: string | null;
  onTicketChanged?: () => void;
  onClear: () => void;
}) {
  const { order, shipped_serials, serial_match } = result;
  if (!order) return null;
  const meta = OUTCOME_META[serial_match];
  // Contrast the received serial against the CLOSEST serial we shipped on this
  // order (fewest differing chars) so a single mistyped digit reads as a near
  // match, not a blank "no match".
  const closest = pickClosestShippedSerial(receivedSerial, shipped_serials);
  const diff = diffSerials(receivedSerial, closest);
  const verdictText =
    serial_match === 'mismatch'
      ? `${diff.diffCount} character${diff.diffCount === 1 ? '' : 's'} differ — not the unit on this order`
      : meta.label;

  return (
    <div className="space-y-2.5 rounded-lg bg-surface-card px-3 py-2.5 ring-1 ring-inset ring-border-soft">
      {/* Identity — title leads, order id chip + clear on the right. */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {order.product_title ? (
            // ds-allow-title
            <p className="truncate text-role-caption font-semibold text-text-default" title={order.product_title}>
              {order.product_title}
            </p>
          ) : (
            <p className="text-role-caption font-semibold text-text-muted">Order found</p>
          )}
          {order.sku ? (
            <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
              {order.sku}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {order.order_id ? (
            <OrderIdChip value={order.order_id} display={getLast4(order.order_id)} />
          ) : null}
          <button
            type="button"
            onClick={onClear}
            className="text-role-eyebrow uppercase tracking-widest text-text-faint hover:text-text-muted"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Serial compare & contrast — the crux. Character-level diff of the serial
          we shipped vs the one in hand; differing characters highlighted. */}
      <SerialContrast received={receivedSerial} shipped={closest} />
      <CompareLine tone={meta.tone} icon={meta.icon} text={verdictText} />

      {/* Actions — log the received serial into the system, listing, ticket. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-hairline pt-2">
        {order.listing_url ? (
          <ListingUrlChip rawUrl={order.listing_url} openHref={order.listing_url} previewDisplay="View listing" />
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <LogSerialButton
            receivingId={receivingId}
            lineId={lineId}
            serial={receivedSerial}
            orderNumber={order.order_id}
            shippedSerial={closest}
            serialMatch={serial_match}
          />
          <SupportTicketPopover
            receivingId={receivingId}
            lineId={lineId}
            providerTicketId={providerTicketId}
            ticketNumber={ticketNumber}
            ticketUrl={ticketUrl}
            prefill={buildTicketPrefill(result, receivedSerial)}
            onChanged={onTicketChanged}
          />
        </div>
      </div>
    </div>
  );
}

/** Compare received vs shipped serials as last-4 {@link SerialChip}s. */
function SerialContrast({ received, shipped }: { received: string | null; shipped: string | null }) {
  return (
    <div className="space-y-1.5 rounded-lg bg-surface-canvas px-2.5 py-2 ring-1 ring-inset ring-border-soft">
      <SerialContrastRow label="Received" serial={received} />
      <SerialContrastRow label="Shipped" serial={shipped} />
    </div>
  );
}

function SerialContrastRow({
  label,
  serial,
}: {
  label: string;
  serial: string | null;
}) {
  const trimmed = (serial ?? '').trim();
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-role-eyebrow uppercase tracking-widest text-text-faint">
        {label}
      </span>
      {trimmed ? (
        <SerialChip value={trimmed} width="w-fit max-w-full" dense />
      ) : (
        <span className="font-mono text-role-caption text-text-faint">—</span>
      )}
    </div>
  );
}

/** Log the received serial INTO the system for investigation (find-or-create
 *  serial_units + an investigate note). Disabled until a serial is entered. */
function LogSerialButton({
  receivingId,
  lineId,
  serial,
  orderNumber,
  shippedSerial,
  serialMatch,
}: {
  receivingId: number | null;
  lineId: number | null;
  serial: string | null;
  orderNumber: string | null;
  shippedSerial: string | null;
  serialMatch: SerialCompareOutcome;
}) {
  const [status, setStatus] = useState<'idle' | 'logging' | 'logged'>('idle');
  const trimmed = (serial ?? '').trim();

  const log = async () => {
    if (!trimmed || status !== 'idle') return;
    setStatus('logging');
    try {
      const res = await fetch('/api/receiving/log-serial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': safeRandomUUID() },
        body: JSON.stringify({
          serial_number: trimmed,
          receiving_id: receivingId,
          receiving_line_id: lineId,
          order_number: orderNumber,
          shipped_serial: shippedSerial,
          serial_match: serialMatch,
          client_event_id: safeRandomUUID(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Could not log the serial');
        setStatus('idle');
        return;
      }
      toast.success(
        data.paired_to_line
          ? data.already_attached
            ? 'Serial already paired to this line'
            : 'Serial paired to the line & flagged unfound'
          : 'Serial logged to the system for investigation',
      );
      setStatus('logged');
      // Reflect the newly-paired serial on the carton/line surfaces.
      if (data.paired_to_line) {
        refreshDomains(REFRESH_BUNDLES.receivingWrite);
        if (lineId != null) {
          window.dispatchEvent(
            new CustomEvent('receiving-line-updated', { detail: { id: lineId } }),
          );
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
      setStatus('idle');
    }
  };

  return (
    <HoverTooltip
      label="Add this serial to the system and flag it for investigation"
      asChild
      focusable={false}
    >
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={status === 'logging'}
        disabled={!trimmed || status !== 'idle'}
        onClick={() => void log()}
        className="shrink-0 gap-1.5 rounded-lg px-3"
        icon={status === 'logged' ? <Check className="h-4 w-4" /> : <Database className="h-4 w-4" />}
      >
        <span className="text-role-caption font-semibold">{status === 'logged' ? 'Logged' : 'Log serial'}</span>
      </Button>
    </HoverTooltip>
  );
}

/* ─────────────────────────── support ticket popover ─────────────────────────── */

/**
 * "Ticket" → popover with the support ticket INLINE. Reply on the linked Zendesk
 * ticket (reuses {@link ClaimTicketReply} + {@link useClaimTicketReply}) or
 * create a new one from the serial-compare summary — no full modal.
 */
function SupportTicketPopover({
  receivingId,
  lineId,
  providerTicketId,
  ticketNumber,
  ticketUrl,
  prefill,
  onChanged,
}: {
  receivingId: number | null;
  lineId: number | null;
  providerTicketId: number | null;
  ticketNumber: string | null;
  ticketUrl: string | null;
  prefill: string;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const hasTicket = providerTicketId != null;
  const [mode, setMode] = useState<'reply' | 'create'>(hasTicket ? 'reply' : 'create');

  // Keep the mode consistent with linkage as it changes (e.g. after a create).
  useEffect(() => {
    setMode(hasTicket ? 'reply' : 'create');
  }, [hasTicket]);

  return (
    <>
      <Button
        ref={anchorRef}
        type="button"
        variant="secondary"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="shrink-0 gap-1.5 rounded-lg px-3"
        icon={<TicketHelp className="h-4 w-4 shrink-0" />}
      >
        <span className="text-role-caption font-semibold">{hasTicket ? 'Ticket' : 'File ticket'}</span>
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} placement="bottom-end">
        <div
          role="dialog"
          aria-label="Support ticket"
          className="w-[340px] max-w-[calc(100vw-24px)] space-y-2.5 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <TicketHelp className="h-4 w-4 shrink-0 text-orange-500" />
              <span className="truncate text-role-caption font-semibold text-text-default">
                {hasTicket ? `Ticket ${ticketNumber ?? ''}`.trim() : 'New support ticket'}
              </span>
            </div>
            {hasTicket && ticketUrl ? (
              <HoverTooltip label="Open in Zendesk" asChild>
                <a
                  href={ticketUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open in Zendesk"
                  className="rounded-md p-1 text-text-faint transition hover:bg-surface-sunken hover:text-text-muted"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </HoverTooltip>
            ) : null}
          </div>

          {hasTicket ? (
            <PaneHeaderTabs<'reply' | 'create'>
              tabs={[
                { value: 'reply', label: 'Reply' },
                { value: 'create', label: 'New ticket' },
              ]}
              value={mode}
              onChange={setMode}
              className="rounded-lg border border-border-soft px-1 py-0.5"
            />
          ) : null}

          {mode === 'reply' && providerTicketId != null ? (
            <TicketReplyInline
              open={open}
              ticketId={providerTicketId}
              ticketNumber={ticketNumber ?? `#${providerTicketId}`}
              ticketUrl={ticketUrl}
            />
          ) : (
            <TicketCreateInline
              receivingId={receivingId}
              lineId={lineId}
              prefill={prefill}
              onCreated={() => {
                onChanged?.();
                setOpen(false);
              }}
            />
          )}
        </div>
      </Popover>
    </>
  );
}

/** Reply composer — reuses the shared claim reply hook + presentational form. */
function TicketReplyInline({
  open,
  ticketId,
  ticketNumber,
  ticketUrl,
}: {
  open: boolean;
  ticketId: number;
  ticketNumber: string;
  ticketUrl: string | null;
}) {
  const reply = useClaimTicketReply({ open, ticketId });
  const filedTicket: FiledTicket = { id: ticketId, number: ticketNumber, url: ticketUrl ?? null };
  return <ClaimTicketReply reply={reply} filedTicket={filedTicket} />;
}

/**
 * Create a support ticket inline from the compare summary. Posts to the same
 * receiving claim route the modal uses (claimType 'return'); on success the
 * caller refetches the ticket link so the popover flips to reply mode.
 */
function TicketCreateInline({
  receivingId,
  lineId,
  prefill,
  onCreated,
}: {
  receivingId: number | null;
  lineId: number | null;
  prefill: string;
  onCreated: () => void;
}) {
  const [body, setBody] = useState(prefill);
  const [isPublic, setIsPublic] = useState(false);
  const [sending, setSending] = useState(false);

  // Re-seed the draft when the compare (hence prefill) changes.
  useEffect(() => setBody(prefill), [prefill]);

  const create = async () => {
    const text = body.trim();
    if (sending || receivingId == null) return;
    setSending(true);
    try {
      const res = await fetch('/api/receiving/zendesk-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': safeRandomUUID() },
        body: JSON.stringify({
          receivingId,
          lineId,
          claimType: 'return',
          description: text || undefined,
          notePublic: isPublic,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Could not create the ticket');
        return;
      }
      toast.success(`Ticket ${data.ticketNumber ?? ''} created`.trim());
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-2">
      <PaneHeaderTabs<'internal' | 'public'>
        tabs={[
          { value: 'internal', label: 'Internal' },
          { value: 'public', label: 'Email customer' },
        ]}
        value={isPublic ? 'public' : 'internal'}
        onChange={(next) => setIsPublic(next === 'public')}
        className="rounded-lg border border-border-soft px-1 py-0.5"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder="Ticket details…"
        className="block w-full resize-y rounded-lg border border-border-default bg-surface-card inset-field text-role-caption font-medium leading-snug text-text-default outline-none focus:border-border-emphasis focus:ring-2 focus:ring-text-soft/20"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-role-micro font-semibold text-text-faint">
          {isPublic ? 'Emails the customer.' : 'Private note — no email sent.'}
        </p>
        <Button
          variant="primary"
          size="sm"
          icon={<Send className="h-4 w-4" />}
          loading={sending}
          onClick={() => void create()}
          disabled={receivingId == null}
        >
          Create ticket
        </Button>
      </div>
    </section>
  );
}

/* ─────────────────────────── shared bits ─────────────────────────── */

const LINE_TONE: Record<'success' | 'danger' | 'warning' | 'neutral', string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  neutral: 'bg-surface-canvas text-text-muted ring-border-soft',
};

function CompareLine({
  tone,
  icon: Icon,
  text,
}: {
  tone: 'success' | 'danger' | 'warning' | 'neutral';
  icon: IconComponent;
  text: string;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg inset-cozy text-role-caption ring-1 ring-inset ${LINE_TONE[tone]}`}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 font-semibold">{text}</span>
    </div>
  );
}

function MergedNotice({ state }: { state: RefetchState }) {
  if (!state.message) return null;

  const tone =
    state.status === 'matched'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : state.status === 'error' || state.status === 'unsupported'
        ? 'bg-rose-50 text-rose-700 ring-rose-200'
        : 'bg-surface-canvas text-text-muted ring-border-soft';
  const Icon =
    state.status === 'matched'
      ? Check
      : state.status === 'error' || state.status === 'unsupported'
        ? AlertTriangle
        : Info;

  return (
    <div
      className={`flex items-start gap-2 rounded-lg inset-field text-role-caption ring-1 ring-inset ${tone}`}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">{state.message}</span>
    </div>
  );
}
