/**
 * QC › pair an FNSKU to an inventory SKU at a house grade — the pure
 * resolution behind the /test dock's FNSKU button and the Pass press.
 *
 * One inventory SKU carries many FNSKUs, one per house condition grade
 * (owner 2026-10-08): `fba_fnskus.sku_catalog_id` + `paired_condition_grade`.
 * The house grade codes (1–7) are independent of the Amazon condition words
 * an FNSKU prints, so nothing is inferred from `fba_fnskus.condition` — only
 * an explicit pairing auto-prints. See
 * docs/handoff/HANDOFF-qc-fnsku-pair-2026-10-08.md.
 */

import type { FnskuLabelFace } from '@/lib/print/fnskuLabel';

/** One `fba_fnskus` row as the QC bench reads it. */
export interface QcFnskuCandidate {
  fnsku: string;
  product_title: string | null;
  asin: string | null;
  sku: string | null;
  condition: string | null;
  label_mark: string | null;
  /** The inventory SKU (sku_catalog.id) this FNSKU is paired to, if any. */
  paired_to: number | null;
  /** The house grade the pairing binds it to; null = paired to the SKU only (legacy) or unpaired. */
  paired_grade: string | null;
}

/**
 * What the bench does for a unit of `grade` on inventory SKU `skuCatalogId`:
 * - `paired` — an FNSKU is paired to exactly this (SKU, grade); Pass prints it.
 * - `unpaired` — nothing paired at this grade; the dock reads "Pair FNSKU".
 */
export type QcFnskuResolution =
  | { kind: 'paired'; candidate: QcFnskuCandidate }
  | { kind: 'unpaired' };

export function resolveQcFnsku(
  candidates: readonly QcFnskuCandidate[] | null | undefined,
  skuCatalogId: number | null | undefined,
  grade: string | null | undefined,
): QcFnskuResolution {
  if (skuCatalogId == null || !grade) return { kind: 'unpaired' };
  const hit = (candidates ?? []).find(
    (c) => c.fnsku?.trim() && c.paired_to === skuCatalogId && c.paired_grade === grade,
  );
  return hit ? { kind: 'paired', candidate: hit } : { kind: 'unpaired' };
}

/**
 * Popover order: the FNSKU paired at this grade, then this SKU's other
 * FNSKUs, then search hits, each group in server order. The first row is the
 * one a second `K` pairs.
 */
export function rankQcFnskuCandidates(
  rows: readonly QcFnskuCandidate[],
  skuCatalogId: number | null | undefined,
  grade: string | null | undefined,
): QcFnskuCandidate[] {
  const rank = (c: QcFnskuCandidate) =>
    skuCatalogId != null && c.paired_to === skuCatalogId ? (c.paired_grade === grade ? 0 : 1) : 2;
  return rows
    .filter((c) => c.fnsku?.trim())
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

/** The physical label face for a candidate; the title falls back to the line. */
export function qcFnskuFace(candidate: QcFnskuCandidate, lineTitle: string): FnskuLabelFace {
  return {
    fnsku: candidate.fnsku.trim(),
    title: (candidate.product_title ?? '').trim() || lineTitle,
    condition: candidate.condition ?? '',
    mark: candidate.label_mark,
  };
}
