'use client';

import type { ReactNode } from 'react';
import {
  elevationClass,
  type RaisedIntensity,
} from '@/design-system/tokens/shadows';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

type WorkspaceCardTone = 'blue' | 'emerald' | 'orange' | 'violet' | 'red' | 'gray';

type WorkspaceCardVariant = 'solid' | 'glass';

/** Default glass plane — primary work cards use raised default intensity. */
const GLASS_RAISED_DEFAULT: RaisedIntensity = 'default';

/** Body padding recipe — `nested` matches stacked overview Notes + Label preview. */
type WorkspaceCardBodyDensity = 'default' | 'nested';

/** White inset inside a glass worksheet — Notes textarea + Label face frame. */
export const WORKSPACE_NESTED_FIELD = `${cornerClass(
  'control',
)} border border-border-soft bg-surface-card`;

/** Padding for {@link WORKSPACE_NESTED_FIELD} — spacing intent `inset-field` (px-3 py-2). */
export const WORKSPACE_NESTED_FIELD_PAD = 'inset-field';

/**
 * Absolute corner for overlays floating on a nested field (insert rail, Edit
 * label CTA). Pair with `absolute` / `pointer-events-none` wrappers.
 */
export const WORKSPACE_NESTED_OVERLAY_CORNER = 'right-1.5 top-1.5';

const BODY_DENSITY_CLASS: Record<WorkspaceCardBodyDensity, string> = {
  default: 'px-5 py-4',
  nested: 'p-3',
};
const WORKSPACE_SURFACE_CORNER = cornerClass('surface');

interface WorkspaceCardProps {
  /** Small uppercase tracking-wide label rendered in the card header. */
  label?: ReactNode;
  /** Optional trailing slot in the header row (e.g. badge, count chip). */
  actions?: ReactNode;
  /** Accent tone for the optional left rail; defaults to no rail. */
  tone?: WorkspaceCardTone;
  /** Body padding density. */
  bodyDensity?: WorkspaceCardBodyDensity;
  /** Extra class on the body wrapper (override padding, etc.). */
  bodyClassName?: string;
  /** Extra class on the outer section. */
  className?: string;
  /**
   * Outer overflow. Defaults to `hidden` (clips the tone rail to the radius).
   * Set `visible` when a child needs to escape the card — e.g. a dropdown or
   * hover popover anchored to a row inside the card.
   */
  overflow?: 'hidden' | 'visible';
  /** Surface treatment. */
  variant?: WorkspaceCardVariant;
  /** Raised intensity for `variant="glass"` only (ignored on solid). */
  elevation?: RaisedIntensity;
  children: ReactNode;
}

const TONE_RAIL: Record<WorkspaceCardTone, string> = {
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  orange: 'bg-orange-500',
  violet: 'bg-violet-500',
  red: 'bg-rose-500',
  gray: 'bg-surface-strong',
};

/** Raised work-card surface used across receiving workspaces. */
export function WorkspaceCard({
  label,
  actions,
  tone,
  bodyDensity = 'default',
  bodyClassName,
  className,
  overflow = 'hidden',
  variant = 'solid',
  elevation = GLASS_RAISED_DEFAULT,
  children,
}: WorkspaceCardProps) {
  const overflowClass = overflow === 'visible' ? 'overflow-visible' : 'overflow-hidden';
  const glass = variant === 'glass';
  // The surface role follows its enclosing mode: rounded on desktop triage,
  // and inherits the active region's readable corner.
  const surfaceClass = glass
    ? cn(
        WORKSPACE_SURFACE_CORNER,
        elevationClass('raised', elevation),
        'ring-1 ring-border-soft/60',
      )
    : cn(
        WORKSPACE_SURFACE_CORNER,
        elevationClass('raised', 'soft'),
        'bg-surface-card ring-1 ring-border-soft/60',
      );
  // Glass keeps ring + shadow on the SECTION and clips only its inset fill.
  const layerClass = glass ? 'relative' : '';
  const bodyPad = bodyClassName ?? BODY_DENSITY_CLASS[bodyDensity];
  return (
    <section
      className={cn('relative', overflowClass, surfaceClass, className)}
    >
      {glass ? (
        <>
          <span
            aria-hidden
            className={cn(
              'absolute inset-0 bg-surface-card/75 backdrop-blur-xl backdrop-saturate-150',
              WORKSPACE_SURFACE_CORNER,
            )}
          />
          {/* Light-catch top hairline — the glass signature. `glass` is the
              scheme-independent white highlight token, correct on light and
              dark surfaces alike. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-glass/60 to-transparent"
          />
        </>
      ) : null}
      {tone ? (
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-[3px] ${TONE_RAIL[tone]}`}
        />
      ) : null}
      {(label || actions) && (
        <header
          className={`flex items-center justify-between gap-2 overflow-visible px-5 pb-1 pt-4 ${layerClass}`}
        >
          {label ? (
            <h3 className="min-w-0 shrink text-role-caption font-semibold text-text-soft">
              {label}
            </h3>
          ) : (
            <span aria-hidden />
          )}
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </header>
      )}
      <div className={`${bodyPad} ${layerClass}`}>{children}</div>
    </section>
  );
}
