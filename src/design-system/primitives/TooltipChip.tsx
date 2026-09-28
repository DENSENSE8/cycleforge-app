'use client';

import type { ReactNode } from 'react';
import { KeyboardChord } from '@/design-system/primitives/KeyboardKey';
import { cn } from '@/utils/_cn';

/**
 * TooltipChip — the ONE skin and the ONE content order for a hover hint.
 *
 * A hint has THREE hosts and every one of them paints this skin: the chip that
 * rides `MorphCursorLayer` on a desk, the anchored `role="tooltip"` bubble that
 * `HoverTooltip` portals for focus / touch / reduced motion, and the anchored
 * copy bubble in `SiteTooltipProvider`. They differ only in how they are
 * POSITIONED and in their corner role. Everything a reader actually sees —
 * ground, type, spacing, and whether a trailing element sits beside the
 * sentence — is decided here so they cannot drift apart.
 *
 * The copy bubble is deliberately NOT a follower, and that is the rule for its
 * whole class: a hint you only read may ride the pointer, but a hint you have
 * to ENTER and click (copy, open link) must hold still, or the target moves
 * out from under the hand reaching for it.
 *
 * ## Type
 *
 * `text-role-nav` at weight 500 — 13px on the app sans cut (`--ds-font-sans`,
 * Inter-class), zero tracking, 1.4 line-height. A hint is READ, often in a
 * hurry and often by someone who does not yet know what the control does, so
 * it gets the most legible cut in the system rather than the smallest.
 *
 * Explicitly NOT `text-role-micro` / `text-role-eyebrow`: those two bind the
 * CONDENSED family intrinsically (see the plugin in tailwind.config.mjs).
 * Condensed is a dense-chrome cut for labels you already recognise — narrow
 * counters and tight apertures are the wrong trade for a sentence whose whole
 * job is to be understood on first read. `role-nav` is also the one role whose
 * weight is a call-site decision, which is why 500 is set here.
 *
 * Sentence case, always: "Switch mode", never shouted and never Title Case.
 * The keycaps follow (`Shift`, `Tab`) via the cap's own `inverse` tone, which
 * is drawn from the chip's ink (`currentColor`), so it holds in every theme.
 *
 * ## Width — one row by default
 *
 * A hint is ONE ROW unless a host explicitly asks otherwise. Two short lines
 * cost more to read than one wide one, and a chord split off its sentence
 * reads as two facts instead of one. The chip grows sideways; the hosts handle
 * the edges — the desk chip flips to the other side of the pointer, the bubble
 * clamps into the viewport.
 *
 * `wrap` is a HOST decision, never a content one. The desk chip must never
 * pass it: it is an absolutely-positioned box inside a zero-width follower, so
 * any wrapping mode collapses it to one word per line. It does not need one
 * either — `canRideCursor` already caps a riding label at
 * `CURSOR_LABEL_MAX_CHARS` and rejects newlines, handing anything longer to
 * the anchored bubble. Only that bubble may wrap, and only for prose.
 */
export function tooltipChipClass({
  row = false,
  wrap = false,
}: {
  /** A trailing element (keycaps, a copy glyph) sits beside the sentence. */
  row?: boolean;
  wrap?: boolean;
} = {}): string {
  return cn(
    'bg-surface-inverse text-text-inverse shadow-lg',
    'px-2 py-1 text-role-nav font-medium leading-snug',
    row && 'flex items-center gap-1.5',
    // `text-pretty` keeps an unavoidable wrap minimal — no orphan last word.
    wrap ? 'whitespace-pre-line text-pretty' : 'whitespace-nowrap',
  );
}

/**
 * The chip's contents: the sentence, then the chord as keycaps.
 *
 * Sentence first is deliberate — the reader wants to know WHAT before they care
 * HOW, and the chord is the answer to a question the sentence just raised.
 */
export function TooltipChipBody({ label, chord }: { label: ReactNode; chord?: string | null }) {
  if (!chord) return <>{label}</>;
  return (
    <>
      <span>{label}</span>
      <KeyboardChord chord={chord} />
    </>
  );
}
