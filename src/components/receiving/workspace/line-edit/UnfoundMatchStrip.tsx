'use client';

/**
 * Auto-match row for an UNFOUND carton — lives inside {@link POUnboxingSection}
 * below PO Items, above Package Pairing. Operator-initiated only; nothing here
 * runs on the scan path (see useUnfoundRefetchActions).
 *
 * Three resolution lanes:
 *   • **Order #** (Search) — the PRIMARY lane, open by default. One row:
 *     back chip · order-number input · blue search icon. Typing surfaces a live
 *     list of matching shipped orders; an EXACT order-number match auto-links the
 *     order onto the carton (import-sales-order), and picking a list row links
 *     that order. The search icon runs the read-only serial compare instead (for
 *     verifying before linking) — a confirmed match then logs the serial / files
 *     a support ticket inline. Back collapses to the compact action grid.
 *   • **Zoho** (RefreshCw) — FETCH: re-run the Zoho PO tracking search.
 *   • **Amazon return** (PackageCheck) — FETCH: reverse-tracking SP-API lookup.
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
import { ClaimTicketReply } from '@/components/receiving/workspace/claim/components/ClaimTicketReply';
import { useClaimTicketReply } from '@/components/receiving/workspace/claim/hooks/useClaimTicketReply';
import type { FiledTicket } from '@/components/receiving/workspace/claim/claim-types';
import { WorkspaceSectionTitle } from '../WorkspaceSectionLabel';

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
  // Order # search is the primary lane — open by default. Back collapses to the
  // compact action grid (Order # · Zoho · Amazon); Order # re-opens the search.
  const [orderSearchOpen, setOrderSearchOpen] = useState(true);
  const hasTracking = Boolean(trackingNumber?.trim());
  const noReceiving = receivingId == null;
  const notice = pickMergedRefetchNotice(zoho, amazon);

  const closeSearch = () => {
    setOrderSearchOpen(false);
    compare.reset();
  };

  // Crossfade the search bar ⇄ the action grid — one focus surface swaps for the
  // other. Opacity + small-y via the shared workbench-pane preset; reduced motion
  // collapses to opacity automatically through the hook bridge.
  const stepPresence = useMotionPresence(framerPresence.workbenchPane);
  const stepTransition = useMotionTransition(framerTransition.workbenchPaneMount);

  return (
    <div
      className={showTopRule ? 'space-y-2 border-t border-border-hairline pt-3' : 'space-y-2'}
    >
      <WorkspaceSectionTitle as="p">Auto-match</WorkspaceSectionTitle>

      <AnimatePresence mode="wait" initial={false}>
        {orderSearchOpen ? (
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
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
          >
            {/* Order # is a different kind of action than its peers — it opens a
                LOCAL search rather than firing a platform fetch — so it wears the
                blue treatment. Zoho / Amazon stay uniform. */}
            <StripButton
              icon={Search}
              label="Order #"
              tone="blue"
              tooltip="Search our shipped records by order number"
              disabled={noReceiving}
              onClick={() => setOrderSearchOpen(true)}
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
          </motion.div>
        )}
      </AnimatePresence>

      {!orderSearchOpen && notice ? <MergedNotice state={notice} /> : null}
    </div>
  );
}

/** One Auto-match action in the collapsed grid. Async lanes (Zoho / Amazon) pass
 *  `state` for the loading spinner; `tone="blue"` marks the odd one out — the
 *  local Order # search — apart from the platform-fetch peers. */
function StripButton({
  icon: Icon,
  label,
  tooltip,
  tone = 'neutral',
  state,
  disabled,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  tooltip: string;
  tone?: 'neutral' | 'blue';
  state?: RefetchState;
  disabled: boolean;
  onClick: () => void;
}) {
  const blue =
    'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-300 hover:bg-blue-100 active:bg-blue-100';
  return (
    <HoverTooltip label={tooltip} asChild focusable={false}>
      <Button
        variant="secondary"
        size="sm"
        loading={state?.status === 'loading'}
        disabled={disabled}
        onClick={onClick}
        className={`min-h-11 w-full justify-start gap-2 rounded-lg px-3 ${
          tone === 'blue' ? blue : ''
        }`}
        icon={<Icon className="h-4 w-4 shrink-0" />}
      >
        <span className="truncate text-role-caption font-bold">{label}</span>
      </Button>
    </HoverTooltip>
  );
}

