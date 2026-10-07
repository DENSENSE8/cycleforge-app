/**
 * Putaway targets — the client-safe contract (no server imports).
 *
 * One receipt type (the carton's Type pill: PO / Return / Trade-in) links to
 * one rack or shelf per org: "this is where this type goes". The link is an
 * attribute on the `locations` row (`locations.putaway_intake_kind`,
 * migration 2026-10-07_locations_putaway_intake_kind.sql), so the next-step
 * card can say "Place on the Return rack → RK12-3".
 */

import { z } from 'zod';

export const PUTAWAY_INTAKE_KINDS = ['PO', 'RETURN', 'TRADE_IN'] as const;
export type PutawayIntakeKind = (typeof PUTAWAY_INTAKE_KINDS)[number];

export interface PutawayTarget {
  locationId: number;
  /** The location's barcode — the label an operator scans. */
  code: string;
  /** Operator-facing name (`display_name` falling back to `name`). */
  face: string;
}

export type PutawayTargets = Record<PutawayIntakeKind, PutawayTarget | null>;

export const PUTAWAY_TARGETS_URL = '/api/receiving/putaway-targets';
export const PUTAWAY_TARGETS_QUERY_KEY = ['receiving', 'putaway-targets'] as const;

export const PutawayTargetActionBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('link'),
    kind: z.enum(PUTAWAY_INTAKE_KINDS),
    scanned: z.string().trim().min(1).max(64),
    clientEventId: z.string().min(1).max(100),
  }),
  z.object({
    action: z.literal('unlink'),
    kind: z.enum(PUTAWAY_INTAKE_KINDS),
    clientEventId: z.string().min(1).max(100),
  }),
]);
export type PutawayTargetAction = z.infer<typeof PutawayTargetActionBody>;

export interface PutawayTargetsResponse {
  success: true;
  targets: PutawayTargets;
}

/** Every kind unlinked — also what reads return before the migration applies. */
export function emptyPutawayTargets(): PutawayTargets {
  return { PO: null, RETURN: null, TRADE_IN: null };
}
