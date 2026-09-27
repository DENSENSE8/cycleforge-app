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
 * Unbox + Ticket + Ask clustered leftmost; icon always left of label.
 * Unbox glyph blue; Ticket glyph carton orange; Ask glyph purple. Ring far right.
 */

import { type ComponentType, type ReactNode } from 'react';
import { AskMark, PackageOpen, Ticket } from '@/components/Icons';
import { ScanStationProgressRing } from '@/components/station/ScanStationProgressRing';
import { cursorClickTarget } from '@/design-system/motion/cursor-scrub';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { COMPOSER_SHELL_CORNER, cornerClass } from '@/design-system/tokens/radius';
import { HotkeyTooltip } from '@/components/ui/HotkeyTooltip';
import {
  STATION_COMPOSER_CYCLE_CHORD,
  STATION_COMPOSER_MODE_CATALOG,
  type StationComposerMode,
} from '@/lib/composer/station-composer-mode';
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

const MODE_ICON = STATION_COMPOSER_MODE_ICON;

const MODE_ICON_TONE: Record<StationComposerMode, string> = {
  unbox: 'text-blue-600',
  ticket: 'text-hue-orange-ink',
  // Teal, not purple (operator 2026-09-07): purple read as a consumer-AI
  // sticker beside the two work modes, and the selected face now paints a teal
  // wash the glyph has to sit inside.
  ask: 'text-hue-teal-ink',
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

const MODE_FACE_ASK_ACTIVE = COMPOSER_ASK_CHIP_CLASS;

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

export function ModeFace({
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
  const face = (
    <button
      type="button"
      aria-label={`Composer mode · ${entry.label}`}
      aria-pressed={active}
      data-testid={`composer-mode-${id}`}
      data-composer-mode-face={id}
      // Kind only, no label: the face already reads "Unbox", so a chip that
      // also reads "Unbox" teaches nothing and puts chrome under the hand on
      // every pass. The one thing worth teaching here is the chord, and that
      // rides {@link HotkeyTooltip} below.
      {...cursorClickTarget()}
      onClick={onSelect}
      className={cn(
        COMPOSER_TOOLBAR_ITEM,
        // `pl-1` only when the ask face is filled: a wash needs the same air on
        // both sides of the glyph, and the unfilled faces still start flush in
        // the dock's icon column.
        active && id === 'ask' ? 'pl-1 pr-1.5' : 'pr-1.5',
        'text-role-micro font-semibold',
        // No hover wash on the unselected face: the row is a state readout, and
        // a background that appears under the cursor competes with the one
        // signal that matters — which mode you are in (ruling 2026-08-31).
        active ? 'text-text-default' : 'text-text-faint',
        active && id === 'ask' && MODE_FACE_ASK_ACTIVE,
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

  // Every face teaches the chord, selected or not (operator 2026-09-06). Only
  // one chip is ever on screen — it rides the pointer — so this is not the
  // same key printed three times; it is the same answer wherever the hand
  // happens to ask. The action is the chord's, not the face's: Shift + Tab
  // cycles the row, so it reads the same on all three.
  return (
    <HotkeyTooltip action="Switch mode" chord={STATION_COMPOSER_CYCLE_CHORD}>
      {face}
    </HotkeyTooltip>
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

/**
 * Horizontal Unbox | Ticket (left cluster) + procedure ring BELOW the outline.
 *
 * `showModeFaces={false}` hides Unbox | Ticket and keeps the trailing ring.
 * Ask is never painted here: the assistant has one door (`/ai-chat`), and
 * that surface names Ask inline in its own composer row.
 */
export function ComposerModeRow({
  mode,
  onModeChange,
  progressPercent = 0,
  progressTone = 'idle',
  onProgressClick,
  leading,
  showModeFaces = true,
}: {
  mode: StationComposerMode;
  onModeChange: (next: StationComposerMode) => void;
  progressPercent?: number;
  progressTone?: 'idle' | 'selected';
  onProgressClick?: () => void;
  leading?: ReactNode;
  /** When false, only the bottom-right context / procedure ring paints. */
  showModeFaces?: boolean;
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
      data-composer-mode-faces={showModeFaces ? 'true' : 'false'}
      role="toolbar"
      aria-label={showModeFaces ? 'Composer mode' : 'Composer context'}
    >
      {showModeFaces ? (
        <>
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
        </>
      ) : (
        <>
          {leading}
          <div className="min-w-0 flex-1" aria-hidden />
        </>
      )}
      <ComposerProcedureRingButton
        percent={progressPercent}
        tone={progressTone}
        onClick={onProgressClick}
        pressed={progressTone === 'selected'}
      />
    </div>
  );
}
