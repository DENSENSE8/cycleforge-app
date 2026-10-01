'use client';

/**
 * Context + procedure row BELOW the OmnichannelComposerDock outline.
 * Header tasks own Ticket versus station work. This row keeps the context
 * caption and the procedure ring — no Unbox/Ticket faces.
 */

import { type ComponentType, type ReactNode } from 'react';
import { AskMark, PackageOpen, Ticket } from '@/components/Icons';
import { ScanStationProgressRing } from '@/components/station/ScanStationProgressRing';
import { cursorClickTarget } from '@/design-system/motion/cursor-scrub';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { COMPOSER_SHELL_CORNER, cornerClass } from '@/design-system/tokens/radius';
import { type StationComposerMode } from '@/lib/composer/station-composer-mode';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

/**
 * The mode glyph, exported: every face that names a mode — this row and the
 * dock's inline row-two chip — draws the SAME icon left of the same word.
 *
 * `ask` is {@link AskMark}, NOT `Sparkles` (2026-09-06). The sparkle is the
 * app's general "AI touched this" sticker in eight other jobs; borrowing it
 * for the assistant's own identity made the operator's one conversational
 * surface look like a consumer novelty. The assistant now owns a machined
 * mark, and this map is the single swap point for it.
 */
export const STATION_COMPOSER_MODE_ICON: Record<
  StationComposerMode,
  ComponentType<{ className?: string }>
> = {
  unbox: PackageOpen,
  ticket: Ticket,
  ask: AskMark,
};


/**
 * The Ask face's fill — a teal wash on the smallest corner the ladder owns
 * (`chip`, 4px), and NOTHING else: no ring, no border (operator 2026-09-07).
 * A hairline around a 4px chip at 10px type is a second edge inside the dock's
 * own outline, and the wash alone already separates the face from the row.
 *
 * Only `ask` takes it. It is the mode that changes who the Enter key is
 * talking to, and the row is otherwise a colour-and-weight readout with no
 * shape to it — one filled chip says "you are talking to the agent" from
 * across the room, which ink alone at 10px did not. `unbox` / `ticket` stay
 * unfilled: a wash on all three would be three chips and no signal.
 */
export const COMPOSER_ASK_CHIP_CLASS = cn(
  'bg-hue-teal-wash text-hue-teal-ink',
  cornerClass('chip'),
);


/**
 * Compact dock inset (`p-1.5`) plus the outline’s 1px border — the mode row
 * is a sibling *under* the outline, so it recreates the dock’s inner start
 * and end. Unbox sits in the same `w-8` column as `+`; the procedure ring
 * sits in the same `w-8` column as Enter (`CornerDownLeft`).
 */
const COMPOSER_ROW_INSET = 'px-[calc(0.375rem+1px)]';


/**
 * Same width as the composer Enter hit cell (`h-8 w-8`) — the procedure
 * ring sits in that trailing column.
 */
const COMPOSER_DOCK_ICON_COLUMN =
  'flex h-5 w-8 shrink-0 items-center justify-center';

/** Face chrome — icon + word with a tight gap (spacingScale.0.5). */
const COMPOSER_TOOLBAR_ITEM =
  'ds-raw-button flex h-5 items-center gap-0.5 rounded-sm leading-none';

/**
 * Same SVG face as {@link PackageOpen}: `block` kills the inline-SVG baseline
 * strut that used to sit the Unbox drawing below a geometrically-centered ring.
 */
const COMPOSER_TOOLBAR_GLYPH = 'block h-3.5 w-3.5 shrink-0';

export function ComposerProcedureRingButton({
  percent = 0,
  tone = 'idle',
  onClick,
  pressed = false,
}: {
  percent?: number;
  tone?: 'idle' | 'selected';
  onClick?: () => void;
  pressed?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const ringLabel = onClick
    ? `Procedure · ${clamped}% complete — show details`
    : `Procedure · ${clamped}% complete`;

  return (
    <HoverTooltip label={ringLabel} asChild><button
      type="button"
      data-testid="composer-procedure-ring"
      aria-label={ringLabel}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={!onClick}
      {...(onClick ? cursorClickTarget(ringLabel) : null)}
      className={cn(
        COMPOSER_TOOLBAR_ITEM,
        COMPOSER_DOCK_ICON_COLUMN,
        'context-ring',
        onClick ? cn('cursor-pointer', focusRing('control', 'accent')) : 'cursor-default',
        pressed && 'text-text-default',
      )}
    >
      <ScanStationProgressRing
        percent={clamped}
        tone={tone}
        className={COMPOSER_TOOLBAR_GLYPH}
      />
    </button></HoverTooltip>
  );
}

/** Context caption and procedure ring under the composer outline. */
export function ComposerModeRow({
  mode,
  progressPercent = 0,
  progressTone = 'idle',
  onProgressClick,
  leading,
}: {
  mode: StationComposerMode;
  progressPercent?: number;
  progressTone?: 'idle' | 'selected';
  onProgressClick?: () => void;
  leading?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'composer-row relative z-base flex h-5 w-full min-w-0 items-center gap-1.5 overflow-hidden bg-surface-card',
        COMPOSER_SHELL_CORNER,
        COMPOSER_ROW_INSET,
      )}
      data-testid="composer-mode-row"
      data-composer-mode={mode}
      role="toolbar"
      aria-label="Composer context"
    >
      {leading}
      <div className="min-w-0 flex-1" aria-hidden />
      <ComposerProcedureRingButton
        percent={progressPercent}
        tone={progressTone}
        onClick={onProgressClick}
        pressed={progressTone === 'selected'}
      />
    </div>
  );
}
