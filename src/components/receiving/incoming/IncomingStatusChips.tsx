'use client';

/**
 * Inbound's STATUS chips — top-left above the deliveries, the To-ship
 * `?cardStatus=` pattern (operator 2026-09-27): Received / Not received are
 * statuses of the list, not sidebar rows.
 *
 * - No pasted list: delivery-state buckets with the lane's counts, writing
 *   `?state=` (the one facet `useReceivingModeContext` already reads).
 * - A pasted list (`?ref_in=`): the Check's buckets, counting pasted numbers,
 *   writing `?recon=` — the sidebar popout reads the same param.
 *
 * ⌥1–⌥N press the chips in order. One chip at a time; pressing the lit chip
 * clears it.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import type { IncomingDeliveryState, IncomingSummary } from '@/components/sidebar/receiving/incoming/incoming-summary-types';
import { INCOMING_DELIVERY_STATE_FACE } from '@/lib/receiving/incoming-delivery-state-face';
import type { InboundCheck } from '@/lib/receiving/inbound-check-query';
import {
  RECON_PARAM,
  RECON_STATUS_LABELS,
  reconCounts,
  type ReconStatus,
} from '@/lib/receiving/reconcile';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import { useSegmentChords } from '@/lib/keyboard/useSegmentChords';
import { segmentChordHint } from '@/lib/keyboard/segment-chords';
import { STATE_TONE_CLASSES, type StateName } from '@/design-system/tokens/lifecycle';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
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
  disabledReason = null,
}: {
  /** False where no Incoming ledger is mounted. */
  enabled: boolean;
  /** A pasted list is up (`?ref_in=`). */
  reconciling: boolean;
  check: InboundCheck;
  recon: ReconStatus | null;
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
      params.delete('page');
      const base = receivingSurfaceBasePath(pathname);
      const qs = params.toString();
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, reconciling, router],
  );

  const chipIds = useMemo(() => chips.map((chip) => chip.id), [chips]);
  useSegmentChords({ enabled: enabled && !disabledReason, tabIds: chipIds, onTabChange: onToggle });

  if (!enabled) return null;
  return {
    label: reconciling ? 'Pasted list status' : 'Delivery status',
    chips,
    disabledReason,
    onToggle,
  };
}

const CHIP_SPRING = { type: 'spring', stiffness: 520, damping: 34 } as const;
const CHIP_RAIL_CLASS =
  'flex w-full min-w-0 snap-x snap-proximity items-center overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/**
 * `face="cards"`: rounded chips over the triage cards. `face="floor"`: flat
 * segments in the industrial ledger's toolbar.
 */
export function IncomingStatusChips({ set, face }: { set: IncomingStatusChipSet; face: 'cards' | 'floor' }) {
  const disabled = set.disabledReason != null;
  const floor = face === 'floor';
  return (
    <span
      role="group"
      aria-label={set.label}
      title={set.disabledReason ?? undefined}
      data-testid="incoming-status-chips"
      className={cn(
        CHIP_RAIL_CLASS,
        floor ? 'items-stretch self-stretch' : 'gap-1.5 py-0.5 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]',
      )}
    >
      {set.chips.map((chip, index) => {
        const tone = chip.tone ? STATE_TONE_CLASSES[chip.tone] : null;
        const count = chip.count;
        const live = count == null || count > 0 || chip.active;
        const shortcut = segmentChordHint(index + 1);
        const common = {
          type: 'button' as const,
          'aria-pressed': chip.active,
          'aria-keyshortcuts': `Alt+${index + 1}`,
          'data-testid': `incoming-status-${chip.id}`,
          disabled,
          title: disabled ? (set.disabledReason ?? undefined) : `${chip.label} (${shortcut})`,
          onClick: () => set.onToggle(chip.id),
        };
        const dot = (
          <span
            aria-hidden
            className={cn('size-1.5 shrink-0 rounded-full', live && tone ? tone.dot : 'bg-border-default')}
          />
        );
        const tally = <span className="font-semibold tabular-nums">{count == null ? '…' : count.toLocaleString()}</span>;
        if (floor) {
          return (
            <button
              key={chip.id}
              {...common}
              className={cn(
                RECORD_LABEL_CLASS,
                'flex shrink-0 snap-start items-center gap-1.5 border-r border-mode-seam px-3 transition-colors disabled:opacity-50',
                chip.active ? 'bg-mode-ink text-mode-bar' : live ? 'text-mode-ink hover:bg-mode-hover' : 'text-mode-muted',
                focusRing('control'),
              )}
            >
              {dot}
              {chip.label}
              {tally}
            </button>
          );
        }
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
