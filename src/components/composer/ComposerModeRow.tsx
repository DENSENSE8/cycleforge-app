'use client';

/**
 * Mode + procedure row BELOW the OmnichannelComposerDock outline — hard rule.
 *
 *   ┌─────────────────────────────────────────┐
 *   │  textarea…                              │
 *   │ [+]           [Location] [↵] [Print?]   │
 *   └─────────────────────────────────────────┘
 *   [ Unbox ] [ Ticket ]              ( ◠ ring )
 *
 * Unbox + Ticket clustered leftmost; icon always left of label.
 * Unbox glyph blue; Ticket glyph carton orange. Ring far right.
 */

import { type ComponentType, type ReactNode } from 'react';
import { PackageOpen, Ticket } from '@/components/Icons';
import { ScanStationProgressRing } from '@/components/station/ScanStationProgressRing';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { COMPOSER_SHELL_CORNER } from '@/design-system/tokens/radius';
import {
  STATION_COMPOSER_CYCLE_CHORD,
  STATION_COMPOSER_MODE_CATALOG,
  type StationComposerMode,
} from '@/lib/composer/station-composer-mode';

const MODE_ICON: Record<
  StationComposerMode,
  ComponentType<{ className?: string }>
> = {
  unbox: PackageOpen,
  ticket: Ticket,
};

const MODE_ICON_TONE: Record<StationComposerMode, string> = {
  unbox: 'text-blue-600',
  ticket: 'text-orange-500',
};

/**
 * Compact dock inset (`p-1.5`) plus the outline’s 1px border — the mode row
 * is a sibling *under* the outline, so it recreates the dock’s inner start
 * and end. Unbox sits in the same `w-8` column as `+`; the procedure ring
 * sits in the same `w-8` column as Enter (`CornerDownLeft`).
 */
const COMPOSER_ROW_INSET = 'px-[calc(0.375rem+1px)]';

/**
 * Glyph cell for Unbox / Ticket — sized to the SVG, not the composer `+`
 * hit (`w-8`). A 32px column with a 14px drawing left a dead band between
 * the icon and the word (operator 2026-08-31).
 */
const COMPOSER_MODE_ICON_COLUMN =
  'flex h-5 w-3.5 shrink-0 items-center justify-center';

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

function ModeFace({
  id,
  active,
  onSelect,
}: {
  id: StationComposerMode;
  active: boolean;
  onSelect: () => void;
}) {
  const entry =
    STATION_COMPOSER_MODE_CATALOG.find((m) => m.id === id) ??
    STATION_COMPOSER_MODE_CATALOG[0]!;
  const Icon = MODE_ICON[id];
  return (
    <button
      type="button"
      aria-label={`Composer mode · ${entry.label}`}
      aria-pressed={active}
      data-testid={`composer-mode-${id}`}
      data-composer-mode-face={id}
      onClick={onSelect}
      className={cn(
        COMPOSER_TOOLBAR_ITEM,
        'pr-1.5',
        'text-role-micro font-semibold',
        // No hover wash on the unselected face: the row is a state readout, and
        // a background that appears under the cursor competes with the one
        // signal that matters — which mode you are in (ruling 2026-08-31).
        active ? 'text-text-default' : 'text-text-faint',
        focusRing('control', 'accent'),
      )}
    >
      <span className={COMPOSER_MODE_ICON_COLUMN} aria-hidden>
        <Icon
          className={cn(
            COMPOSER_TOOLBAR_GLYPH,
            // The glyph carries its mode colour ONLY when selected. Colour is
            // the loudest thing on this row, so spending it on both faces made
            // them equally loud and the selection hard to find.
            active ? MODE_ICON_TONE[id] : 'text-text-faint',
          )}
        />
      </span>
      <span className="tracking-wide">{entry.label}</span>
    </button>
  );
}

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
  const ringLabel = `Procedure · ${clamped}% complete — open displays`;

  return (
    <button
      type="button"
      data-testid="composer-procedure-ring"
      aria-label={ringLabel}
      title={ringLabel}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={!onClick}
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
    </button>
  );
}

/**
 * Horizontal Unbox | Ticket (left cluster) + procedure ring BELOW the outline.
 */
export function ComposerModeRow({
  mode,
  onModeChange,
  progressPercent = 0,
  progressTone = 'idle',
  onProgressClick,
  leading,
}: {
  mode: StationComposerMode;
  onModeChange: (next: StationComposerMode) => void;
  progressPercent?: number;
  progressTone?: 'idle' | 'selected';
  onProgressClick?: () => void;
  leading?: ReactNode;
}) {
  return (
    <div
      className={cn(
        // Below the dock (z-base < z-raised) so the dock's raised shadow
        // paints across Unbox | Ticket instead of being covered by this plate.
        'composer-row relative z-base flex h-5 w-full min-w-0 items-center gap-1.5 overflow-hidden bg-surface-card',
        COMPOSER_SHELL_CORNER,
        COMPOSER_ROW_INSET,
      )}
      data-testid="composer-mode-row"
      data-composer-mode={mode}
      role="toolbar"
      aria-label="Composer mode"
    >
      <div className="flex shrink-0 items-center gap-0.5">
        <ModeFace
          id="unbox"
          active={mode === 'unbox'}
          onSelect={() => onModeChange('unbox')}
        />
        <ModeFace
          id="ticket"
          active={mode === 'ticket'}
          onSelect={() => onModeChange('ticket')}
        />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {leading}
        {/* Cycle chord, once, after the two faces — the third thing you can
            press, not a property of either mode. */}
        {/* The chord is PAINTED, not hidden in a tooltip — a shortcut nobody
            can see is a shortcut nobody uses. In WORDS, not ⇧⇥: this bench runs
            Windows workstations and Mac key glyphs are one more thing to decode
            mid-carton (operator ruling 2026-08-31). */}
        <span
          className="hidden shrink-0 text-role-micro font-normal text-text-faint md:inline"
          title="Toggle composer mode"
        >
          {STATION_COMPOSER_CYCLE_CHORD}
        </span>
      </div>
      <ComposerProcedureRingButton
        percent={progressPercent}
        tone={progressTone}
        onClick={onProgressClick}
        pressed={progressTone === 'selected'}
      />
    </div>
  );
}
