'use client';

import { motion } from '@/design-system/motion';
import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/** Mobile shell primitives — thin compositions over the house design system. */
export const TOKENS = {
  colors: {
    /** Page ground for every mobile surface — white sheet; depth lives on cards. */
    background: appMobilePageGroundClass,
    /** Raised panel on that ground. */
    card: 'bg-surface-card border border-border-soft',
    text: {
      muted: 'text-text-muted',
    },
  },
} as const;

/** Canonical mobile gutter — the single horizontal inset shared by every mobile feed/table row. */
export const MOBILE_GUTTER = 'px-1.5';
export const MOBILE_GUTTER_X = 'mx-1.5';

/**
 * Flush panel on the mobile canvas. Depth is a plane step + hairline, never a
 * tinted shadow — same rule the spine accent module states for nav chrome.
 */
const MobileCard = ({
  children,
  className = '',
  onClick,
  variant = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  /** `glass` is the recessed variant — a sunken plane, not a blur wash. */
  variant?: 'default' | 'glass' | 'flat';
}) => (
  <motion.div
    whileTap={onClick ? { scale: 0.99 } : undefined}
    onClick={onClick}
    className={cn(
      variant === 'glass'
        ? 'bg-surface-sunken border border-border-hairline'
        : variant === 'flat'
          ? 'bg-surface-canvas border border-border-hairline'
          : TOKENS.colors.card,
      cornerClass('flush'),
      'p-4',
      onClick && 'cursor-pointer transition-colors hover:bg-surface-hover',
      className,
    )}
  >
    {children}
  </motion.div>
);

/** Titled block on the mobile canvas — label row over a {@link MobileCard}. */
const BentoItem = ({
  children,
  className = '',
  title,
  icon: Icon,
  variant = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'glass';
}) => (
  <div className={cn('flex flex-col gap-2', className)}>
    {title && (
      <div className="flex items-center gap-2 px-1">
        {Icon && <Icon className="h-3.5 w-3.5 text-text-faint" />}
        <span className="text-role-micro uppercase tracking-[0.15em] text-text-soft">{title}</span>
      </div>
    )}
    <MobileCard variant={variant} className="flex-1">
      {children}
    </MobileCard>
  </div>
);

/** Section label over a mobile list, with an optional trailing verb. */
const SectionHeader = ({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <div className="mb-3 flex items-center justify-between px-1">
    <span className="text-role-caption font-semibold uppercase tracking-[0.2em] text-text-soft">
      {title}
    </span>
    {actionLabel && (
      <Button
        variant="ghost"
        onClick={onAction}
        className="h-auto px-0 text-role-caption font-semibold uppercase tracking-wider"
      >
        {actionLabel}
      </Button>
    )}
  </div>
);

/** Full-width mobile action. */
const GlassButton = ({
  children,
  onClick,
  className = '',
  variant = 'primary',
  icon: Icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'blue';
  icon?: React.ComponentType<{ className?: string }>;
}) => (
  <Button
    variant={variant === 'blue' ? 'brand' : variant}
    onClick={onClick}
    icon={Icon ? <Icon className="h-5 w-5" /> : undefined}
    // ds-allow-control-size — full-width mobile commit, sized for a gloved thumb.
    className={cn('h-14 w-full justify-center px-6 text-sm font-semibold uppercase tracking-wider', className)}
  >
    {children}
  </Button>
);
