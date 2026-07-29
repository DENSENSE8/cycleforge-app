'use client';

/**
 * Slim active-order confirmation strip beside the tech scan field.
 *
 * **Undo placement** follows common product patterns (Material snackbar-style
 * “secondary action”; Apple-style “destructive/reversible sits below summary”):
 * the reversible **Undo serial** control lives in a **footer row** under the
 * progress meter so it doesn’t compete with primary status (“Active”) — same
 * mental model as “Undo send” trailing a message.
 *
 * **Orders_exceptions** sessions share the normal SAL + `tech.serial` undo path;
 * we label them “Exception · …last-4 tracking chip…” and style distinctly from
 * matched orders (`sourceType` + `orderFound`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  AlertTriangle,
  Barcode,
  Loader2,
  MapPin,
  Package,
  RotateCcw,
  Settings,
} from '@/components/Icons';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { framerGesture, framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import { looksLikeFnsku } from '@/lib/scan-resolver';
import { CopyChip, getLast4 } from '@/components/ui/CopyChip';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';

type Variant = 'order' | 'fba' | 'repair' | 'exception';

function inferVariant(order: ActiveStationOrder): Variant {
  const src = order.sourceType;
  if (src === 'fba' ||
    String(order.orderId || '').toUpperCase() === 'FNSKU' ||
    looksLikeFnsku(String(order.fnsku || ''))
  )
    return 'fba';
  if (src === 'repair' || /^RS-/i.test(String(order.orderId || ''))) return 'repair';
  if (src === 'exception') return 'exception';
  if (order.orderFound === false) return 'exception';
  return 'order';
}

function IdentifierChip({
  activeOrder,
  variant,
}: {
  activeOrder: ActiveStationOrder;
  variant: Variant;
}) {
  const tracking = String(activeOrder.tracking || '').trim();
  const oid = String(activeOrder.orderId || '').trim();
  const orderIdUnavailable = !oid || /^n\/a$/i.test(oid);

  if (variant === 'fba') {
    const value = String(activeOrder.fnsku || activeOrder.tracking || '').trim();
    if (!value) return <span className="text-role-caption font-semibold text-text-muted">—</span>;
    return (
      <CopyChip
        value={value}
        display={getLast4(value)}
        tone="fnsku"
        icon={null}
        dense
        fitDisplayWidth
        outerPad="flush"
      />
    );
  }

  if (variant === 'exception' || (variant === 'order' && orderIdUnavailable)) {
    if (!tracking) return <span className="text-role-caption font-semibold text-text-muted">—</span>;
    return (
      <CopyChip
        value={tracking}
        display={getLast4(tracking)}
        tone="tracking"
        icon={null}
        dense
        fitDisplayWidth
        outerPad="flush"
      />
    );
  }

  if (!oid) return <span className="text-role-caption font-semibold text-text-muted">—</span>;
  return (
    <CopyChip
      value={oid}
      display={getLast4(oid)}
      tone="id"
      icon={null}
      dense
      fitDisplayWidth
      outerPad="flush"
    />
  );
}

const VARIANTS: Record<
  Variant,
  { Icon: typeof MapPin; label: string; tint: string; border: string; bar: string }
> = {
  order: {
    Icon: MapPin,
    label: 'Order',
    tint: 'text-blue-600',
    border: 'border-blue-200/70',
    bar: 'bg-blue-500',
  },
  fba: {
    Icon: Package,
    label: 'FBA',
    tint: 'text-purple-600',
    border: 'border-purple-200/70',
    bar: 'bg-purple-500',
  },
  repair: {
    Icon: Settings,
    label: 'Repair',
    tint: 'text-amber-600',
    border: 'border-amber-200/70',
    bar: 'bg-amber-500',
  },
  exception: {
    Icon: AlertTriangle,
    label: 'Exception',
    tint: 'text-amber-700',
    border: 'border-amber-200/80',
    bar: 'bg-amber-500',
  },
};

interface Props {
  activeOrder: ActiveStationOrder | null;
}

function parseUndoResponse(data: Record<string, unknown>, resOk: boolean): {
  ok: boolean;
  serialNumbers?: string[];
  removedSerial?: string | null;
  error?: string;
} {
  if (!resOk || data?.success !== true) {
    return {
      ok: false,
      error: typeof data?.error === 'string' ? data.error : 'Failed to undo latest scan.',
    };
  }
  return {
    ok: true,
    serialNumbers: Array.isArray(data.serialNumbers) ? (data.serialNumbers as string[]) : [],
    removedSerial: (data.removedSerial as string | null | undefined) ?? null,
  };
}

/** Prefer anchored SAL (`orders_exceptions` + matched orders share this anchor). */
async function postUndoForActiveOrder(activeOrder: ActiveStationOrder): Promise<{
  ok: boolean;
  serialNumbers?: string[];
  removedSerial?: string | null;
  error?: string;
}> {
  const salId = activeOrder.salId != null ? Number(activeOrder.salId) : NaN;
  if (Number.isFinite(salId) && salId > 0) {
    const res = await fetch('/api/tech/serial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'undo', salId }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return parseUndoResponse(data, res.ok);
  }

  const res = await fetch('/api/tech/undo-last', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return parseUndoResponse(data, res.ok);
}

export function ActiveOrderScanFeedback({ activeOrder }: Props) {
  const [lastSerial, setLastSerial] = useState<string | null>(null);
  const prevTrackingRef = useRef<string | null>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (!activeOrder) {
      prevTrackingRef.current = null;
      prevCountRef.current = 0;
      setLastSerial(null);
      return;
    }
    const tracking = activeOrder.tracking || activeOrder.orderId;
    if (prevTrackingRef.current !== tracking) {
      prevTrackingRef.current = tracking;
      prevCountRef.current = activeOrder.serialNumbers.length;
      setLastSerial(null);
      return;
    }
    const next = activeOrder.serialNumbers.length;
    if (next > prevCountRef.current) {
      setLastSerial(activeOrder.serialNumbers[next - 1]);
      const t = window.setTimeout(() => setLastSerial(null), 1800);
      prevCountRef.current = next;
      return () => window.clearTimeout(t);
    }
    prevCountRef.current = next;
  }, [activeOrder]);

  return (
    <AnimatePresence initial={false}>
      {activeOrder ? (
        <motion.div
          key={activeOrder.tracking || activeOrder.orderId}
          layout="position"
          initial={framerPresence.collapseHeight.initial}
          animate={framerPresence.collapseHeight.animate}
          exit={framerPresence.collapseHeight.exit}
          transition={framerTransition.stationCollapse}
          className="overflow-hidden pb-1 sm:pb-0"
        >
          <FeedbackBody activeOrder={activeOrder} lastSerial={lastSerial} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function FeedbackBody({
  activeOrder,
  lastSerial,
}: {
  activeOrder: ActiveStationOrder;
  lastSerial: string | null;
}) {
  const [undoBusy, setUndoBusy] = useState(false);
  const variant = inferVariant(activeOrder);
  const { Icon, label, tint, border, bar } = VARIANTS[variant];
  /** Tracking resolved to no order — nothing scanned here attaches to a record. */
  const isException = variant === 'exception';
  const qty = Math.max(1, Number(activeOrder.quantity) || 1);
  const scanned = activeOrder.serialNumbers.length;
  const remaining = Math.max(0, qty - scanned);
  const progressPct = Math.min(100, Math.round((scanned / qty) * 100));
  const trackingKey = String(activeOrder.tracking || '').trim();
  const salId =
    activeOrder.salId != null && Number.isFinite(Number(activeOrder.salId)) && Number(activeOrder.salId) > 0
      ? Number(activeOrder.salId)
      : null;

  const handleUndoLastSerial = useCallback(async () => {
    if (undoBusy || scanned < 1) return;
    setUndoBusy(true);
    try {
      const result = await postUndoForActiveOrder(activeOrder);
      if (!result.ok) {
        window.alert(result.error || 'Could not undo.');
        return;
      }
      window.dispatchEvent(
        new CustomEvent('tech-undo-applied', {
          detail: {
            salId,
            tracking: trackingKey,
            removedSerial: result.removedSerial ?? null,
            serialNumbers: result.serialNumbers ?? [],
          },
        }),
      );
      refreshDomains(REFRESH_BUNDLES.outboundOrderWrite);
    } catch (e) {
      console.error(e);
      window.alert('Could not undo.');
    } finally {
      setUndoBusy(false);
    }
  }, [undoBusy, scanned, trackingKey, salId, activeOrder]);

  return (
    <LayoutGroup id={`active-order-feedback-${activeOrder.tracking || activeOrder.orderId}`}>
      <motion.div
        layout
        initial={framerPresence.stationCard.initial}
        animate={framerPresence.stationCard.animate}
        transition={framerTransition.stationCardMount}
        className={`min-w-0 rounded-xl border bg-surface-card px-3 py-2.5 shadow-sm max-sm:mb-0.5 ${border}`}
      >
        {/* Row 1 — identity + status (primary). Undo is separated to footer (Material / HIG). */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <Icon className={`h-3.5 w-3.5 shrink-0 ${tint}`} />
            <span className="shrink-0 text-role-eyebrow uppercase tracking-widest text-text-faint">{label}</span>
            <div className="min-w-0">
              <IdentifierChip activeOrder={activeOrder} variant={variant} />
            </div>
          </div>
          {/* An UNMATCHED scan is not "Active" — the tracking number resolved to
              no order, so anything scanned here lands on an exception, not on a
              record. Rendering the emerald Active chip here is what let a
              technician believe an orphaned serial had been captured. */}
          <motion.span
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={framerTransition.quantityBump}
            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-widest ring-1 ring-inset ${
              isException
                ? 'bg-amber-50 text-amber-700 ring-amber-300'
                : 'bg-emerald-50 text-emerald-600 ring-emerald-200'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isException ? 'bg-amber-500' : 'bg-emerald-500'}`}
            />
            {isException ? 'No order' : 'Active'}
          </motion.span>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            <motion.div
              className={`h-full ${bar} rounded-full`}
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={{
                type: 'spring',
                damping: 28,
                stiffness: 320,
              }}
            />
          </div>
          <span className="inline-flex shrink-0 items-baseline text-role-micro text-text-muted">
            <AnimatedStat value={scanned} speed="fast" />
            <span>/</span>
            <AnimatedStat value={qty} speed="fast" />
            {remaining > 0 ? (
              <span className="ml-1 font-semibold text-text-faint">
                · <AnimatedStat value={remaining} speed="fast" className="inline" /> left
              </span>
            ) : isException ? (
              // Never claim "complete" for a scan with no order behind it.
              <span className="ml-1 font-semibold text-amber-700">· not linked</span>
            ) : (
              <span className="ml-1 font-semibold text-emerald-600">· complete</span>
            )}
          </span>
        </div>

        {/* Shipping mode: STN ↔ unit/preboxed label pairing cue.
            Suppressed for an unmatched scan — there is no order to pair TO, so
            the serials are held against an exception for reconciliation. Saying
            "N units paired" there was a false completion signal. */}
        {isException && scanned > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1">
            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-700" />
            <span className="text-role-eyebrow uppercase tracking-widest text-amber-800">
              {scanned} serial{scanned === 1 ? '' : 's'} held — no order matched
            </span>
            <span className="text-role-eyebrow normal-case tracking-normal text-amber-700">
              Recorded against an exception for reconciliation, not attached to an order.
            </span>
          </div>
        ) : trackingKey && scanned > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50/80 px-2 py-1">
            <MapPin className="h-3 w-3 shrink-0 text-blue-600" />
            <span className="text-role-eyebrow uppercase tracking-widest text-blue-700">
              STN …{getLast4(trackingKey)}
            </span>
            <span className="text-role-eyebrow text-blue-400">↔</span>
            <Barcode className="h-3 w-3 shrink-0 text-emerald-600" />
            <span className="text-role-eyebrow uppercase tracking-widest text-emerald-700">
              {scanned} unit{scanned === 1 ? '' : 's'} paired
            </span>
          </div>
        ) : trackingKey && scanned === 0 ? (
          <div className="mt-2 rounded-md border border-dashed border-border-soft bg-surface-canvas px-2 py-1 text-role-eyebrow uppercase tracking-widest text-text-faint">
            Scan unit / preboxed label to pair with STN
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {lastSerial ? (
            <motion.div
              key={lastSerial}
              initial={framerPresence.stationSerialRow.initial}
              animate={framerPresence.stationSerialRow.animate}
              exit={framerPresence.stationSerialRow.exit}
              transition={framerTransition.stationSerialRow}
              className="overflow-hidden"
            >
              <div className="mt-2 flex min-w-0 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1">
                <Barcode className="h-3 w-3 shrink-0 text-emerald-600" />
                <span className="shrink-0 text-role-eyebrow uppercase tracking-widest text-emerald-600">Last</span>
                <span className="min-w-0 font-mono text-role-micro leading-tight text-emerald-900 [overflow-wrap:anywhere]">
                  {lastSerial}
                </span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Reversible secondary action — full-width footer, WCAG-minded touch height on small screens */}
        <div className="mt-2.5 border-t border-border-hairline pt-2.5">
          <motion.button
            type="button"
            disabled={undoBusy || scanned < 1}
            onClick={() => void handleUndoLastSerial()}
            whileTap={scanned >= 1 && !undoBusy ? framerGesture.tapPress : undefined}
            transition={framerTransition.stationSerialRow}
            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg text-role-caption font-semibold uppercase tracking-widest text-amber-800 transition-colors hover:bg-amber-50 active:bg-amber-100 disabled:pointer-events-none disabled:opacity-35 sm:min-h-0 sm:justify-start sm:py-1.5"
            title={
              variant === 'exception'
                ? 'Remove the last scanned serial from this exceptions session'
                : 'Remove the last scanned serial from this order'
            }
            aria-label="Undo last serial scan"
          >
            {undoBusy ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin sm:h-3.5 sm:w-3.5" />
            ) : (
              <RotateCcw className="h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" />
            )}
            <span>Undo last serial</span>
          </motion.button>
        </div>
      </motion.div>
    </LayoutGroup>
  );
}
