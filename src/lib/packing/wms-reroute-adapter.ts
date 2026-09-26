import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';

const PLACEABLE_KINDS = ['DESK', 'STAGING'] as const;
const ORG_ID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * The cross-repository wire contract emitted by the Garisek-OS WMS graph.
 * Strict parsing is intentional: model-authored database authority, SQL, or
 * arbitrary metadata must never cross into the CycleForge transaction.
 */
export const WmsRerouteIntentSchema = z.object({
  v: z.literal(1),
  action: z.literal('stage.reroute'),
  commandId: z.string().trim().min(1).max(200),
  signalId: z.string().trim().min(1).max(200),
  // Mirrors tenancy/db.ts: legacy dogfood ids are UUID-shaped but do not carry
  // RFC version bits, so z.uuid() would reject an otherwise valid tenant key.
  organizationId: z.string().regex(ORG_ID_PATTERN),
  staffId: z.number().int().positive(),
  orderId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  fromSlot: z.string().trim().min(1).max(200),
  toSlot: z.string().trim().min(1).max(200),
  reason: z.literal('slot_full'),
}).strict();

type WmsRerouteIntent = z.infer<typeof WmsRerouteIntentSchema>;

const WmsRerouteCommitSchema = z.object({
  status: z.enum(['committed', 'replayed']),
  mutationId: z.string().min(1),
  commandId: z.string().min(1),
  orderId: z.number().int().positive(),
  fromSlot: z.string().min(1),
  toSlot: z.string().min(1),
  committedAt: z.string().datetime({ offset: true }),
}).strict();

type WmsRerouteCommit = z.infer<typeof WmsRerouteCommitSchema>;

type WmsRerouteCommitErrorCode =
  | 'TENANT_MISMATCH'
  | 'UNSUPPORTED_QUANTITY'
  | 'COMMAND_CONFLICT'
  | 'STAFF_NOT_FOUND'
  | 'ORDER_NOT_PLACED'
  | 'SOURCE_MISMATCH'
  | 'SOURCE_CAPACITY_UNCONFIGURED'
  | 'SOURCE_NOT_FULL'
  | 'DESTINATION_NOT_FOUND'
  | 'DESTINATION_CAPACITY_UNCONFIGURED'
  | 'DESTINATION_FULL';

export class WmsRerouteCommitError extends Error {
  constructor(
    public readonly code: WmsRerouteCommitErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WmsRerouteCommitError';
  }
}

type LocationRow = {
  id: number;
  name: string;
  barcode: string | null;
  capacity: number | null;
};

type PlacementRow = LocationRow & { location_id: number };

type EventRow = {
  id: number;
  order_id: number;
  from_name: string;
  from_barcode: string | null;
  to_name: string;
  to_barcode: string | null;
  created_at: Date | string;
};

function slotId(row: Pick<LocationRow, 'name' | 'barcode'>): string {
  return row.barcode?.trim() || row.name;
}

function slotMatches(row: Pick<LocationRow, 'name' | 'barcode'>, expected: string): boolean {
  return row.name === expected || row.barcode?.trim() === expected;
}

function commandMarker(orgId: OrgId, commandId: string): string {
  const digest = createHash('sha256').update(`${orgId}\0${commandId}`).digest('hex');
  return `wms:stage.reroute:v1:${digest}`;
}

function asIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function receiptFromEvent(
  event: EventRow,
  intent: WmsRerouteIntent,
  status: WmsRerouteCommit['status'],
): WmsRerouteCommit {
  const fromSlot = event.from_barcode?.trim() || event.from_name;
  const toSlot = event.to_barcode?.trim() || event.to_name;
  if (
    Number(event.order_id) !== intent.orderId
    || fromSlot !== intent.fromSlot
    || toSlot !== intent.toSlot
  ) {
    throw new WmsRerouteCommitError(
      'COMMAND_CONFLICT',
      'The command id already belongs to a different reroute mutation.',
    );
  }
  return WmsRerouteCommitSchema.parse({
    status,
    mutationId: `order-pack-placement-event:${event.id}`,
    commandId: intent.commandId,
    orderId: intent.orderId,
    fromSlot: intent.fromSlot,
    toSlot: intent.toSlot,
    committedAt: asIso(event.created_at),
  });
}

