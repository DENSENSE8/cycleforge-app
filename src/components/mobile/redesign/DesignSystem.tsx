'use client';

import { motion } from '@/design-system/motion';
import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * Mobile shell primitives — thin compositions over the house design system.
 *
 * ## This file used to be a second design language
 *
 * It shipped as "USAV Mobile 2026 Design Tokens", a self-contained palette of
 * literal Tailwind blues (`text-blue-950` for body ink, `text-blue-400` for
 * muted, `bg-blue-50/50` glass), soft radii (`rounded-2xl`, `rounded-[28px]`)
 * and hand-mixed rgba shadows. Every one of those is banned by the house
 * identity: colour comes from semantic tokens only, ops chrome is flush-square,
 * and "A second visual language beside Kinetic Ledger tokens" is on the Always
 * Ban list. A phone is an operator surface — the kiosk counter is the ONE
 * radius exemption, and this is not it.
 *
 * The rewrite (2026-08-21) kept every export name, so no consumer churned.
 * What changed is what they resolve to.
 *
 * ## The token object is nearly all dead weight — deliberately kept small
 *
 * Across 15 consumers the only field with real reach is `colors.background`
 * (17 uses), which was already the house `bg-surface-canvas`. `radius`,
 * `motion`, `primaryGradient`, `primaryDark` and the rest had zero or one call
 * site each. They are gone rather than restated in house tokens: a token
 * namespace nothing reads is how a second language grows back.
 */
export const TOKENS = {
  colors: {
    /** Page ground for every mobile surface. */
    background: 'bg-surface-canvas',
    /** Raised panel on that ground. */
    card: 'bg-surface-card border border-border-soft',
    text: {
      muted: 'text-text-muted',
    },
  },
} as const;

/**
 * Canonical mobile gutter — the single horizontal inset shared by every mobile
 * feed/table row. The mobile analog of the desktop `SIDEBAR_GUTTER` (px-1.5):
 * one value, applied in exactly ONE place (CaptureStackRow), so all tables align.
 *
 * Feeds must NOT add their own outer `px-*` — the row card supplies the gutter,
 * and doubling it up is the inconsistency this token exists to prevent.
 *
 * `MOBILE_GUTTER` is the padding form (collapsed rows); `MOBILE_GUTTER_X` is the
 * margin form for the floating expanded card. Keep the two on the same step.
 */
export const MOBILE_GUTTER = 'px-1.5';
export const MOBILE_GUTTER_X = 'mx-1.5';

/**
 * Flush panel on the mobile canvas. Depth is a plane step + hairline, never a
 * tinted shadow — same rule the spine accent module states for nav chrome.
 */
export const MobileCard = ({
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
export const BentoItem = ({
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
export const SectionHeader = ({
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

/**
 * Full-width mobile action. A thin size preset over {@link Button} — it exists
 * for the 56px thumb target, not for a face of its own, so it carries no fill
 * classes and inherits every variant from `button-variants.ts`.
 *
 * It used to hand-paint `bg-blue-600 shadow-xl shadow-blue-600/20` and a
 * `rounded-2xl`, which is the "do not paint over primitives" ban verbatim.
 */
export const GlassButton = ({
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
