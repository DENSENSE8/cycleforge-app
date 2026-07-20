'use client';

import { AnchoredLayer } from '@/design-system';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { STATION_LABEL, toneFor } from './goal-chip/goal-chip-shared';
import { useHeaderGoalChip } from './goal-chip/useHeaderGoalChip';
import { GoalRing } from './goal-chip/GoalRing';
import { GoalPopover } from './goal-chip/GoalPopover';
import { HEADER_ICON_BTN_CLASS, HEADER_ICON_BTN_OPEN_CLASS, HEADER_ICON_WRAP } from './header-shell';

/**
 * Header goal — progress-ring IconButton that opens the daily checklist popover.
 * Counts / station label live in the tooltip + popover (header face stays button-only).
 */
export function HeaderGoalChip() {
  const g = useHeaderGoalChip();

  if (!g.user || !g.goals || !g.active || !g.activeGoal || !g.view) return null;

  const view = g.view;
  const chipCount =
    g.mode === 'scans'
      ? { value: view.scanCount, total: view.target, unit: 'scans' }
      : { value: view.done, total: view.total, unit: 'tasks' };
  const tone = toneFor(view.percent, chipCount.value);
  const hasSwitch = g.goals.length > 1;
  const tip = `${STATION_LABEL[g.active]} · ${chipCount.value}/${chipCount.total} ${chipCount.unit}${
    g.recurDue ? ' · recurring due' : ''
  }`;

  return (
    <div ref={g.wrapRef} className={HEADER_ICON_WRAP}>
      <HoverTooltip label={tip} asChild>
        <IconButton
          size="md"
          ariaLabel={`Daily goal — ${tip}`}
          aria-expanded={g.open}
          onClick={() => g.setOpen((o) => !o)}
          className={cn(HEADER_ICON_BTN_CLASS, g.open && HEADER_ICON_BTN_OPEN_CLASS)}
          icon={<GoalRing percent={view.percent} color={tone.ring} size={16} strokeWidth={2} />}
        />
      </HoverTooltip>

      {g.recurDue && (
        <span className="pointer-events-none absolute right-0.5 top-0.5 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
        </span>
      )}

      <AnchoredLayer open={g.open} onClose={g.closePopover} anchorRef={g.wrapRef} placement="bottom-start" gap={8}>
        <GoalPopover g={g} view={view} tone={tone} chipCount={chipCount} hasSwitch={hasSwitch} />
      </AnchoredLayer>
    </div>
  );
}
