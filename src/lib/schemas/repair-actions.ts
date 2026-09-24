import { z } from 'zod';
import { REPAIR_DONOR_SOURCES } from '@/lib/repair/repair-actions';

/**
 * Validation for the bench log (`repair_actions`) and bench timer
 * (`repair_bench_sessions`). `staff_id`, `organization_id` and every
 * timestamp come from the server — none of them is accepted here.
 */

export const REPAIR_ACTION_TYPES = [
  'replaced',
  'repaired',
  'cleaned',
  'tested',
  'no_fix',
  'awaiting_part',
] as const;

/** Blank → null, otherwise trimmed and bounded. */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const RepairActionCreateBody = z.object({
  repairId: z.coerce.number().int().positive(),
  actionType: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(REPAIR_ACTION_TYPES)),
  partName: optText(300),
  oldSku: optText(120),
  newSku: optText(120),
  oldSerial: optText(120),
  newSerial: optText(120),
  /** Legacy typed minutes (desk callers); the phone attaches a session instead. */
  durationMin: z.coerce.number().int().nonnegative().nullish().transform((v) => v ?? null),
  notes: optText(4000),
  /** The caller's running bench session; the server checks it is theirs, open, and on this repair. */
  sessionId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  donorSource: z.enum(REPAIR_DONOR_SOURCES).nullish().transform((v) => v ?? null),
  donorRef: optText(120),
  componentRef: optText(60),
  componentValue: optText(120),
  componentQty: z.coerce.number().int().positive().max(999).nullish().transform((v) => v ?? null),
  /** Take the installed part out of stock. Only honoured when `canConsumeStock`; needs `stockLocationId`. */
  consumeStock: z.boolean().default(false),
  /** The bin (`locations.id`) the part is taken from — its `bin_contents` count moves with the ledger. */
  stockLocationId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
});
export type RepairActionCreateInput = z.infer<typeof RepairActionCreateBody>;

export const RepairBenchSessionBody = z.object({
  repairId: z.coerce.number().int().positive(),
  action: z.enum(['start', 'stop']),
});
export type RepairBenchSessionInput = z.infer<typeof RepairBenchSessionBody>;
