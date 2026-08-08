/**
 * List-key scope — "the focused list owns its navigation keys."
 *
 * The same ownership model as `@/lib/overlay-stack` (innermost open overlay owns
 * Escape), generalized from Escape to **list-navigation keys** (Arrow / Home /
 * End / j / k). It answers ONE question for the ambient, window-level record /
 * carton keyboards: is focus currently inside a widget that navigates its OWN
 * rows with these keys?
 *
 * WHY A MARKER, NOT A REGISTRY
 * Arrow keys are inherently focus-local — a list only wants them while focus is
 * inside it — so a DOM marker read at the moment of the keystroke is both
 * sufficient and self-cleaning (no push/pop, no stale scope on unmount). A
 * heavier `useKeyboardScope` stack is only warranted if a region ever needs to
 * own keys WITHOUT holding focus; nothing does today.
 *
 * WHY THE AMBIENT LISTENER CHECKS THIS (and not `stopPropagation` in the widget)
 * `useRecordCursorKeyboard` binds on `window` in the CAPTURE phase, so it runs
 * BEFORE the focused element's own handler — a `stopPropagation()` inside the
 * list row can never reach it. The only place to yield is inside the ambient
 * listener itself, which is why it consults this predicate the same way it
 * already consults `hasOpenOverlay()` and `isTypingTarget()`.
 *
 * A widget opts in by stamping {@link LIST_KEY_OWNER_ATTR} on its focus root
 * (e.g. `data-list-key-owner=""`). See `StationDisplayIndexList`.
 */

/** Stamp this on a widget's focus root to claim list-nav keys while focused within. */
export const LIST_KEY_OWNER_ATTR = 'data-list-key-owner';

/**
 * Stamp this on an OPEN right-edge push region (a Station Displays column) that
 * owns list-nav keys. Its mere presence in the DOM tells the ambient collection
 * map / record cursor to stand down for ↑/↓/j/k — even when focus is NOT inside
 * it (the operator clicked `←|` to open the column, so focus is on that toggle
 * out in the pane, not on a row). Focus-within alone can't cover that case, and
 * it is exactly the "double sidebar" leak: an arrow steps the receiving table
 * behind the open column and pops a second inspector.
 *
 * This is deliberately scoped to an OPEN push region, not to any mounted list:
 * the underlying map should yield only while a full reference column is up.
 */
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
