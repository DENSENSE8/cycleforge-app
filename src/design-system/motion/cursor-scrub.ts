/**
 * Cursor scrub channel — a control publishes its LIVE value here while the
 * pointer is dragging it, and {@link MorphCursorLayer} paints that value on the
 * cursor itself.
 *
 * A module store rather than a DOM attribute, because a scrub outlives the
 * element's box: `setPointerCapture` keeps events flowing to a slider even when
 * the hand overshoots far outside it, so a value the layer read off the
 * *hovered* element would go stale the instant the drag left the track.
 *
 * THE CURSOR IS NEVER THE ONLY COPY. Whatever a control publishes here it must
 * also render in the DOM. A number that exists only on the cursor is invisible
 * to touch, to the keyboard, and to a screen reader — the cursor is the
 * accelerant for a value the page already states, never the statement itself.
 *
 * Law: Pick a ROLE, not a literal (physics live on `motionRole.cursor`).
 */

/** What the cursor paints mid-drag. `null` = nothing is being scrubbed. */
export type CursorScrub = {
  /** Quiet lead-in, e.g. "Width". Rendered muted before the value. */
  label: string;
  /** The exact value, already formatted by the control that owns it. */
  value: string;
} | null;

let current: CursorScrub = null;
const listeners = new Set<() => void>();

/** Publish (or clear, with `null`) the value the cursor is carrying. */
export function publishCursorScrub(next: CursorScrub): void {
  current = next;
  for (const listener of listeners) listener();
}

export function subscribeCursorScrub(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readCursorScrub(): CursorScrub {
  return current;
}

/**
 * Server snapshot for `useSyncExternalStore`. Always `null` — the layer is
 * pointer-gated and renders nothing until the client has measured a pointer.
 */
export function readCursorScrubServer(): CursorScrub {
  return null;
}

/**
 * Chrome-style cursor KIND — a small glyph that stays on the pointer.
 * Not a box-wear. Spread from primitives; do not hand-write `data-cursor`.
 *
 * `click` — button / tab / chip (Chrome `pointer`)
 * `resize-x` / `resize-y` — pane sash / column (Chrome `col-resize` / `row-resize`)
 * `grab` / `grabbing` — reorder / redrag (Chrome `grab` / `grabbing`)
 * `morph` — rare: cursor *wears the control's box* (scrub track, travelling pill)
 */
export type CursorKind = 'click' | 'resize-x' | 'resize-y' | 'grab' | 'grabbing' | 'morph';

type CursorAttrs<K extends CursorKind> = {
  'data-cursor': K;
  'data-cursor-label'?: string;
};

export function cursorClickTarget(label?: string): CursorAttrs<'click'> {
  return label ? { 'data-cursor': 'click', 'data-cursor-label': label } : { 'data-cursor': 'click' };
}

export function cursorResizeTarget(axis: 'x' | 'y'): CursorAttrs<'resize-x'> | CursorAttrs<'resize-y'> {
  return axis === 'y' ? { 'data-cursor': 'resize-y' } : { 'data-cursor': 'resize-x' };
}

export function cursorGrabTarget(grabbing = false): CursorAttrs<'grab'> | CursorAttrs<'grabbing'> {
  return grabbing ? { 'data-cursor': 'grabbing' } : { 'data-cursor': 'grab' };
}

/**
 * Opt an element into box-wear morph: the cursor abandons its glyph and springs
 * to this element's box. Prefer {@link cursorClickTarget} for buttons.
 */
export function cursorMorphTarget(label?: string): CursorAttrs<'morph'> {
  return label ? { 'data-cursor': 'morph', 'data-cursor-label': label } : { 'data-cursor': 'morph' };
}

/** Any cursor kind. {@link MorphCursorLayer} hit-tests this. */
export const CURSOR_KIND_SELECTOR = '[data-cursor]';

/** Box-wear only. Kept for tests and the rare morph adopter. */
export const CURSOR_MORPH_SELECTOR = '[data-cursor="morph"]';
