'use client';

/**
 * The phone's stage switcher: the four stages as one row of tabs over a
 * single column, each with its glyph, hue and count. Tapping a tab pages the
 * column; swiping the column moves the tab.
 */

import { STATE_OUTLINE_CLASS } from '@/design-system/components/record-card/record-card-outline';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { PACKAGE_STAGE_META, type PackageStage } from '@/lib/live-feed/stages';
import type { PackageColumn } from '@/lib/live-feed/types';
import { cn } from '@/utils/_cn';
import { STAGE_LOOK } from './stage-look';

export function StageTabs({
  columns,
  active,
  onPick,
}: {
  columns: readonly PackageColumn[];
  active: PackageStage;
  onPick: (stage: PackageStage) => void;
}) {
  return (
    <div role="tablist" aria-label="Stages" className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1" data-testid="live-feed-stage-tabs">
      {columns.map((column) => {
        const look = STAGE_LOOK[column.stage];
        const on = column.stage === active;
        return (
          // ds-raw-button: a stage tab carries its own hue, glyph and count — TabSwitch paints one accent for every tab.
          <button
            key={column.stage}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onPick(column.stage)}
            data-stage-tab={column.stage}
            className={cn(
              'relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition',
              focusRing('cell'),
              on ? 'bg-white shadow-sm' : 'text-slate-500 active:bg-white/60',
            )}
          >
            <span className="flex items-center gap-1">
              <look.Icon className={cn('size-3.5', on ? look.ink : 'text-slate-400')} />
              <span className={cn('text-lg font-semibold leading-none tabular-nums', on ? 'text-slate-900' : 'text-slate-600')}>
                {column.count}
              </span>
            </span>
            <span className={cn('truncate text-xs font-medium', on ? look.ink : 'text-slate-500')}>
              {PACKAGE_STAGE_META[column.stage].label}
            </span>
            <span aria-hidden className={cn('mt-0.5 h-0.5 w-6 rounded-full', on ? look.solid : 'bg-transparent')} />
            {on ? <span aria-hidden className={cn(STATE_OUTLINE_CLASS, 'border-slate-900/5')} /> : null}
          </button>
        );
      })}
    </div>
  );
}
