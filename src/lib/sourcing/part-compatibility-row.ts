/**
 * One model ↔ part COMPATIBILITY EDGE, as `/admin?section=compatibility` reads
 * it.
 *
 * Snake_case on purpose: `GET /api/part-compatibility` returns the joined SQL
 * row verbatim (`listCompatibility` selects `pc.*, bm.model_number,
 * bm.model_name, sc.sku, sc.product_title`), so a camelCase mirror here would
 * be a mapping layer that exists only to be kept in sync. The catalog's
 * `paths` name these keys.
 *
 * ## Fetched and NOT painted — documented non-goals
 *
 * `pc.*` also carries `confidence`, `notes` and `updated_at`. The desk has
 * never shown any of them and the slot port is not the place to invent a
 * column: `confidence` in particular is a sourcing judgement whose vocabulary
 * (`confirmed` / `likely` / `unverified`) nobody has ruled on for this
 * surface. They stay off this type; a later session that wants them adds a
 * catalog field, not a cell.
 *
 * `created_at` IS declared, and it is the one addition. The whole-skeleton law
 * mounts the compound DATES chrome on every family
 * (`COMPOUND_SKELETON_FILTER_DEBT` is shrink-only), and this row's only
 * temporal fact is when the edge was linked. Binding it is what keeps that
 * mandatory track from painting a column of `--` under a dead header, which
 * the header-sort law forbids.
 */

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

/**
 * `fit` enum → the operator's word.
 *
 * The retired cell printed the raw enum with an `OEM ` prefix glued onto the
 * front of it, which made one pill two facts. The prefix is gone — OEM is its
 * own track — and the enum now reads as English.
 *
 * An enum nobody mapped paints itself rather than dashing the pill: a new
 * `fit` value added to the Zod enum shows up as a word on the desk instead of
 * silently disappearing.
 */
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

/**
 * The OEM fact, as a word.
 *
 * A boolean has two honest faces and neither is blank: the negative case is
 * "this is an aftermarket part", which is a claim the desk makes, not missing
 * data. Only a row with no boolean at all resolves to nothing.
 */
export function partOemLabel(isOem: boolean | null | undefined): string | null {
  if (isOem == null) return null;
  return isOem ? 'OEM' : 'Aftermarket';
}
