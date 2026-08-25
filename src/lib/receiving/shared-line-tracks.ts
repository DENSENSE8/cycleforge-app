/**
 * Shared column grammar for the `ReceivingLineRow` family — the single source
 * for the LABEL · TYPE · ALIGN of every track that the **expected** (Incoming
 * `/incoming`) and **landed** (Unbox History / receiving browse) views draw the
 * same way.
 *
 * Why this exists (Inbound ↔ History one-family, plan P0 — 2026-08-10):
 * Incoming and History are two *temporal phases* of one entity (expected /
 * in-flight PO line vs. landed carton activity), not two domains. They already
 * share the row type (`ReceivingLineRow`) and the mount waist
 * (`NonlinearTableHost`); what drifted was the column model — most visibly the
 * header grammar (Incoming shipped `headerGlyphOnly` on every data column while
 * History drew sentence-case words, so an operator relearned the sheet moving
 * Inbound ↔ History). This map makes the SHARED keys resolve their header
 * grammar from ONE place, consumed by both layouts.
 *
 * ## Shared vs. view-specific
 *
 * A key is here ONLY when both views mean the same thing by its header:
 *   order · title · qty · condition · status(tag) · tracking · zoho.
 * Keys whose LABEL or meaning differs by phase stay view-specific in each
 * layout and are NOT in this map — that is the "honest job difference" the
 * ruling preserves, not a fork:
 *   - `date` — `Expected` (expected view) vs `Date` (landed view)
 *   - `age` — expected-only (delivery duration)
 *   - `platform` — expected-only channel mark
 *   - `price` · `location` · `serial` · custom fields — landed-only
 *
 * This is the SHARED GRAMMAR, not the shared *geometry*: width, freeze,
 * `labelFitRem`, `gridLabel`, `hideKey` and `tier` remain per-view presets on
 * each layout (an expected desk and a landed sheet legitimately size and pin
 * tracks differently). The `status` cell VOCABULARY (delivery state vs.
 * lifecycle stage) is likewise a per-view cell concern — only its header
 * grammar (`Status`, `tag`, start-aligned) is shared here.
 *
 * Full ruling + the deferred family merge (one `entityFamily` / one cell
 * registry / host cutover / `incoming-grid/**` deletion):
 * `docs/todo/inbound-history-one-table-family-GEMINI-RESEARCH-BRIEFING.md`.
 */

import type { LedgerGridColumnModel } from '@/lib/grid/grid-surface-descriptor';

/** Column keys whose header grammar is identical across expected + landed views. */
export type SharedLineTrackKey =
  | 'order'
  | 'title'
  | 'qty'
  | 'condition'
  | 'status'
  | 'tracking'
  | 'zoho';

/** The three header-grammar fields a shared track resolves from one place. */
interface SharedLineTrackMeta {
  label: string;
  type: LedgerGridColumnModel['type'];
  align: LedgerGridColumnModel['align'];
}

/**
 * Canonical header grammar per shared key. Values are BYTE-IDENTICAL to what
 * both layouts declared inline before this module — spreading it changes no
 * rendered field, it removes the duplication that let the two drift.
 */
export const SHARED_LINE_TRACK_META = {
  order: { label: 'Order', type: 'id', align: 'start' },
  title: { label: 'Product Title', type: 'text', align: 'start' },
  qty: { label: 'Qty', type: 'number', align: 'end' },
  condition: { label: 'Cond', type: 'tag', align: 'start' },
  status: { label: 'Status', type: 'tag', align: 'start' },
  tracking: { label: 'Tracking', type: 'tracking', align: 'start' },
  zoho: { label: 'Vendor', type: 'tag', align: 'start' },
} as const satisfies Record<SharedLineTrackKey, SharedLineTrackMeta>;
