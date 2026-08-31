/**
 * The keyboard and right-click path to a compound row's ⋮ menu.
 *
 * `CompoundActions` is deliberately `tabIndex={-1}` — a focusable control on
 * every row would double the tab stops in a 500-row grid, which is the right
 * call for tab economy and the wrong one on its own: it left the row's verbs
 * with no keyboard path at all. Its docblock claimed the menu was "reachable
 * from the row's own context menu"; no row in the product had a context-menu
 * handler, so the claim documented an intention rather than a behaviour.
 *
 * This is that behaviour. A row shell wires {@link rowActionsKeyDown} and
 * {@link rowActionsContextMenu} into its own handlers, and the same trigger
 * opens from the keyboard (Shift+F10 or the Menu key — the platform chord for
 * "show me this thing's verbs"), from a right-click, and from the pointer.
 *
 * ## Why a DOM reach rather than threaded state
 *
 * The trigger is rendered by a cell several layers below the row shell, behind
 * a family-owned cell map. Threading controlled `open` state up through that
 * waist would make every family's row model carry menu state it does not own,
 * for a control that already has a stable, queryable handle (`data-row-actions`,
 * which the kiosk view test already pins). The row asks its own subtree for the
 * trigger and clicks it; Radix does the rest, including focusing the first item
 * and restoring focus on close.
 *
 * Rows whose family passes no verbs render no trigger, and every function here
 * reports that by doing nothing — so a right-click on a verb-less row still
 * gets the browser's own menu instead of being swallowed by a handler that had
 * nothing to offer.
 */

import type { KeyboardEvent, MouseEvent } from 'react';

/** The trigger's handle. `CompoundActions` stamps it; nothing else may. */
export const ROW_ACTIONS_TRIGGER_SELECTOR = '[data-row-actions]';

/**
 * Open the ⋮ menu belonging to `rowEl`.
 *
 * Returns whether a trigger was found, so callers can decide between claiming
 * the event and letting the platform default through.
 */
export function openRowActionsMenu(rowEl: EventTarget | null): boolean {
  if (!(rowEl instanceof HTMLElement)) return false;
  const trigger = rowEl.querySelector<HTMLElement>(ROW_ACTIONS_TRIGGER_SELECTOR);
  if (!trigger) return false;
  trigger.click();
  return true;
}

/**
 * Shift+F10 / Menu key on a focused row → its ⋮ menu.
 *
 * Both chords are the platform's own "context menu" gesture, which is why they
 * are the ones bound: an operator who already knows the shortcut from their OS
 * does not have to learn a product-specific one, and it collides with nothing
 * the grid binds (Enter opens, Space selects, j/k step).
 */
export function rowActionsKeyDown(event: KeyboardEvent<HTMLElement>): boolean {
  const isMenuChord = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
  if (!isMenuChord) return false;
  if (!openRowActionsMenu(event.currentTarget)) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

/** Right-click on a row → its ⋮ menu, when the family gave it verbs to show. */
export function rowActionsContextMenu(event: MouseEvent<HTMLElement>): boolean {
  if (!openRowActionsMenu(event.currentTarget)) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}
