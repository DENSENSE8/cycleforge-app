/**
 * `CompatibilityEdgeRow → CompoundRowView` — pure, strings and enums, no JSX.
 *
 * TITLE is the PART (what an operator is sourcing), the note is the model it
 * fits, IDS is the SKU, and STATE is the part role.
 */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { CompatibilityEdgeRow } from '@/lib/sourcing/compatibility-edge-row';

function str(v: string | number | null | undefined): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

/** A low-confidence rule is the one worth reviewing. */
function toneFor(confidence: string): CompoundStateTone {
  const c = (confidence ?? '').toLowerCase();
  if (c.includes('low') || c.includes('guess') || c.includes('unverified')) return 'alert';
  if (c.includes('high') || c.includes('confirm') || c.includes('verified')) return 'done';
  return 'neutral';
}

export function compatibilityCompoundView(row: CompatibilityEdgeRow): CompoundRowView {
  const num = str(row.model_number);
  const name = str(row.model_name);
  return {
    id: String(row.id),
    thumbUrl: null,
    title: str(row.product_title) ?? str(row.sku) ?? `Rule #${row.id}`,
    note: num && name ? `fits ${num} · ${name}` : num ? `fits ${num}` : name,
    orderId: str(row.sku),
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: str(row.part_role) ?? 'part',
    stateTone: toneFor(row.confidence),
    stateTip: str(row.source) ?? undefined,
    delay: null,
    amount: null,
  };
}
