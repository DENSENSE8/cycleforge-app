'use client';

/**
 * Inbound's STATUS chips — top-left above the deliveries, the To-ship
 * `?cardStatus=` pattern (operator 2026-09-27): Received / Not received are
 * statuses of the list, not sidebar rows.
 *
 * - No pasted list: delivery-state buckets with the lane's counts, writing
 *   `?state=` (the one facet `useReceivingModeContext` already reads).
 * - A pasted list (`?ref_in=`): the Check's buckets, counting pasted numbers,
 *   writing `?recon=` — the sidebar popout reads the same param. A pressed
 *   status opens a second row: its reasons with counts, writing
 *   `?recon_reason=` (a status change drops it).
 *
 * ⌥1–⌥N press the status chips in order. One chip at a time; pressing the lit
 * chip clears it.
 */

import { useCallback, useMemo, useRef } from 'react';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import type { IncomingDeliveryState, IncomingSummary } from '@/components/sidebar/receiving/incoming/incoming-summary-types';
import { INCOMING_DELIVERY_STATE_FACE } from '@/lib/receiving/incoming-delivery-state-face';
import type { InboundCheck } from '@/lib/receiving/inbound-check-query';
import {
  RECON_PARAM,
  RECON_REASON_LABELS,
  RECON_REASON_PARAM,
  RECON_STATUS_LABELS,
  reconCounts,
  reconReasonCounts,
  type ReconReason,
  type ReconStatus,
} from '@/lib/receiving/reconcile';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import { useSegmentChords } from '@/lib/keyboard/useSegmentChords';
import { segmentChordHint } from '@/lib/keyboard/segment-chords';
import { STATE_TONE_CLASSES, type StateName } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const STATE_PARAM = 'state';

/** The lane's walk order: what is on the dock first, what has no tracking last. */
const DELIVERY_CHIPS: readonly { state: IncomingDeliveryState; label: string; tone: StateName | null }[] = [
  { state: 'DELIVERED_UNOPENED', label: INCOMING_DELIVERY_STATE_FACE.DELIVERED_UNOPENED.tileLabel, tone: 'danger' },
  { state: 'ARRIVING_TODAY', label: 'Arriving today', tone: 'warning' },
  { state: 'IN_TRANSIT', label: 'In transit', tone: 'info' },
  { state: 'AWAITING_TRACKING', label: 'Awaiting tracking', tone: null },
];

/** A pasted list's statuses. Exceptions is its own view, not a bucket here. */
const LIST_CHIPS: readonly { id: ReconStatus; tone: StateName }[] = [
  { id: 'received', tone: 'success' },
  { id: 'not_received', tone: 'warning' },
];

export interface IncomingStatusChip {
  id: string;
  label: string;
  /** Null while the count is loading. */
  count: number | null;
  tone: StateName | null;
  active: boolean;
}

export interface IncomingStatusChipSet {
  /** The group's accessible name. */
  label: string;
  chips: IncomingStatusChip[];
  /** Set when the chips cannot filter honestly (e.g. a partial row set). */
  disabledReason: string | null;
  onToggle: (id: string) => void;
  /** ⌥1–⌥N press these chips (default); the reason row has no chords. */
  chords?: boolean;
  /** `incoming-status` (default) → `incoming-status-<id>`, `incoming-status-chips`. */
  testIdPrefix?: string;
  /** The pressed status's reasons — only while a pasted list's status is pressed. */
  reasons?: IncomingStatusChipSet | null;
}

interface SummaryResponse extends Partial<IncomingSummary> {
  success?: boolean;
}

