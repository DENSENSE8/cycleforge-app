/** List-key scope — "the focused list owns its navigation keys." */

/** Stamp this on a widget's focus root to claim list-nav keys while focused within. */
export const LIST_KEY_OWNER_ATTR = 'data-list-key-owner';

/** Stamp this on an OPEN right-edge push region (a Station Displays column) that owns list-nav keys. */
export const LIST_KEY_REGION_OPEN_ATTR = 'data-list-key-region-open';

const OWNER_SELECTOR = `[${LIST_KEY_OWNER_ATTR}]`;
const REGION_OPEN_SELECTOR = `[${LIST_KEY_REGION_OPEN_ATTR}]`;

function closestOwner(node: EventTarget | null): boolean {
  return node instanceof Element && node.closest(OWNER_SELECTOR) != null;
}

/**
 * True when the keystroke's target — or, failing that, the active element —
 * sits inside a list-key owner. Ambient global keyboards should bail on this
 * before stepping a record / carton cursor.
 */
export function focusWithinListKeyOwner(target?: EventTarget | null): boolean {
  if (closestOwner(target ?? null)) return true;
  if (typeof document === 'undefined') return false;
  return closestOwner(document.activeElement);
}

/**
 * True while an open list-key push region is mounted anywhere in the document.
 * Ambient collection-map / record keyboards bail on this regardless of focus, so
 * ↑/↓ never leak past an open Station Displays column into the table behind it.
 */
export function isListKeyRegionOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return document.querySelector(REGION_OPEN_SELECTOR) != null;
}
