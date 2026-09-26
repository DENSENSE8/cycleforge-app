/** One model ↔ part COMPATIBILITY EDGE, as `/admin?section=compatibility` reads it. */

export interface PartCompatibilityEdgeRow {
  /** `part_compatibility.id` — the row key and the Remove verb's payload. */
  id: number;
  bose_model_id: number;
  sku_id: number;
  /** Free text on the wire (`partRole` is `z.string().min(1)`), not an enum. */
  part_role: string;
  /** OEM vs aftermarket. Its OWN fact — never merged into the fit pill again. */
  is_oem: boolean;
  /** `exact` | `equivalent` | `salvage`. */
  fit: string;
  /** `confirmed` | `likely` | `unverified` — fetched, never painted (non-goal). */
  confidence: string;
  /** `manual` | `csv_import` | `ebay`. */
  source: string;
  /** When the edge was linked — the DATES chrome's fact. */
  created_at: string;
  /** Joined `bose_models.model_number` — the model's lookup handle. */
  model_number: string;
  /** Joined `bose_models.model_name` — the marketing name. */
  model_name: string;
  /** Joined `sku_catalog.sku` — the PART's handle, and this row's identity. */
  sku: string;
  /** Joined `sku_catalog.product_title` — the part, and this row's title. */
  product_title: string;
}

/** `fit` enum → the operator's word. */
const FIT_LABEL: Readonly<Record<string, string>> = {
  exact: 'Exact fit',
  equivalent: 'Equivalent',
  salvage: 'Salvage',
};

export function partFitLabel(fit: string | null | undefined): string {
  const raw = String(fit ?? '').trim();
  if (!raw) return 'Unrated fit';
  return FIT_LABEL[raw] ?? raw;
}

/** `source` enum → the operator's word. Same self-painting fallback. */
const SOURCE_LABEL: Readonly<Record<string, string>> = {
  manual: 'Manual',
  csv_import: 'CSV import',
  ebay: 'eBay',
};

export function partSourceLabel(source: string | null | undefined): string | null {
  const raw = String(source ?? '').trim();
  if (!raw) return null;
  return SOURCE_LABEL[raw] ?? raw;
}

/** The OEM fact, as a word. */
export function partOemLabel(isOem: boolean | null | undefined): string | null {
  if (isOem == null) return null;
  return isOem ? 'OEM' : 'Aftermarket';
}
