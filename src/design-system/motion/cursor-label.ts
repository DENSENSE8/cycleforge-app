/**
 * Cursor label channel — a hovered trigger publishes its tooltip text here and
 * {@link MorphCursorLayer} paints it as a black chip riding just below the
 * pointer, so the label moves with the hand instead of sitting on an anchor.
 *
 * Sibling of `cursor-scrub.ts`: same module-store shape, same reason (the
 * layer is one fixed element that already listens to `pointermove`; 336
 * anchored portals each measuring a rect is what this replaces on the desk).
 *
 * THE BUBBLE STAYS. The layer is gated on `(pointer: fine)` and reduced
 * motion, and its chip is `aria-hidden`. So a trigger may only ride the cursor
 * when {@link isCursorLabelHostLive} — a mounted, enabled layer has said so —
 * AND the label is a short single line ({@link canRideCursor}). Focus, touch,
 * reduced motion, and long / rich labels keep the anchored `HoverTooltip`
 * bubble, which is still the `role="tooltip"` path. Decision 2026-09-03: a
 * hover label is the one value the cursor is allowed to be the only copy of —
 * it never existed in the DOM before hover either.
 */

/** Longest label that reads while moving. Past this the bubble takes over. */
export const CURSOR_LABEL_MAX_CHARS = 48;

export type CursorLabel = {
  /** Owner token — a leave only clears the label it published (nested triggers). */
  owner: string;
  text: string;
} | null;

let current: CursorLabel = null;
let hostLive = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** `true` when a short plain-string label may ride the cursor. */
export function canRideCursor(label: unknown): label is string {
  return (
    typeof label === 'string' &&
    label.length > 0 &&
    label.length <= CURSOR_LABEL_MAX_CHARS &&
    !label.includes('\n')
  );
}

/** The layer flips this while it is mounted AND enabled (fine pointer, motion on). */
export function setCursorLabelHost(live: boolean): void {
  hostLive = live;
  if (!live && current) {
    current = null;
    emit();
  }
}

export function isCursorLabelHostLive(): boolean {
  return hostLive;
}

/** Put a label on the cursor. No-op when nothing is there to paint it. */
export function publishCursorLabel(owner: string, text: string): void {
  if (!hostLive) return;
  current = { owner, text };
  emit();
}

/** Take a label off — only if this owner still holds it. */
export function clearCursorLabel(owner: string): void {
  if (!current || current.owner !== owner) return;
  current = null;
  emit();
}

export function subscribeCursorLabel(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readCursorLabel(): CursorLabel {
  return current;
}

/** Server snapshot for `useSyncExternalStore` — the layer never paints on the server. */
export function readCursorLabelServer(): CursorLabel {
  return null;
}