/**
 * The order-number search bar — one row: back chip (leftmost) · order-number
 * input · blue search icon (rightmost, tooltip). Typing surfaces a live list of
 * matching shipped orders; an EXACT order-number match auto-links the order onto
 * the carton (import-sales-order) — the same auto-import the PO# field does.
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
          | { success?: boolean; imported?: boolean; error?: string; matched_order?: { order_id?: string } }
          | null;
        if (!res.ok || !data?.success || !data.imported) {
          toast.error(data?.error || `No shipped order “${orderId}” to link`);
          return;
        }
        toast.success(`Linked order ${data.matched_order?.order_id ?? orderId} as a return`);
        // Reflect the import (type→RETURN, listing, off Unfound) on every surface.
        window.dispatchEvent(new CustomEvent('app-refresh-data'));
        window.dispatchEvent(new CustomEvent('receiving-line-updated', { detail: { id: lineId } }));
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
      {trimmedSerial ? (
        <div className="flex items-center gap-2 px-0.5">
          <span className="shrink-0 text-role-eyebrow uppercase tracking-widest text-text-faint">
            Scanned
          </span>
          <SerialChip value={trimmedSerial} width="w-fit max-w-full" dense />
        </div>
      ) : null}
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
        {/* Order # — find what we shipped and link (exact) or compare (search). */}
        <div className="min-w-0 flex-1">
          <input
            autoFocus
            value={orderNumber}
            onChange={(e) => {
              setOrderNumber(e.target.value);
              autoAttemptedRef.current = null;
              if (state.status !== 'idle') onClear();
            }}
            placeholder="Order number…"
            disabled={disabled}
            className="min-h-11 w-full min-w-0 rounded-lg border-0 bg-surface-card px-3 text-role-caption font-semibold text-text-default ring-1 ring-inset ring-border-soft placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        {/* Rightmost blue search icon — runs the read-only serial compare. */}
        <HoverTooltip label="Search shipped records by order number" asChild focusable={false}>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            loading={state.status === 'loading' || linkingId != null}
            disabled={disabled || !trimmedOrder}
            ariaLabel="Search by order number"
            className="min-h-11 w-11 shrink-0 justify-center rounded-lg bg-blue-50 px-0 text-blue-700 ring-1 ring-inset ring-blue-300 hover:bg-blue-100 active:bg-blue-100"
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
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-blue-50"
          >
            <span className="min-w-0">
              {c.product_title ? (
                // ds-allow-title
                <span className="block truncate text-role-caption font-bold text-text-default">
                  {c.product_title}
                </span>
              ) : (
                <span className="block text-role-caption font-bold text-text-muted">Order</span>
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
            <p className="truncate text-role-caption font-bold text-text-default" title={order.product_title}>
              {order.product_title}
            </p>
          ) : (
            <p className="text-role-caption font-bold text-text-muted">Order found</p>
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
        window.dispatchEvent(new CustomEvent('app-refresh-data'));
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
        <span className="text-role-caption font-bold">{status === 'logged' ? 'Logged' : 'Log serial'}</span>
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
        <span className="text-role-caption font-bold">{hasTicket ? 'Ticket' : 'File ticket'}</span>
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
              <span className="truncate text-role-caption font-bold text-text-default">
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
        className="block w-full resize-y rounded-lg border border-border-default bg-surface-card px-3 py-2 text-role-caption font-medium leading-snug text-text-default outline-none focus:border-border-emphasis focus:ring-2 focus:ring-text-soft/20"
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
      className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-role-caption ring-1 ring-inset ${LINE_TONE[tone]}`}
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
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-role-caption ring-1 ring-inset ${tone}`}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">{state.message}</span>
    </div>
  );
}
