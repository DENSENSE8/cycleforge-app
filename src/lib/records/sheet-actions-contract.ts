/**
 * The Records sheet's writes (docs/refactors/records/PROMPT-records-sheet-handoff-2026-10-06.md
 * §4.2–4.3) — request bodies and answers, client-safe. The routes live under
 * `src/app/api/records/`; the domain under `src/lib/records/sheet-actions/`.
 *
 * A target is one LINE: an `orders` row (outbound) or a `receiving_line`
 * (inbound). The client expands the grain it shows into lines before sending
 * (order grain = every line of the order), so the server only ever acts on the
 * lines it is named — never widens a selection.
 */

import { z } from 'zod';

export const RecordTargetSchema = z
  .object({
    direction: z.enum(['outbound', 'inbound']),
    /** `orders.id` (outbound) or `receiving_line.id` (inbound). */
    id: z.number().int().positive(),
  })
  .strict();
export type RecordTarget = z.infer<typeof RecordTargetSchema>;

/** The row key the sheet uses for a line (`NavLocateEntry.key`): `out:<orders.id>` / `in:<receiving_line.id>`. */
export function recordTargetKey(target: RecordTarget): string {
  return `${target.direction === 'outbound' ? 'out' : 'in'}:${target.id}`;
}

const Targets = z.array(RecordTargetSchema).min(1).max(500);

/**
 * `POST /api/records/tracking` — give the named lines a tracking number (the
 * carrier is detected from the number).
 * `set` makes it each line's PRIMARY tracking and unlinks the line's previous
 * primary from those lines only (the tracking row itself stays, as do other
 * lines' links to it); `add` links it as another box beside the primary (and
 * as the primary on a line that has none). Outbound: refused on a line when
 * the number already belongs to a different order not named in the request.
 */
export const RecordTrackingBodySchema = z
  .object({
    targets: Targets,
    tracking: z.string().trim().min(4).max(64),
    mode: z.enum(['set', 'add']),
  })
  .strict();
export type RecordTrackingBody = z.infer<typeof RecordTrackingBodySchema>;

/** `POST /api/records/tracking/unlink` — unlink one tracking from the named lines (the tracking row stays). */
export const RecordTrackingUnlinkBodySchema = z
  .object({ targets: Targets, shipmentId: z.number().int().positive() })
  .strict();
export type RecordTrackingUnlinkBody = z.infer<typeof RecordTrackingUnlinkBodySchema>;

/**
 * `POST /api/records/order-number` — re-key the named lines under a new order
 * number. Refused whole (409, `{ error }`) when any line would collide on
 * `(organization_id, order_id, account_source, external_line_id)` — never a
 * silent merge. Inbound lines rename their inbound order, so every line of
 * that order must be named (else that order's lines answer `refused`).
 */
export const RecordOrderNumberBodySchema = z
  .object({ targets: Targets, orderNumber: z.string().trim().min(1).max(80) })
  .strict();
export type RecordOrderNumberBody = z.infer<typeof RecordOrderNumberBodySchema>;

/** `POST /api/records/delete` — delete the named lines under the §4.3 refusals. */
export const RecordDeleteBodySchema = z.object({ targets: Targets }).strict();
export type RecordDeleteBody = z.infer<typeof RecordDeleteBodySchema>;

/** `POST /api/records/actions` — the bottom bar's other verbs. */
export const RecordActionBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('note'), targets: Targets, text: z.string().trim().min(1).max(2000) }).strict(),
  z
    .object({
      action: z.literal('ship_by'),
      targets: Targets,
      /** `YYYY-MM-DD`, or null to clear. Outbound only. */
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    })
    .strict(),
  /** Outbound only: who picks (`pick`) or packs (`pack`) the line; null clears. */
  z
    .object({
      action: z.literal('assign'),
      targets: Targets,
      stage: z.enum(['pick', 'pack']),
      staffId: z.number().int().positive().nullable(),
    })
    .strict(),
  /** Internal status the warehouse may set by hand (outbound): put on hold / release the hold. */
  z.object({ action: z.literal('hold'), targets: Targets, on: z.boolean() }).strict(),
]);
export type RecordActionBody = z.infer<typeof RecordActionBodySchema>;

/** One line's answer. `refused` carries the reason in the operator's words. */
export interface RecordActionResult {
  key: string;
  outcome: 'done' | 'refused';
  reason?: string;
}

/** Every write answers with one result per target, in target order. */
export interface RecordActionResponse {
  results: RecordActionResult[];
}
