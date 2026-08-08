'use client';

import { AnchoredLayer } from '@/design-system';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { IDLE_TONE, STATION_LABEL, toneFor } from './goal-chip/goal-chip-shared';
import { useHeaderGoalChip } from './goal-chip/useHeaderGoalChip';
import { GoalRing } from './goal-chip/GoalRing';
import { GoalPopover } from './goal-chip/GoalPopover';
import { HEADER_ICON_BTN_CLASS, HEADER_ICON_BTN_OPEN_CLASS, HEADER_ICON_WRAP } from './header-shell';

/**
 * Header goal — progress-ring IconButton that opens the daily checklist popover.
 * Counts / station label live in the tooltip + popover (header face stays button-only).
 *
 * While auth or the first goals fetch is in flight, paints a stable idle ring so
 * the actions cluster does not pop the slot in after paint.
 */
export function HeaderGoalChip() {
  const g = useHeaderGoalChip();

  const pending = !g.isLoaded || (Boolean(g.user) && g.goalsLoading);
  const ready = Boolean(g.user && g.goals && g.active && g.activeGoal && g.view);

  // Settled with no assigned stations — hide. Auth resolved signed-out — hide.
  if (!pending && !ready) return null;

  const view = g.view;
  const chipCount =
    view == null
      ? { value: 0, total: 0, unit: 'scans' as const }
      : g.mode === 'scans'
        ? { value: view.scanCount, total: view.target, unit: 'scans' as const }
        : { value: view.done, total: view.total, unit: 'tasks' as const };
  const tone = view ? toneFor(view.percent, chipCount.value) : IDLE_TONE;
  const percent = view?.percent ?? 0;
  const hasSwitch = (g.goals?.length ?? 0) > 1;
  const tip =
    pending || !g.active || !view
      ? 'Daily goal'
      : `${STATION_LABEL[g.active]} · ${chipCount.value}/${chipCount.total} ${chipCount.unit}${
          g.recurDue ? ' · recurring due' : ''
        }`;

  return (
    <div ref={g.wrapRef} className={HEADER_ICON_WRAP}>
      <HoverTooltip label={tip} asChild>
        <IconButton
          size="md"
          ariaLabel={pending ? 'Daily goal — loading' : `Daily goal — ${tip}`}
          aria-expanded={ready ? g.open : undefined}
          aria-busy={pending || undefined}
          disabled={pending}
          onClick={pending ? undefined : () => g.setOpen((o) => !o)}
          className={cn(HEADER_ICON_BTN_CLASS, ready && g.open && HEADER_ICON_BTN_OPEN_CLASS)}
          icon={<GoalRing percent={percent} color={tone.ring} size={16} strokeWidth={2} />}
        />
      </HoverTooltip>

      {ready && g.recurDue && (
        <span className="pointer-events-none absolute right-0.5 top-0.5 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
        </span>
      )}

      {ready && view && g.goals && (
        <AnchoredLayer open={g.open} onClose={g.closePopover} anchorRef={g.wrapRef} placement="bottom-start" gap={0}>
          <GoalPopover g={g} view={view} tone={tone} chipCount={chipCount} hasSwitch={hasSwitch} />
        </AnchoredLayer>
      )}
    </div>
  );
}
