'use client';

/**
 * `DeskRecordViewSwitch` — the staffer's choice of record view, named where the
 * record is read (operator 2026-09-25: "the user should have the choice to view
 * the data how they want to"). Two faces over the desk stage's ONE view
 * state, never a second state:
 *
 * - **In place** — the record takes the list's place at the list's width.
 * - **Split** — a fixed, padded list on the left for finding; the record on the
 *   right, one column (owner 2026-09-26: easily triageable).
 *
 * Each option wears a small drawing of its layout (owner 2026-09-27: "more
 * user-friendly identification") — a whole panel for In place, list rows +
 * a record panel for Split — so the choice reads before the word does. It
 * lives on the record header AND on the list's bar, so the view is visible
 * and switchable before any record is open.
 *
 * - **Floor** — the industrial full canvas: edge-to-edge rows, records in a
 *   right rail. Offered only while a list registers a floor face
 *   (`useDeskFloorFace`); never remembered.
 *
 * ONE control for all three (owner 2026-09-27) — it is the only view switch on
 * any list bar or record header, and it stays checked on Floor while in floor
 * so the way out is the same control as the way in. Renders nothing off a desk
 * stage (station embed, modal host): a dead switch is worse than none.
 */

import { useId, useRef, type KeyboardEvent } from 'react';
import { HotkeyTooltip } from '@/components/ui/HotkeyTooltip';
import { LayoutGroup, motion, motionRole, useReducedMotion } from '@/design-system/motion';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  DESK_FLOOR_SHORTCUT_HINT,
  DESK_SPLIT_SHORTCUT_HINT,
  useDeskStageOptional,
  type DeskStageView,
} from './DeskStageContext';

/** In place: the record fills the stage where the list was. */
function InPlaceGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 16" fill="none" aria-hidden className={className}>
      <rect x="1" y="1" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3.5" y="3.5" width="13" height="9" rx="1" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

/** Split: list rows on the left, the record panel on the right. */
function SplitGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 16" fill="none" aria-hidden className={className}>
      <rect x="1" y="1" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 4.5h5M3.5 8h5M3.5 11.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="11" y="3.5" width="5.5" height="9" rx="1" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

/** Floor: rows edge to edge across the whole frame, a narrow record rail at the right. */
function FloorGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 16" fill="none" aria-hidden className={className}>
      <rect x="1" y="1" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 4.5h9M3.5 8h9M3.5 11.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="14" y="3.5" width="2.5" height="9" rx="0.75" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

/**
 * Each option teaches what it does plus its chord, through the ONE hotkey hint
 * every control wears ({@link HotkeyTooltip} → keycaps). In place and Split
 * share ⌘/Ctrl+Shift+S — the chord flips between them.
 */
const VIEWS: readonly { view: DeskStageView; label: string; action: string; chord: string; Glyph: typeof InPlaceGlyph }[] = [
  { view: 'in-place', label: 'In place', action: 'Open records over the list, full width', chord: DESK_SPLIT_SHORTCUT_HINT, Glyph: InPlaceGlyph },
  { view: 'split', label: 'Split', action: 'Keep the list, open records beside it', chord: DESK_SPLIT_SHORTCUT_HINT, Glyph: SplitGlyph },
  { view: 'floor', label: 'Floor', action: 'Rows across the whole screen, records in a rail', chord: DESK_FLOOR_SHORTCUT_HINT, Glyph: FloorGlyph },
];

export function DeskRecordViewSwitch({
  className,
  labels = 'always',
}: {
  className?: string;
  /** `wide`: the words show only in a wide `@container` (the list bar); the drawings always do. */
  labels?: 'always' | 'wide';
}) {
  const stage = useDeskStageOptional();
  const groupId = useId();
  const reduce = useReducedMotion();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  if (!stage) return null;

  const transition = reduce ? { duration: 0 } : motionRole.record.pane.transition;
  const options = VIEWS.filter((v) => v.view !== 'floor' || stage.floorAvailable || stage.view === 'floor');
  const activeIndex = Math.max(0, options.findIndex((v) => v.view === stage.view));

  // Radiogroup keys: arrows move AND select (WAI-ARIA radio pattern), Home/End jump.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1;
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = activeIndex === last ? 0 : activeIndex + 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = activeIndex === 0 ? last : activeIndex - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    stage.setView(options[next].view);
    buttons.current[next]?.focus();
  };

  return (
    <LayoutGroup id={groupId}>
      <div
        role="radiogroup"
        aria-label="Record view"
        data-testid="desk-record-view-switch"
        onKeyDown={onKeyDown}
        className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-mode-control bg-surface-sunken p-0.5', className)}
      >
        {options.map(({ view, label, action, chord, Glyph }, index) => {
          const active = stage.view === view;
          return (
            <HotkeyTooltip key={view} action={action} chord={chord} placement="above">
            <button
              ref={(el) => {
                buttons.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              tabIndex={index === activeIndex ? 0 : -1}
              data-testid={`desk-record-view-${view}`}
              onClick={active ? undefined : () => stage.setView(view)}
              className={cn(
                'relative inline-flex h-7 items-center gap-1.5 rounded-mode-control px-2 text-role-caption font-medium transition-colors duration-mode-feedback',
                active ? 'text-text-default' : 'text-text-muted hover:text-text-default',
                focusRing('control'),
              )}
            >
              {active ? (
                // The face slides between the two options — the choice reads as
                // one object moving, not two buttons repainting.
                <motion.span
                  layoutId="desk-record-view-face"
                  transition={transition}
                  className="absolute inset-0 rounded-mode-control bg-surface-card shadow-elev-soft"
                  aria-hidden
                />
              ) : null}
              <Glyph className={cn('relative h-3.5 w-[18px]', active && 'text-text-info')} />
              <span className={cn('relative', labels === 'wide' && 'hidden @4xl:inline')}>{label}</span>
            </button>
            </HotkeyTooltip>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
