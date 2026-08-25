import { z } from 'zod';
import {
  NO_SESSION,
  isSessionEventType,
  type SessionAttribution,
} from '@/lib/sessions/attribution';

// ─── The unit↔location spine bodies (00-endgame §6, D10) ─────────────────────
//
// Both write bodies carry TWO stamped scans from the input truth layer. The
// D10 law (a location is a fact created by a scan, and only a scan) is
// enforced three deep — this schema, the domain writer, and the DB CHECK —
// so a typed location dies at the first gate with a message, not at the last
// with a constraint violation. `placedBy`/`pulledBy` are NOT here: the actor
// comes from the auth context, never the request body.

const trimmed = z.string().trim();

/** Any input-truth source may identify a UNIT (serials get typed when labels die). */
const UnitScanStamp = z.object({
  value: trimmed.min(1, 'scan value is required'),
  source: z.enum(['scanner', 'camera', 'paste', 'human']),
});

/** Only a scan may identify a LOCATION — the D10 law, at the validation gate. */
const LocationScanStamp = z.object({
  value: trimmed.min(1, 'scan value is required'),
  source: z.enum(['scanner', 'camera'], {
    message: 'A location is a fact created by a scan, and only a scan (D10).',
  }),
});

/**
 * Session attribution as the wire carries it: both-or-neither. `sessionType`
 * without a `sessionId` is a bench label belonging to no session — refused.
 */
const SessionRef = z
  .object({
    sessionId: z.number().int().positive().nullable().optional(),
    sessionType: trimmed.min(1).nullable().optional(),
  })
  .refine((s) => s.sessionId != null || s.sessionType == null, {
    message: 'sessionType requires a sessionId',
  });

/** POST /api/inventory/placements — one physical put-away. */
export const PlacementCreateBody = z.object({
  unitScan: UnitScanStamp,
  locationScan: LocationScanStamp,
  session: SessionRef.optional(),
  /** Mobile idempotency key; the domain mints one when absent. */
  clientEventId: trimmed.min(1).max(128).optional(),
});
export type PlacementCreateBodyT = z.infer<typeof PlacementCreateBody>;

/** POST /api/inventory/part-pulls — one disassembly fact. */
export const PartPullCreateBody = z.object({
  donorScan: UnitScanStamp,
  locationScan: LocationScanStamp,
  /** The org's own words for the part — data, not code. */
  partLabel: trimmed.min(1, 'partLabel is required').max(200),
  partSku: trimmed.min(1).max(100).nullable().optional(),
  partSerialUnitId: z.number().int().positive().nullable().optional(),
  quantity: z.number().int().positive().optional(),
  session: SessionRef.optional(),
  clientEventId: trimmed.min(1).max(128).optional(),
});
export type PartPullCreateBodyT = z.infer<typeof PartPullCreateBody>;

/**
 * Wire → domain attribution. Unknown bench labels degrade to null rather than
 * 400 — an unattributed type is a reporting gap; a blocked scan is a stopped
 * warehouse (same stance as attribution.ts's isAttributed).
 */
export function sessionAttributionFromBody(
  session: { sessionId?: number | null; sessionType?: string | null } | undefined,
): SessionAttribution {
  if (session?.sessionId == null) return NO_SESSION;
  const t = session.sessionType;
  return {
    sessionId: session.sessionId,
    sessionType: isSessionEventType(t) ? t : null,
  };
}
