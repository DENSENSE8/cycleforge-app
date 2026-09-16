'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

/**
 * TooltipChip — the ONE skin and the ONE content order for a hover hint.
 *
 * Ported from mainline 2026-09-15 for the cursor-follow chip. A hint has more
 * than one host and every one of them paints this skin: the chip that follows
 * the pointer (`CursorLabelLayer`) and the anchored `role="tooltip"` bubble
 * that `HoverTooltip` portals for focus / touch / reduced motion. They differ
 * only in how they are POSITIONED and in their corner role — everything a
 * reader actually sees (ground, type, spacing) is decided here so the hosts
 * cannot drift apart.
 *
 * ## Type
 *
 * `text-role-nav` at weight 500 — 13px on the app sans cut, zero tracking,
 * 1.4 line-height. A hint is READ, often in a hurry, so it gets the most
 * legible cut in the system rather than the smallest. Explicitly NOT
 * `text-role-micro` / `text-role-eyebrow`: those bind the CONDENSED family —
 * narrow counters are the wrong trade for a sentence whose whole job is to be
 * understood on first read.
 *
 * ## Width — one row by default
 *
 * A hint is ONE ROW. The chip grows sideways; the hosts handle the edges —
 * the follower flips to the other side of the pointer, the bubble clamps
 * into the viewport. `canRideCursor` already caps a riding label at
 * `CURSOR_LABEL_MAX_CHARS` and rejects newlines, handing anything longer to
 * the anchored bubble.
 *
 * NOTE (lane): mainline's `TooltipChipBody` also renders a trailing chord as
 * keycaps via `KeyboardChord`. This tree has no chord-capable KeyboardKey
 * (no `tone` face) and no caller passes a chord — the chord lands here when
 * the mainline KeyboardKey merge brings it.
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
    'bg-surface-inverse text-white shadow-lg',
    'px-2 py-1 text-role-nav font-medium leading-snug',
    row && 'flex items-center gap-1.5',
    // `text-pretty` keeps an unavoidable wrap minimal — no orphan last word.
    wrap ? 'whitespace-pre-line text-pretty' : 'whitespace-nowrap',
  );
}

/** The chip's contents: the sentence. Sentence-first is the whole order. */
export function TooltipChipBody({ label }: { label: ReactNode }) {
  return <>{label}</>;
}
