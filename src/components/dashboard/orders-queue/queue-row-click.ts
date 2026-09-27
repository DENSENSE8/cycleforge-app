/** What a row-body click on the orders queue MEANS (Shopify index semantics). */

/** A row-body click as the queue reads it — modifiers pick the gesture. */
export interface QueueRowClickEvent {
  shiftKey: boolean;
  /** ⌘ / Ctrl: open the order in a new tab (the browser's own link gesture). */
  metaKey?: boolean;
  ctrlKey?: boolean;
  detail?: number;
  target?: EventTarget | null;
}

export type QueueRowClickIntent = 'new-tab' | 'toggle' | 'ignore' | 'open';

/**
 * ⌘/Ctrl wins (a new tab never disturbs this one); then a live check-set makes
 * the row body the check gesture — a double-click's second press is dropped
 * so it cannot undo the first; with nothing checked the click opens the record.
 */
export function queueRowClickIntent(
  event: Pick<QueueRowClickEvent, 'metaKey' | 'ctrlKey' | 'detail'> | undefined,
  hasCheckSet: boolean,
): QueueRowClickIntent {
  if (event?.metaKey || event?.ctrlKey) return 'new-tab';
  if (hasCheckSet) return (event?.detail ?? 1) > 1 ? 'ignore' : 'toggle';
  return 'open';
}
