/** `PartCompatibilityEdgeRow → CompoundRowView` — pure, strings and enums, no JSX. */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import {
  partFitLabel,
  type PartCompatibilityEdgeRow,
} from '@/lib/sourcing/part-compatibility-row';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/**
 * An edge is a standing CLAIM, not work in flight — nothing on this desk needs
 * a human, not even a `salvage` fit, which is a sourcing fact rather than an
 * exception. Tone is never the fact; the pill's word is.
 */
const EDGE_TONE: CompoundStateTone = 'neutral';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/** Compact civil face for the Dates Hash line — no year (slot-table date law). */
function civilFace(iso: string | null | undefined): { label: string; dateKey: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { label: format(d, 'MMM d'), dateKey: format(d, 'yyyy-MM-dd') };
}

export function partCompatibilityCompoundView(row: PartCompatibilityEdgeRow): CompoundRowView {
  const sku = str(row.sku);
  const part = str(row.product_title);
  const model = str(row.model_name) ?? str(row.model_number);
  const linked = civilFace(row.created_at);

  return {
    id: String(row.id),
    thumbUrl: null,
    // A part with no title is named by the handle the operator actually has;
    // only an edge missing both falls back to its own id.
    title: part ?? sku ?? `Edge #${row.id}`,
    // The retired Part cell's `<Link>`, kept as the engine's title href rather
    // than as JSX inside a family cell.
    titleHref: sku ? `/inventory/health/sku/${encodeURIComponent(sku)}` : null,
    // FALLBACK line only — the product layout binds `model` as the subtitle,
    // and a bound subtitle replaces this. Says what the edge is FOR.
    note: model ? `Fits ${model}` : null,
    // The Id track carries THIS family's handle, not an order:
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    identityFace: compoundIdentityFace(sku, 'SKU'),
    orderId: null,
    tracking: null,
    // A catalog edge has no marketplace and no carrier behind it.
    platformValue: null,
    carrier: null,
    // The shared Dates chrome mounts (the skeleton is never cut), so the Hash
    // line carries this row's one stamp — when somebody linked the part.
    // Leaving it null would paint a column of `--` under a live header.
    orderedAt: linked
      ? { label: linked.label, tip: `Linked ${linked.label}`, dateKey: linked.dateKey }
      : null,
    startedHover: linked ? `Linked ${linked.label}` : undefined,
    stateLabel: partFitLabel(row.fit),
    stateTone: EDGE_TONE,
    delay: null,
    amount: null,
  };
}
