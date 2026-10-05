/**
 * Inventory › QC labels — the per-unit QC / pre-box label (template `product`,
 * `unit_uid` + serial) as a record, one per labelled serial unit. Server-safe:
 * the nav registry, the route spec and the page all read these.
 */

import { PREPACK_PATHS } from '@/lib/nav/route-tree';

/** The QC labels ledger also hosts the desk prepack task, so the route tree owns its path. */
export const QC_LABELS_PATH = PREPACK_PATHS.desktop;

/** `?view=` — absent = every labelled unit. */
export type QcLabelView = 'all' | 'stock' | 'order';

const WIRE_VIEWS: readonly QcLabelView[] = ['stock', 'order'];

export function parseQcLabelView(raw: string | null | undefined): QcLabelView {
  return raw === 'stock' || raw === 'order' ? raw : 'all';
}

/** Route-param hygiene: the default rides the bare URL. */
export function parseQcLabelViewWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (WIRE_VIEWS as readonly string[]).includes(v) ? v : null;
}
