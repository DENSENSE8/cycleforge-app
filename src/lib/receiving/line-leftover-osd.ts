/**
 * Line leftovers that complete a receiving line without remaining = 0.
 *
 * These are existing OS&D codes in `exception-codes.ts` (`SHORT` / `OVER` /
 * `DAMAGED` / `WRONG_ITEM`). Named here as a slice so carton GR and the
 * item-record receive face can share one completeness rule without splicing
 * new codes into `RECEIVING_EXCEPTION_CODES`.
 */

export const LINE_LEFTOVER_OSD_CODES = ['SHORT', 'OVER', 'DAMAGED', 'WRONG_ITEM'] as const;

export type LineLeftoverOsdCode = (typeof LINE_LEFTOVER_OSD_CODES)[number];

export function isLineLeftoverOsdCode(
  value: string | null | undefined,
): value is LineLeftoverOsdCode {
  return value != null && (LINE_LEFTOVER_OSD_CODES as readonly string[]).includes(value);
}
