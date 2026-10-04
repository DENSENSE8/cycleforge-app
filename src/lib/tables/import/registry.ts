/** Table import — the LIVE-SURFACE allowlist (the fan-out gate). */

/**
 * Families whose desk actually mounts an import staging surface today.
 *
 * `orders-import` is the golden: it is where the chrome, the inline editing and
 * the rail were proven end to end (`tests/e2e/csv-import-staging.spec.ts`).
 */
export const TABLE_IMPORT_LIVE_SURFACES = [
  'orders-import',
  'receiving-returns-import',
  'receiving-po-import',
  'products-catalog-import',
] as const;

export function isTableImportLive(
  surfaceId: string,
): surfaceId is (typeof TABLE_IMPORT_LIVE_SURFACES)[number] {
  return (TABLE_IMPORT_LIVE_SURFACES as readonly string[]).includes(surfaceId);
}
