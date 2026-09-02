'use client';

/**
 * The shared fixed-width tab face for desk page modes.
 *
 * `shrink-0` is intentional: tab activation must not resize the row or move
 * neighboring tabs. The label content is centered inside that existing trigger
 * width; callers must not replace this with a flex-growing tab or a first-tab
 * padding exception.
 *
 * Reorder is **this row**: hold-drag a DeskTab left/right. Not Studio, not
 * MasterNav, not a second arrange list. Dropping does not mint or delete tabs.
 */

import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cornerClass } from '../tokens/radius';
import { focusRing } from '../tokens/focus-ring';
import { DESK_TAB_TRIGGER_CLASS } from '../tokens/desk-stage';
import { cn } from '@/utils/_cn';

export interface DeskPageTab {
  id: string;
  label: string;
  /** Rows behind the tab. Omit for honest absence — never print a fake 0. */
  count?: number;
  /** Optional glyph from the house catalog (adapter renders the node). */
  icon?: ReactNode;
}

export interface DeskTabProps {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  testId?: string;
  /** Optional catalog glyph; must not grow the trigger (fixed-width, centered). */
  icon?: ReactNode;
  style?: CSSProperties;
  className?: string;
  /** Hold-drag listeners from the tablist — do not restyle the face. */
  drag?: HTMLAttributes<HTMLButtonElement>;
}

export const DeskTab = forwardRef<HTMLButtonElement, DeskTabProps>(function DeskTab(
  { active, label, count, onClick, testId, icon, style, className, drag },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      style={style}
      {...drag}
      role="tab"
      aria-selected={active}
      onClick={onClick}
      data-testid={testId}
      data-active={active ? '' : undefined}
      className={cn(
        DESK_TAB_TRIGGER_CLASS,
        '-mb-px border-b',
        'transition-colors duration-100 ease-out',
        cornerClass('flush'),
        focusRing('control'),
        active
          ? 'border-text-default font-semibold text-text-default'
          : 'border-transparent text-text-muted hover:text-text-default',
        className,
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {typeof count === 'number' ? (
        <span
          className={cn(
            'tabular-nums text-role-micro',
            active ? 'text-text-soft' : 'text-text-faint',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </button>
  );
});
