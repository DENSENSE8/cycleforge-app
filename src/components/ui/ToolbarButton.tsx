'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** ToolbarButton — the single visual method for a Linear-style **view toolbar**. */
interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Solid-blue "selected / on" fill. */
  active?: boolean;
  /** Square icon-only control (width locks to the height). Omit for a labeled pill. */
  iconOnly?: boolean;
  children?: ReactNode;
}

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton(
    { active = false, iconOnly = false, className, type = 'button', children, ...rest },
    ref,
  ) {
    return (
      // ds-raw-button: shared view-toolbar control; solid-blue active fill no single DS Button variant expresses.
      <button
        ref={ref}
        type={type}
        data-active={active || undefined}
        className={cn(
          'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg text-role-eyebrow uppercase tracking-widest transition-colors active:scale-95',
          focusRing('control'),
          iconOnly ? 'w-8' : 'px-2.5',
          active
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
            : 'bg-transparent text-text-muted hover:bg-surface-hover hover:text-text-default',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

/** One icon tab inside {@link ToolbarSegmentGroup}. */
export type ToolbarSegmentItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

/**
 * Grouped icon-only toggles — same height and solid-blue active fill as
 * {@link ToolbarButton}, ghost between segments. Use for mutually exclusive
 * view modes (e.g. 1-up / 2-up).
 */
export function ToolbarSegmentGroup({
  items,
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  items: ToolbarSegmentItem[];
  value: string;
  onChange: (id: string) => void;
  'aria-label'?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex h-8 shrink-0 overflow-hidden rounded-lg"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = value === item.id;
        return (
          // ds-raw-button: segmented toolbar tab; shares ToolbarButton active/hover language.
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            aria-label={item.label}
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors active:scale-95',
              focusRing('control'),
              active
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                : 'bg-transparent text-text-muted hover:bg-surface-hover hover:text-text-default',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
