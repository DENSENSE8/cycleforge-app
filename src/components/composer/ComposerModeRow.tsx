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
import {
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

/** Same width as the composer `+` / Enter hit cells (`h-8 w-8`). */
const COMPOSER_DOCK_ICON_COLUMN =
  'flex h-5 w-8 shrink-0 items-center justify-center';

/** Same box the Unbox glyph and the far-right ring sit in — one display method. */
const COMPOSER_TOOLBAR_ITEM =
  'ds-raw-button flex h-5 items-center gap-1 rounded-sm leading-none';

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
        id === 'unbox' ? 'pr-1.5' : 'px-1.5',
        'text-role-micro font-semibold',
        active
          ? 'text-text-default'
          : 'text-text-faint hover:bg-surface-sunken hover:text-text-muted',
        focusRing('control', 'accent'),
      )}
    >
      {id === 'unbox' ? (
        <span className={COMPOSER_DOCK_ICON_COLUMN} aria-hidden>
          <Icon className={cn(COMPOSER_TOOLBAR_GLYPH, MODE_ICON_TONE[id])} />
        </span>
      ) : (
        <Icon className={cn(COMPOSER_TOOLBAR_GLYPH, MODE_ICON_TONE[id])} />
      )}
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
      className={cn('composer-row flex h-5 w-full min-w-0 items-center gap-1.5', COMPOSER_ROW_INSET)}
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
      <div className="flex min-w-0 flex-1 items-center gap-1">{leading}</div>
      <ComposerProcedureRingButton
        percent={progressPercent}
        tone={progressTone}
        onClick={onProgressClick}
        pressed={progressTone === 'selected'}
      />
    </div>
  );
}
