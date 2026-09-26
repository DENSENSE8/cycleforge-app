/** Cursor label channel — a hovered trigger publishes its tooltip text here and {@link MorphCursorLayer} paints it as a black chip riding… */

/** Longest label that rides. */
export const CURSOR_LABEL_MAX_CHARS = 72;

type CursorLabel = {
  /** Owner token — a leave only clears the label it published (nested triggers). */
  owner: string;
  text: string;
  /**
   * Optional chord taught alongside the text, authored as one display string
   * (`'Shift + Tab'`). The chip paints it as keycaps; it is never folded into
   * `text`, so the label stays a plain sentence and the keys stay a key face.
   */
  keys?: string;
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
export function publishCursorLabel(owner: string, text: string, keys?: string): void {
  if (!hostLive) return;
  current = keys ? { owner, text, keys } : { owner, text };
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