async function fetchIncomingSummary(signal: AbortSignal): Promise<SummaryResponse> {
  const res = await fetch('/api/receiving-lines/incoming/summary', { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`Incoming summary failed (${res.status})`);
  return (await res.json()) as SummaryResponse;
}

export function useIncomingStatusChips({
  enabled,
  reconciling,
  check,
  recon,
  reason = null,
  disabledReason = null,
}: {
  /** False where no Incoming ledger is mounted. */
  enabled: boolean;
  /** A pasted list is up (`?ref_in=`). */
  reconciling: boolean;
  check: InboundCheck;
  recon: ReconStatus | null;
  /** `?recon_reason=` inside {@link recon}. */
  reason?: ReconReason | null;
  disabledReason?: string | null;
}): IncomingStatusChipSet | null {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const state = (searchParams.get(STATE_PARAM) || '').trim().toUpperCase();

  // Same key the receiving writes already invalidate.
  const summary = useQuery({
    queryKey: ['receiving-lines-incoming-summary'],
    queryFn: ({ signal }) => fetchIncomingSummary(signal),
    enabled: enabled && !reconciling,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const counts = useMemo(() => reconCounts(check.entries), [check.entries]);

  const chips = useMemo<IncomingStatusChip[]>(() => {
    if (reconciling) {
      return LIST_CHIPS.map(({ id, tone }) => ({
        id,
        label: RECON_STATUS_LABELS[id],
        count: check.loading ? null : counts[id],
        tone,
        active: recon === id,
      }));
    }
    return DELIVERY_CHIPS.map(({ state: id, label, tone }) => {
      const value = summary.data?.[INCOMING_DELIVERY_STATE_FACE[id].summaryKey];
      return { id, label, count: typeof value === 'number' ? value : null, tone, active: state === id };
    });
  }, [check.loading, counts, recon, reconciling, state, summary.data]);

  const onToggle = useCallback(
    (id: string) => {
      // Live query string: a chord can land before `useSearchParams` re-renders.
      const params = new URLSearchParams(window.location.search);
      const param = reconciling ? RECON_PARAM : STATE_PARAM;
      if (params.get(param) === id) params.delete(param);
      else params.set(param, id);
      // A reason belongs to its status: pressing off or switching drops it.
      params.delete(RECON_REASON_PARAM);
      params.delete('page');
      const base = receivingSurfaceBasePath(pathname);
      const qs = params.toString();
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, reconciling, router],
  );

  const reasonChips = useMemo<IncomingStatusChip[] | null>(() => {
    if (!reconciling || !recon) return null;
    const tone = LIST_CHIPS.find((chip) => chip.id === recon)?.tone ?? null;
    return reconReasonCounts(check.entries, recon).map(({ reason: id, count }) => ({
      id,
      label: RECON_REASON_LABELS[id],
      count,
      tone,
      active: reason === id,
    }));
  }, [check.entries, reason, recon, reconciling]);

  const onToggleReason = useCallback(
    (id: string) => {
      const params = new URLSearchParams(window.location.search);
      if (params.get(RECON_REASON_PARAM) === id) params.delete(RECON_REASON_PARAM);
      else params.set(RECON_REASON_PARAM, id);
      params.delete('page');
      const base = receivingSurfaceBasePath(pathname);
      const qs = params.toString();
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router],
  );

  const chipIds = useMemo(() => chips.map((chip) => chip.id), [chips]);
  useSegmentChords({ enabled: enabled && !disabledReason, tabIds: chipIds, onTabChange: onToggle });

  if (!enabled) return null;
  return {
    label: reconciling ? 'Pasted list status' : 'Delivery status',
    chips,
    disabledReason,
    onToggle,
    reasons: reasonChips
      ? {
          label: `${RECON_STATUS_LABELS[recon!]} reasons`,
          chips: reasonChips,
          disabledReason,
          onToggle: onToggleReason,
          chords: false,
          testIdPrefix: 'incoming-reason',
        }
      : null,
  };
}

const CHIP_SPRING = { type: 'spring', stiffness: 520, damping: 34 } as const;
const CHIP_RAIL_CLASS =
  'flex w-full min-w-0 snap-x snap-proximity items-center overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/** Rounded chips over the triage cards. */
export function IncomingStatusChips({ set }: { set: IncomingStatusChipSet }) {
  const disabled = set.disabledReason != null;
  const chords = set.chords !== false;
  const testIdPrefix = set.testIdPrefix ?? 'incoming-status';
  const railRef = useRef<HTMLSpanElement>(null);
  useHorizontalWheelScroll(railRef);
  return (
    <span
      ref={railRef}
      role="group"
      aria-label={set.label}
      title={set.disabledReason ?? undefined}
      data-testid={`${testIdPrefix}-chips`}
      className={cn(CHIP_RAIL_CLASS, 'gap-1.5 py-0.5 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]')}
    >
      {set.chips.map((chip, index) => {
        const tone = chip.tone ? STATE_TONE_CLASSES[chip.tone] : null;
        const count = chip.count;
        const live = count == null || count > 0 || chip.active;
        const shortcut = chords ? segmentChordHint(index + 1) : null;
        const common = {
          type: 'button' as const,
          'aria-pressed': chip.active,
          'aria-keyshortcuts': chords ? `Alt+${index + 1}` : undefined,
          'data-testid': `${testIdPrefix}-${chip.id}`,
          disabled,
          title: disabled ? (set.disabledReason ?? undefined) : shortcut ? `${chip.label} (${shortcut})` : chip.label,
          onClick: () => set.onToggle(chip.id),
        };
        const dot = (
          <span
            aria-hidden
            className={cn('size-1.5 shrink-0 rounded-full', live && tone ? tone.dot : 'bg-border-default')}
          />
        );
        const tally = <span className="font-semibold tabular-nums">{count == null ? '…' : count.toLocaleString()}</span>;
        return (
          <motion.button
            key={chip.id}
            {...common}
            whileTap={disabled ? undefined : { scale: 0.94 }}
            transition={CHIP_SPRING}
            className={cn(
              'inline-flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              chip.active && tone
                ? cn(tone.pill, tone.border, 'font-semibold shadow-elev-soft')
                : chip.active
                  ? 'border-border-strong bg-surface-card font-semibold text-text-default shadow-elev-soft'
                  : live
                    ? 'border-transparent bg-surface-sunken text-text-default hover:border-border-strong'
                    : 'border-transparent text-text-faint',
              focusRing('control'),
            )}
          >
            {dot}
            {chip.label}
            {tally}
          </motion.button>
        );
      })}
    </span>
  );
}