async function commitInTransaction(
  client: PoolClient,
  orgId: OrgId,
  intent: WmsRerouteIntent,
): Promise<WmsRerouteCommit> {
  const marker = commandMarker(orgId, intent.commandId);

  // One winner per tenant-scoped command, including concurrent deliveries.
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [marker],
  );

  const replay = await client.query<EventRow>(
    `SELECT e.id, e.order_id,
            from_l.name AS from_name, from_l.barcode AS from_barcode,
            to_l.name AS to_name, to_l.barcode AS to_barcode,
            e.created_at
       FROM order_pack_placement_events e
       JOIN locations from_l
         ON from_l.id = e.from_location_id
        AND from_l.organization_id = e.organization_id
       JOIN locations to_l
         ON to_l.id = e.to_location_id
        AND to_l.organization_id = e.organization_id
      WHERE e.organization_id = $1
        AND e.source = 'move'
        AND e.reason = $2
      ORDER BY e.id DESC
      LIMIT 1`,
    [orgId, marker],
  );
  if (replay.rows[0]) return receiptFromEvent(replay.rows[0], intent, 'replayed');

  const staff = await client.query(
    `SELECT id FROM staff
      WHERE organization_id = $1 AND id = $2
      LIMIT 1`,
    [orgId, intent.staffId],
  );
  if (!staff.rows[0]) {
    throw new WmsRerouteCommitError('STAFF_NOT_FOUND', 'Staff actor is not in this tenant.');
  }

  const placement = await client.query<PlacementRow>(
    `SELECT p.location_id, l.id, l.name, l.barcode, l.capacity
       FROM order_pack_placements p
       JOIN locations l
         ON l.id = p.location_id
        AND l.organization_id = p.organization_id
      WHERE p.organization_id = $1 AND p.order_id = $2
      FOR UPDATE OF p, l`,
    [orgId, intent.orderId],
  );
  const source = placement.rows[0];
  if (!source) {
    throw new WmsRerouteCommitError('ORDER_NOT_PLACED', 'Order has no current pack placement.');
  }
  if (!slotMatches(source, intent.fromSlot)) {
    throw new WmsRerouteCommitError(
      'SOURCE_MISMATCH',
      `Order is no longer at source slot ${intent.fromSlot}.`,
    );
  }

  const destination = await client.query<LocationRow>(
    `SELECT id, name, barcode, capacity
       FROM locations
      WHERE organization_id = $1
        AND is_active = true
        AND location_kind = ANY($2::text[])
        AND (barcode = $3 OR name = $3)
      LIMIT 1
      FOR UPDATE`,
    [orgId, [...PLACEABLE_KINDS], intent.toSlot],
  );
  const target = destination.rows[0];
  if (!target) {
    throw new WmsRerouteCommitError(
      'DESTINATION_NOT_FOUND',
      `Destination slot ${intent.toSlot} is not an active packing location.`,
    );
  }
  if (target.id === source.location_id) {
    throw new WmsRerouteCommitError('SOURCE_MISMATCH', 'Source and destination are the same slot.');
  }

  // Serialize all graph mutations targeting the same tenant/location before
  // counting capacity. The location row lock also protects configuration edits.
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [`wms:stage.capacity:v1:${orgId}:${target.id}`],
  );

  const loads = await client.query<{ source_load: number; destination_load: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE location_id = $2)::int AS source_load,
       COUNT(*) FILTER (WHERE location_id = $3)::int AS destination_load
       FROM order_pack_placements
      WHERE organization_id = $1
        AND location_id = ANY($4::int[])`,
    [orgId, source.location_id, target.id, [source.location_id, target.id]],
  );
  const sourceLoad = Number(loads.rows[0]?.source_load ?? 0);
  const destinationLoad = Number(loads.rows[0]?.destination_load ?? 0);

  if (source.capacity == null || source.capacity <= 0) {
    throw new WmsRerouteCommitError(
      'SOURCE_CAPACITY_UNCONFIGURED',
      `Source slot ${slotId(source)} has no positive capacity configured.`,
    );
  }
  if (source.capacity - sourceLoad >= intent.quantity) {
    throw new WmsRerouteCommitError(
      'SOURCE_NOT_FULL',
      `Source slot ${slotId(source)} still has capacity.`,
    );
  }
  if (target.capacity == null || target.capacity <= 0) {
    throw new WmsRerouteCommitError(
      'DESTINATION_CAPACITY_UNCONFIGURED',
      `Destination slot ${slotId(target)} has no positive capacity configured.`,
    );
  }
  if (target.capacity - destinationLoad < intent.quantity) {
    throw new WmsRerouteCommitError(
      'DESTINATION_FULL',
      `Destination slot ${slotId(target)} cannot accept this order.`,
    );
  }

  await client.query(
    `UPDATE order_pack_placements
        SET location_id = $3,
            placed_at = NOW(),
            placed_by_staff_id = $4,
            source = 'move',
            updated_at = NOW()
      WHERE organization_id = $1 AND order_id = $2`,
    [orgId, intent.orderId, target.id, intent.staffId],
  );

  const event = await client.query<EventRow>(
    `WITH inserted AS (
       INSERT INTO order_pack_placement_events (
         organization_id, order_id, from_location_id, to_location_id,
         staff_id, source, reason
       ) VALUES ($1, $2, $3, $4, $5, 'move', $6)
       RETURNING id, order_id, from_location_id, to_location_id, created_at
     )
     SELECT inserted.id, inserted.order_id,
            from_l.name AS from_name, from_l.barcode AS from_barcode,
            to_l.name AS to_name, to_l.barcode AS to_barcode,
            inserted.created_at
       FROM inserted
       JOIN locations from_l ON from_l.id = inserted.from_location_id
       JOIN locations to_l ON to_l.id = inserted.to_location_id`,
    [orgId, intent.orderId, source.location_id, target.id, intent.staffId, marker],
  );
  if (!event.rows[0]) throw new Error('Reroute event insert did not return a receipt.');
  return receiptFromEvent(event.rows[0], intent, 'committed');
}

/**
 * Trusted CycleForge port for `stage.reroute` graph intents. `orgId` is supplied
 * by authenticated application context and is never selected by the model.
 */
export async function commitWmsReroute(
  orgId: OrgId,
  rawIntent: unknown,
  client?: PoolClient,
): Promise<WmsRerouteCommit> {
  const intent = WmsRerouteIntentSchema.parse(rawIntent);
  if (intent.organizationId !== orgId) {
    throw new WmsRerouteCommitError(
      'TENANT_MISMATCH',
      'Intent organization does not match the authenticated tenant.',
    );
  }
  // Current staging capacity is measured in placed orders. Supporting unit
  // quantities requires the unit-placement domain, not silent reinterpretation.
  if (intent.quantity !== 1) {
    throw new WmsRerouteCommitError(
      'UNSUPPORTED_QUANTITY',
      'Order staging reroutes require quantity 1.',
    );
  }

  const run = (transactionClient: PoolClient) => commitInTransaction(transactionClient, orgId, intent);
  return client ? run(client) : withTenantTransaction(orgId, run);
}
