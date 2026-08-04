/**
 * Returns testing bin — barcode constant (client + server safe).
 * Lookup-by-id lives in `returns-test-bin.ts` (server-only).
 * Org policy: Settings Registry `receiving.returnsTestBin` (server accessors).
 */

export const DEFAULT_RETURNS_TEST_BIN_BARCODE = 'RETURNS-TEST';

/**
 * Sync symbol for offline / preview paths.
 * Prefer {@link getReceivingReturnsTestBin} on the server when org settings
 * are in hand; pass that result as `override` here for a single chokepoint.
 */
export function returnsTestBinSymbol(override?: string | null): string {
  const fromOverride = (override ?? '').trim();
  if (fromOverride) return fromOverride;
  return (process.env.RETURNS_TEST_BIN_BARCODE || DEFAULT_RETURNS_TEST_BIN_BARCODE).trim();
}
