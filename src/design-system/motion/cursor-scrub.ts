/** Cursor scrub channel — a control publishes its LIVE value here while the pointer is dragging it, and {@link MorphCursorLayer} paints… */

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

/** Chrome-style cursor KIND — a small glyph that stays on the pointer. */
export type CursorKind = 'click' | 'resize-x' | 'resize-y' | 'grab' | 'grabbing' | 'morph';

/**
 * Painted edge of a KIND glyph, CSS px. Shared by the layer's paint targets
 * and every skin's fixed accents so glyph states sit at one scale.
 */
export const CURSOR_GLYPH_SIZE = 18;

type CursorAttrs<K extends CursorKind> = {
  'data-cursor': K;
  'data-cursor-label'?: string;
  'data-cursor-keys'?: string;
};

/**
 * `keys` teaches the chord that fires this control — one display string
 * (`'Shift + Tab'`), painted as keycaps inside the same chip as the label.
 * Only meaningful with a label: keys alone is a cap with nothing to explain.
 */
export function cursorClickTarget(label?: string, keys?: string): CursorAttrs<'click'> {
  if (!label) return { 'data-cursor': 'click' };
  return keys
    ? { 'data-cursor': 'click', 'data-cursor-label': label, 'data-cursor-keys': keys }
    : { 'data-cursor': 'click', 'data-cursor-label': label };
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
