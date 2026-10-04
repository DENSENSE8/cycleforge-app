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
 * ONE control (owner 2026-09-27) — it is the only view switch on any list bar
 * or record header. The desktop has exactly these two views (owner
 * 2026-09-28: no Floor). Renders nothing off a desk stage (station embed,
 * modal host): a dead switch is worse than none.
 */

import { useEffect } from 'react';
import { cn } from '@/utils/_cn';
import { DESK_SPLIT_SHORTCUT_HINT, useDeskStageOptional, type DeskStageView } from './DeskStageContext';
import { SegmentedGlyphSwitch, type SegmentedGlyphOption } from './SegmentedGlyphSwitch';

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

/**
 * Each option teaches what it does plus its chord, through the ONE hotkey hint
 * every control wears ({@link HotkeyTooltip} → keycaps). In place and Split
 * share ⌘/Ctrl+Shift+S — the chord flips between them.
 */
const VIEWS: readonly SegmentedGlyphOption<DeskStageView>[] = [
  { value: 'in-place', label: 'In place', hotkey: { action: 'Open records over the list, full width', chord: DESK_SPLIT_SHORTCUT_HINT }, Glyph: InPlaceGlyph, testId: 'desk-record-view-in-place' },
  { value: 'split', label: 'Split', hotkey: { action: 'Keep the list, open records beside it', chord: DESK_SPLIT_SHORTCUT_HINT }, Glyph: SplitGlyph, testId: 'desk-record-view-split' },
];

export function DeskRecordViewSwitch({ className }: { className?: string }) {
  const stage = useDeskStageOptional();
  // A split pane below this measure cannot preserve both a useful list and a
  // readable record. Collapse to the full-width record as the viewport crosses
  // the phone/tablet boundary; the remembered desktop control remains explicit.
  useEffect(() => {
    if (!stage) return;
    const media = window.matchMedia('(max-width: 899px)');
    const fit = () => {
      if (media.matches && stage.view === 'split') stage.setView('in-place');
    };
    fit();
    media.addEventListener('change', fit);
    return () => media.removeEventListener('change', fit);
  }, [stage]);
  if (!stage) return null;

  return (
    <SegmentedGlyphSwitch
      options={VIEWS}
      value={stage.view}
      onChange={stage.setView}
      ariaLabel="Record view"
      testId="desk-record-view-switch"
      className={cn('hidden min-[900px]:inline-flex', className)}
    />
  );
}
