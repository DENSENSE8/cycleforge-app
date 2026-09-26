/** Per-SKU repair reasons — the domain layer both principals reach. */

import type { OrgId } from '@/lib/tenancy/constants';
import { REPAIR_FAILURE_LABELS } from './repair-failure-reasons';

/** A reason row as the surfaces consume it. */
export interface SkuReasonRow {
  label: string;
  favoriteSkuId: number | null;
}

export interface SkuReasonDeps {
  /** SKU string → `favorite_skus.id`, or null when the org has no such row. */
  findFavoriteSkuId: (sku: string, orgId: OrgId) => Promise<number | null>;
  /** SKU string → `favorite_skus.id`, creating the identity anchor if needed. */
  ensureFavoriteSkuId: (
    input: { sku: string; label?: string | null },
    orgId: OrgId,
  ) => Promise<number>;
  /** Global rows, plus this favorite's rows when an id is given. */
  listIssues: (
    favoriteSkuId: number | null,
    orgId: OrgId,
  ) => Promise<ReadonlyArray<{ label: string; favorite_sku_id: number | null }>>;
  createIssue: (
    input: { favoriteSkuId: number | null; label: string; sortOrder: number },
    orgId: OrgId,
  ) => Promise<{ label: string; favorite_sku_id: number | null }>;
}

/** Postgres "relation does not exist" — the table is not migrated here yet. */
export function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return error.code === '42P01';
}

export type AddSkuReasonResult =
  | { ok: true; row: SkuReasonRow }
  | { ok: false; error: 'LABEL_REQUIRED' | 'SKU_REQUIRED' };

/** Max stored reason label — a pill, not a paragraph. */
export const SKU_REASON_LABEL_MAX = 80;

/**
 * `sort_order` for a kiosk-added per-SKU reason. Above the seeded globals
 * (10, 20, …) so added reasons stack at the bottom of the pill list, where the
 * optimistic append already put them.
 */
export const SKU_REASON_SORT_ORDER = 100;

/**
 * The reason list for a SKU: the org's global reasons plus that SKU's own.
 * A blank/unknown SKU yields the globals — never an error, because the catalog
 * has SKU-less entries ("Other") and an empty list there is the truth.
 */
export async function listSkuReasons(
  orgId: OrgId,
  sku: string | null | undefined,
  deps: SkuReasonDeps,
): Promise<{ favoriteSkuId: number | null; rows: SkuReasonRow[] }> {
  const trimmed = String(sku || '').trim();
  const favoriteSkuId = trimmed ? await deps.findFavoriteSkuId(trimmed, orgId) : null;
  const rows = await deps.listIssues(favoriteSkuId, orgId);
  return {
    favoriteSkuId,
    rows: rows.map((r) => ({ label: r.label, favoriteSkuId: r.favorite_sku_id })),
  };
}

/** Add a reason for ONE SKU. */
export async function addSkuReason(
  orgId: OrgId,
  input: { sku: string | null | undefined; label: string; productLabel?: string | null },
  deps: SkuReasonDeps,
): Promise<AddSkuReasonResult> {
  const label = String(input.label || '').trim().slice(0, SKU_REASON_LABEL_MAX);
  if (!label) return { ok: false, error: 'LABEL_REQUIRED' };

  const sku = String(input.sku || '').trim();
  if (!sku) return { ok: false, error: 'SKU_REQUIRED' };

  const favoriteSkuId = await deps.ensureFavoriteSkuId(
    { sku, label: input.productLabel ?? null },
    orgId,
  );

  const existing = await deps.listIssues(favoriteSkuId, orgId);
  const match = existing.find((r) => r.label.trim().toLowerCase() === label.toLowerCase());
  if (match) {
    return { ok: true, row: { label: match.label, favoriteSkuId: match.favorite_sku_id } };
  }

  const created = await deps.createIssue(
    // AFTER the org's globals (which seed at 10, 20, …), so the server order
    // matches where the optimistic paint put it — the pill does not jump on
    // the next load.
    { favoriteSkuId, label, sortOrder: SKU_REASON_SORT_ORDER },
    orgId,
  );
  return {
    ok: true,
    row: { label: created.label, favoriteSkuId: created.favorite_sku_id },
  };
}

/** What the reason pills render from. */
export function visibleReasonBase(dbLabels: readonly string[]): readonly string[] {
  return dbLabels.length > 0 ? dbLabels : REPAIR_FAILURE_LABELS;
}

/**
 * Append a reason to the visible list, case-insensitively deduped. Never
 * removes or reorders what is already showing.
 */
export function mergeReasonLabel(visible: readonly string[], label: string): string[] {
  const trimmed = String(label || '').trim().slice(0, SKU_REASON_LABEL_MAX);
  if (!trimmed) return [...visible];
  const seen = visible.some((v) => v.trim().toLowerCase() === trimmed.toLowerCase());
  return seen ? [...visible] : [...visible, trimmed];
}
