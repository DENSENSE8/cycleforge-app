'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cornerClass } from '@/design-system/tokens/radius';

// ─── Panel ───────────────────────────────────────────────────────────────────

type PanelPadding = 'none' | 'sm' | 'md' | 'lg';
type PanelRadius = 'none' | 'lg' | 'xl' | '2xl';
/** `none` / `sm` / `md` are the original raw-shadow steps, kept byte-identical so no existing Panel moves. */
type PanelElevation = 'none' | 'sm' | 'md' | 'raised' | 'overlay';

const PADDING: Record<PanelPadding, string> = {
  none: 'p-0',
  // `inset-card` = p-4 via the Tier-2 spacing intent (spacing plan Phase 3.2)
  // — pixel-identical, but the panel body now shares the card-inset SoT.
  sm: 'inset-card',
  md: 'p-5',
  lg: 'p-6',
};

const RADIUS: Record<PanelRadius, string> = {
  none: cornerClass('flush'),
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
};

const ELEVATION: Record<PanelElevation, string> = {
  none: '',
  sm: 'shadow-sm',
  md: 'shadow-md',
  raised: elevationClass('raised'),
  overlay: elevationClass('overlay'),
};

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  /** Inner padding from the spacing scale. Default `md`. */
  padding?: PanelPadding;
  /** Corner radius from the radius scale. Default `none` (flush-square). */
  radius?: PanelRadius;
  /** Drop shadow from the elevation scale. Default `sm`. */
  elevation?: PanelElevation;
  /** Drop the border (e.g. for a nested/recessed panel). Default false. */
  borderless?: boolean;
}

export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { children, padding = 'md', radius = 'none', elevation = 'sm', borderless = false, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'bg-surface-card text-text-default',
        !borderless && 'border border-border-soft',
        RADIUS[radius],
        ELEVATION[elevation],
        PADDING[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

// ─── PanelHeader ─────────────────────────────────────────────────────────────

interface PanelHeaderProps {
  /** Primary title row. */
  title: ReactNode;
  /** Optional muted line under the title. */
  subtitle?: ReactNode;
  /** Trailing slot (e.g. an action button or status badge). */
  actions?: ReactNode;
  className?: string;
}

function PanelHeader({ title, subtitle, actions, className }: PanelHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <div className="text-base font-semibold leading-tight text-text-default">{title}</div>
        {subtitle && <div className="mt-0.5 text-sm text-text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── PanelFooter ─────────────────────────────────────────────────────────────

interface PanelFooterProps {
  children?: ReactNode;
  className?: string;
}

/** Action row separated from the panel body by a hairline divider. */
export function PanelFooter({ children, className }: PanelFooterProps) {
  return (
    <div className={cn('mt-5 flex flex-wrap items-center gap-2 border-t border-border-soft pt-5', className)}>
      {children}
    </div>
  );
}
