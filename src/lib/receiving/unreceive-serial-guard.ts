/**
 * Pure unreceive serial-status guard — shared by server `unreceiveLineUnits`
 * and client Unbox menu disable. Keep this module free of `@/lib/db` /
 * `server-only` so Client Components can import it.
 */

/** Serial statuses that block website unreceive — the unit has left the dock into fulfillment / outbound / hold. */
export const UNRECEIVE_BLOCKING_SERIAL_STATUSES: ReadonlySet<string> = new Set([
  'ALLOCATED',
  'PICKING',
  'PICKED',
  'PACKING',
  'PACKED',
  'LABELED',
  'STAGED',
  'LOADING',
  'SHIPPED',
  'ON_HOLD',
  'IN_REPAIR',
  'RMA',
]);

/** Pure — used by unreceiveLineUnits + Unbox menu + unit tests. */
export function isUnreceiveSerialBlocking(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toUpperCase();
  return s.length > 0 && UNRECEIVE_BLOCKING_SERIAL_STATUSES.has(s);
}
