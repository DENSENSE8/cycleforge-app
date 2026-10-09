'use client';

/**
 * A card's active flags (`live_feed_flags`) as pills: the reason's label in
 * its tone; who flagged it, when and the note ride the pill's title. A card
 * shows two and a `+N` (`FlagPills`); the open package lists them all with
 * the note, who and when, and a clear (`FlagList`).
 */

import { Flag } from 'lucide-react';
import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives/IconButton';
import { liveFeedFlagReason, type LiveFeedFlag } from '@/lib/live-feed/flags';
import { formatLaneAgeCompact, formatMonthDayTimePST } from '@/utils/date';
import { useClearFlag } from './card-verbs';
import { Pill } from './pills';

const CARD_FLAG_LIMIT = 2;

/** `by Ana · 3h ago` — `now` null (first paint) falls back to the stamp. */
function flagByline(flag: LiveFeedFlag, now: number | null): string {
  const age = now != null ? formatLaneAgeCompact(flag.at, now) : null;
  return `by ${flag.by ?? 'someone'} · ${age ? `${age} ago` : formatMonthDayTimePST(flag.at)}`;
}

export function FlagPills({ flags, now }: { flags: readonly LiveFeedFlag[]; now: number | null }) {
  if (flags.length === 0) return null;
  const shown = flags.slice(0, CARD_FLAG_LIMIT);
  const rest = flags.slice(CARD_FLAG_LIMIT);
  return (
    <>
      {shown.map((flag) => {
        const reason = liveFeedFlagReason(flag.reason);
        return (
          <span
            key={flag.reason}
            // The card's pill row ignores the pointer (the open target lies under it); a flag takes hover for its title.
            className="pointer-events-auto inline-flex max-w-full"
            title={`Flagged ${flagByline(flag, now)}${flag.note ? ` · ${flag.note}` : ''}`}
            data-testid={`live-feed-card-flag-${flag.reason}`}
          >
            <Pill tone={reason.tone}>
              <Flag className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{reason.label}</span>
            </Pill>
          </span>
        );
      })}
      {rest.length > 0 ? (
        <span
          className="pointer-events-auto inline-flex"
          title={rest.map((flag) => `${liveFeedFlagReason(flag.reason).label} ${flagByline(flag, now)}`).join('\n')}
        >
          <Pill tone="neutral">+{rest.length}</Pill>
        </span>
      ) : null}
    </>
  );
}

export function FlagList({ cardId, flags, now }: { cardId: number; flags: readonly LiveFeedFlag[]; now: number | null }) {
  const clearFlag = useClearFlag();
  return (
    <ul className="flex flex-col gap-2" data-testid="live-feed-flags">
      {flags.map((flag) => {
        const reason = liveFeedFlagReason(flag.reason);
        return (
          <li key={flag.reason} className="flex items-start gap-2" data-testid={`live-feed-flag-${flag.reason}`}>
            <div className="min-w-0 flex-1">
              <Pill tone={reason.tone}>
                <Flag className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{reason.label}</span>
              </Pill>
              {flag.note ? <p className="mt-1 text-sm text-slate-700">{flag.note}</p> : null}
              <p className="mt-0.5 text-xs text-slate-500" title={formatMonthDayTimePST(flag.at)}>
                {flagByline(flag, now)}
              </p>
            </div>
            <IconButton
              icon={<X className="size-4" />}
              ariaLabel={`Clear ${reason.label}`}
              size="sm"
              radius="pill"
              onClick={() => void clearFlag(cardId, flag.reason)}
              data-testid={`live-feed-flag-clear-${flag.reason}`}
            />
          </li>
        );
      })}
    </ul>
  );
}
