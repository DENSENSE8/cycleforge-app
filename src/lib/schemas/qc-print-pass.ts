import { z } from 'zod';
import { CONDITION_GRADES, resolveConditionGrade, type ConditionGrade } from '@/lib/conditions';

/** Body of POST /api/qc/units/[id]/print-pass — the one fire-and-forget request after a QC label print. */

/** Trimmed text; blank reads as null. */
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().transform((v) => v || null);

export const QcPrintPassBody = z.object({
  /** One per press; replays of the same press enqueue nothing new. */
  client_event_id: z.string().trim().min(1).max(200),
  /** true = record the PASS verdict; false = print record only (a reprint). */
  pass: z.boolean(),
  /** The unit id the label printed; null when the unit has none yet (the route mints it). */
  unit_uid: optionalText(200),
  serial_number: z.string().trim().min(1).max(200),
  product_sku: z.string().trim().max(200),
  sku_catalog_id: z.number().int().positive().nullable(),
  gtin: optionalText(64),
  symbology: z.enum(['gs1datamatrix', 'datamatrix']).nullable(),
  /** A grade code or alias; anything else reads as null (the unit keeps its grade) rather than failing the press. */
  condition: z
    .string()
    .nullable()
    .transform((v): ConditionGrade | null => {
      const grade = resolveConditionGrade(v);
      return (CONDITION_GRADES as readonly string[]).includes(grade) ? (grade as ConditionGrade) : null;
    }),
  /** Capped like the verdict route: a longer paste is truncated, not refused. */
  notes: z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v ? v.slice(0, 2000) : null)),
  /** The FBA label that printed with the unit label (a paired, grade-matched FNSKU); null when none printed. */
  fnsku: optionalText(64),
});

export type QcPrintPassBody = z.infer<typeof QcPrintPassBody>;
