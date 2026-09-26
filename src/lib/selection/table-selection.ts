/** Generic table-selection event bus. */

/** Selection payload broadcast by a table: the full list of selected rows. */
export function selectionEventName(scope: string): string {
  return `selection:${scope}`;
}

/** Header/page → table: 'all' selects every row, 'none' clears the selection. */
function selectionToggleAllEventName(scope: string): string {
  return `selection-toggle-all:${scope}`;
}

/** Table → page: publish the count of currently-selectable (visible) rows, so
 *  the action bar can render a select-all ring / "N of M" affordance. */
function selectionTotalEventName(scope: string): string {
  return `selection-total:${scope}`;
}

type SelectionToggleAll = 'all' | 'none';

/** Table → page: publish the current selection for `scope`. */
export function emitSelection<T>(scope: string, rows: T[]): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<T[]>(selectionEventName(scope), { detail: rows }),
  );
}

/** Page/header → table: request select-all or clear for `scope`. */
export function emitToggleAll(scope: string, mode: SelectionToggleAll): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SelectionToggleAll>(selectionToggleAllEventName(scope), {
      detail: mode,
    }),
  );
}

/** Table → page: publish the number of currently-selectable rows for `scope`. */
export function emitSelectionTotal(scope: string, total: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<number>(selectionTotalEventName(scope), { detail: total }),
  );
}

/**
 * Subscribe to selectable-total updates for `scope`. Returns an unsubscribe
 * function suitable for a useEffect cleanup.
 */
export function onSelectionTotal(
  scope: string,
  handler: (total: number) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    handler((e as CustomEvent<number>).detail);
  };
  const name = selectionTotalEventName(scope);
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}

/**
 * Subscribe a table to toggle-all requests for `scope`. Returns an unsubscribe
 * function suitable for a useEffect cleanup.
 */
export function onToggleAll(
  scope: string,
  handler: (mode: SelectionToggleAll) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    handler((e as CustomEvent<SelectionToggleAll>).detail);
  };
  const name = selectionToggleAllEventName(scope);
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}
