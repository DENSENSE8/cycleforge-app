/**
 * Table import — the LIVE-SURFACE allowlist (the fan-out gate).
 *
 * Mirrors `CUSTOM_FIELD_LIVE_ENTITY_TYPES`: the mechanism is family-agnostic,
 * but which families actually MOUNT it is a deliberate, one-at-a-time decision.
 *
 * House law is golden-first (`pattern-evolution.md` → Never;
 * `source-of-truth.md` → Table engine fan-out): a new spreadsheet capability
 * lands on the golden surface, is operator-verified, and only then reaches the
 * next `entityFamily`. Turning several queues on in one pass is the named
 * regression class (Orders + Receiving custom fields, 2026-08-09, reverted).
 *
 * **Adding a line here is the fan-out.** It must land in the SAME change as
 * that family's staging binding, its host, and its commit endpoint — an
 * allowlist entry with no mount is a claim the product cannot honour.
 *
 * Note the asymmetry with custom fields, and it is deliberate: import is a
 * capability of the table ENGINE, so building the seam is not a fan-out —
 * mounting it per family is.
 */

/**
 * Families whose desk actually mounts an import staging surface today.
 *
 * `orders-import` is the golden: it is where the chrome, the inline editing and
 * the rail were proven end to end (`tests/e2e/csv-import-staging.spec.ts`).
 */
export const TABLE_IMPORT_LIVE_SURFACES = ['orders-import'] as const;

export function isTableImportLive(
  surfaceId: string,
): surfaceId is (typeof TABLE_IMPORT_LIVE_SURFACES)[number] {
  return (TABLE_IMPORT_LIVE_SURFACES as readonly string[]).includes(surfaceId);
}
