/**
 * The ORDER key table (operator 2026-10-08: "keybinds must never clash") —
 * every key the open order record, its action strip and the order check-set
 * bars bind, beside the order lists' own keys, as pure data so
 * `order-key-table.test.ts` holds them against each other and against the
 * app-reserved letters (`key-registry`).
 */

import { ASSIGN_TASK_HOTKEY, COPY_HOTKEY, DELETE_HOTKEY, type Hotkey } from '@/lib/keyboard/key-registry';

/**
 * Each order strip verb's key, by slot. A slot holds verbs no strip offers
 * together: `resolve` is Resolve (Exceptions) or Create rule (the views without
 * Resolve); `documents` is Label, Documents or the record's Paperwork;
 * `label-buy` is Buy label before any tracking, Buy replacement label after.
 */
export const ORDER_VERB_HOTKEYS = {
  paste: 'v',
  resolve: 'r',
  'out-of-stock': 'o',
  /** "Drop it here" — the letters near L / P are taken. */
  'pair-sku-location': 'd',
  urgent: 'u',
  documents: 'l',
  /** S, not X: X checks the record under the cursor on every list (Law 5). */
  'scan-out': 's',
  notes: 'n',
  /** ⌘/Ctrl+C, never bare C: C is create app-wide. */
  copy: COPY_HOTKEY,
  print: 'p',
  /** P is Print (product labels). */
  'print-slip': 'm',
  /** "Home" — back to the warehouse. */
  'return-label': 'h',
  /** "lab-E-l"; R is Resolve / Create rule. */
  'label-buy': 'e',
  /** T for ticket, as `C` then `T` opens a new ticket app-wide. */
  'customer-ticket': 't',
  task: ASSIGN_TASK_HOTKEY,
  'more-info': 'i',
  'buyer-cancelled': 'z',
  delete: DELETE_HOTKEY,
} as const satisfies Record<string, Hotkey>;

export type OrderRecordKeyHandler = 'onReplaceTracking' | 'onFocusNote' | 'onPrintSlip';

/**
 * The open record's own letters (`useOrderRecordKeys`). `slot` names the strip
 * verb a key stands in for: the record's N and M are the strip's Notes and
 * Print packing slip, the same action under the same letter.
 */
export const ORDER_RECORD_KEYS: readonly {
  key: string;
  handler: OrderRecordKeyHandler;
  label: string;
  slot: keyof typeof ORDER_VERB_HOTKEYS | 'replace-tracking';
}[] = [
  // W for waybill — the carrier's tracking number; T is the customer ticket.
  { key: 'w', handler: 'onReplaceTracking', label: 'Replace tracking', slot: 'replace-tracking' },
  { key: ORDER_VERB_HOTKEYS.notes, handler: 'onFocusNote', label: 'Write a note', slot: 'notes' },
  // E is the label buy's alone (operator 2026-10-08): edit the ship-to from its pencil, or inside the label form.
  { key: ORDER_VERB_HOTKEYS['print-slip'], handler: 'onPrintSlip', label: 'Print packing slip', slot: 'print-slip' },
];

/**
 * To-ship's Labels walk (`useLabelsWalkShortcut`): ⌥/Alt+L — bare L is the
 * open order's Documents / Label on the strip.
 */
export const LABELS_WALK_HOTKEY = 'alt+l';

/**
 * The order lists' own keys while a record or a check-set is live
 * (Allocate's `TriageCardList`, `useRecordCursorKeyboard`, NavFind, the
 * leaders, the view digits, the Labels walk): a strip or record key never
 * takes one of these.
 */
export const ORDER_LIST_KEYS: Readonly<Record<string, string>> = {
  j: 'Next record',
  k: 'Previous record',
  x: 'Check the record',
  f: 'Find on this page',
  c: 'Add (leader)',
  g: 'Go (leader)',
  y: 'Sync (leader)',
  '?': 'Shortcuts',
  '1': 'First view',
  '2': 'Second view',
  [LABELS_WALK_HOTKEY]: 'Labels walk',
};

/**
 * The key each selection-bar catalog verb keeps on an order strip
 * (`SELECTION_STATUS_BAR_META`): its own letter, unless a verb the strip
 * paints (`claimed`), the record's keys, the list's keys or an earlier catalog
 * verb holds it — then it goes keyless.
 */
export function orderCatalogHotkeys(
  catalog: readonly { id: string; hotkey?: Hotkey }[],
  claimed: Iterable<Hotkey>,
): Map<string, Hotkey> {
  const taken = new Set<string>([
    ...[...claimed].map((key) => key.toLowerCase()),
    ...ORDER_RECORD_KEYS.map((entry) => entry.key),
    ...Object.keys(ORDER_LIST_KEYS),
  ]);
  const out = new Map<string, Hotkey>();
  for (const { id, hotkey } of catalog) {
    const key = hotkey?.toLowerCase();
    if (!key || taken.has(key)) continue;
    taken.add(key);
    out.set(id, hotkey as Hotkey);
  }
  return out;
}
