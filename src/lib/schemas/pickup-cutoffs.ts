import { z } from 'zod';
import { normalizePickupCarrier, PICKUP_CUTOFF_TIME_RE, type PickupWeekday } from '@/lib/live-feed/pickup-cutoffs-shared';

const PickupCutoffInput = z.object({
  carrier: z
    .string()
    .max(32)
    .transform((raw, ctx) => {
      const carrier = normalizePickupCarrier(raw);
      if (!carrier) {
        ctx.addIssue({ code: 'custom', message: 'Carrier is required' });
        return z.NEVER;
      }
      return carrier;
    }),
  weekday: z
    .number()
    .int()
    .min(0)
    .max(6)
    .transform((w) => w as PickupWeekday),
  cutoffLocal: z.string().regex(PICKUP_CUTOFF_TIME_RE, 'Use 24-hour HH:MM'),
});

/** PUT /api/live-feed/pickup-cutoffs — the org's whole cutoff set; one per carrier × weekday. */
export const ReplacePickupCutoffsBody = z
  .object({ cutoffs: z.array(PickupCutoffInput).max(500) })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.cutoffs.forEach((row, index) => {
      const key = `${row.carrier}:${row.weekday}`;
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', path: ['cutoffs', index], message: `Two cutoffs for ${row.carrier} on weekday ${row.weekday}` });
      }
      seen.add(key);
    });
  });
