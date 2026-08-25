/**
 * The `/` action registry — the SAME destinations the launcher opens
 * (`src/shell/Launcher.tsx`), so the composer and ⌘K stay two mouths of one
 * index (T11/R2) and can never drift on where "packing" goes. The composer
 * does not steal ⌘K; it adds `/` as the keyboard-local spelling.
 *
 * Data only: the shell maps `run` onto `openTile` / `toggleTool`.
 */

import type { TileType, ToolKey } from '@/shell/model';

export type ComposerActionRun =
  | { readonly kind: 'tile'; readonly ref: string; readonly title: string; readonly type: TileType }
  | { readonly kind: 'tool'; readonly tool: ToolKey };

export interface ComposerAction {
  readonly key: string;
  readonly title: string;
  readonly meta: string;
  readonly run: ComposerActionRun;
}

const tile = (ref: string, title: string, type: TileType): ComposerActionRun => ({
  kind: 'tile',
  ref,
  title,
  type,
});
const tool = (key: ToolKey): ComposerActionRun => ({ kind: 'tool', tool: key });

export const COMPOSER_ACTIONS: readonly ComposerAction[] = [
  /* sessions */
  { key: 'unbox', title: 'Unbox session', meta: 'Start receiving cartons', run: tile('unbox', 'Unbox', 'session') },
  { key: 'packing', title: 'Packing session', meta: 'Pack graded units', run: tile('packing', 'Packing', 'session') },
  { key: 'qc', title: 'QC session', meta: 'Quality control', run: tile('qc', 'QC', 'session') },
  { key: 'fba-build', title: 'FBA shipment build', meta: 'Task session · the unit of work is the BATCH', run: tile('fba-build', 'FBA shipment', 'session') },
  /* tables */
  { key: 'triage', title: 'Triage queue', meta: 'Receiving triage', run: tile('triage', 'Triage', 'table') },
  { key: 'receiving', title: 'Receiving feed', meta: 'Recent cartons', run: tile('receiving', 'Receiving', 'table') },
  { key: 'pickup', title: 'Pickup queue', meta: 'Local pickups', run: tile('pickup', 'Pickup', 'table') },
  { key: 'labels', title: 'Label prints', meta: 'Product labels', run: tile('labels', 'Labels', 'table') },
  { key: 'settings', title: 'Settings', meta: 'Arrangement · comfort · meaning', run: tile('settings', 'Settings', 'table') },
  { key: 'units', title: 'Units', meta: 'All inventory units', run: tile('units', 'Units', 'table') },
  { key: 'orders', title: 'Orders', meta: 'Open orders', run: tile('orders', 'Orders', 'table') },
  { key: 'returns', title: 'Returns', meta: 'Return merchandise', run: tile('returns', 'Returns', 'table') },
  /* tools */
  { key: 'pairing', title: 'Pairing', meta: 'TRK# to serial', run: tool('pairing') },
  { key: 'timer', title: 'Timer', meta: 'Session elapsed time', run: tool('timer') },
  { key: 'stopwatch', title: 'Stopwatch', meta: 'Lap timing', run: tool('stopwatch') },
  { key: 'photos', title: 'Photo library', meta: 'Unit photos', run: tool('photos') },
  { key: 'manuals', title: 'Manuals', meta: 'Product documentation', run: tool('manuals') },
  { key: 'printer', title: 'Label printer', meta: 'Print shipping labels', run: tool('printer') },
  { key: 'calc', title: 'Calculator', meta: 'Quick math', run: tool('calc') },
];

export function searchComposerActions(query: string): readonly ComposerAction[] {
  const q = query.trim().toLowerCase();
  if (!q) return COMPOSER_ACTIONS;
  return COMPOSER_ACTIONS.filter(
    (a) => a.key.includes(q) || a.title.toLowerCase().includes(q) || a.meta.toLowerCase().includes(q),
  );
}
