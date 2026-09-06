/**
 * Cursor skin channel — WHICH design family the desk cursor paints.
 *
 * The layer (`MorphCursorLayer`) is the one engine: hit-testing, snapping,
 * labels, scrub readouts, morph box measure. A skin only decides what the
 * pointer MARK looks like — every skin renders every state (idle · click ·
 * press · resize · grab · morph) from the same `{ kind, pressed, color }`
 * inputs, so switching skins never changes what the cursor MEANS, only how it
 * reads. Registry: `./cursor-skins.tsx`.
 *
 * Device-local like page wash (see `lib/settings/appearance.ts`): a pointer
 * skin belongs to the desk it was picked on, not to the staffer's account.
 * Sibling store shape of `cursor-scrub.ts` / `cursor-label.ts`.
 */

/** The skin catalog ids, in picker order. `chrome` is the house default. */
export const CURSOR_SKIN_IDS = ['chrome', 'orbit', 'comet', 'reticle', 'gem'] as const;

export type CursorSkinId = (typeof CURSOR_SKIN_IDS)[number];

export const DEFAULT_CURSOR_SKIN: CursorSkinId = 'chrome';

const KEY = 'cf.cursor-skin';

export function isCursorSkinId(value: unknown): value is CursorSkinId {
  return typeof value === 'string' && (CURSOR_SKIN_IDS as readonly string[]).includes(value);
}

let current: CursorSkinId = DEFAULT_CURSOR_SKIN;
let hydrated = false;
const listeners = new Set<() => void>();

/**
 * Fold localStorage in on the FIRST client read, not at module scope: a
 * top-level read runs during SSR too, and the layer/picker must be able to
 * import this module on the server without touching `window`.
 */
function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (isCursorSkinId(raw)) current = raw;
  } catch {
    /* private mode / storage disabled — the default skin still works */
  }
}

/** Pick the skin the desk paints. Persists to this device and notifies. */
export function setCursorSkin(next: CursorSkinId): void {
  if (!isCursorSkinId(next)) return;
  current = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  }
  for (const listener of listeners) listener();
}

export function subscribeCursorSkin(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readCursorSkin(): CursorSkinId {
  hydrate();
  return current;
}

/**
 * Server snapshot for `useSyncExternalStore` — the default skin. The layer
 * renders nothing until a fine pointer is measured, so this never paints; it
 * only keeps the hydration pass deterministic.
 */
export function readCursorSkinServer(): CursorSkinId {
  return DEFAULT_CURSOR_SKIN;
}
