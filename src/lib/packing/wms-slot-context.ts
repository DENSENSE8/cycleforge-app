import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';

const SensoryIdentitySchema = z.object({
  organizationId: z.string().min(1),
  staffId: z.number().int().positive(),
  orderId: z.number().int().positive(),
  observation: z.object({
    sourceSlotId: z.string().min(1),
    quantity: z.number().int().positive(),
  }).passthrough(),
}).passthrough();

export type WmsTrustedSlotContext = {
  source: {
    slotId: string;
    currentLoad: number;
    capacity: number;
    distanceMeters: number;
    allowed: boolean;
  };
  candidates: Array<{
    slotId: string;
    currentLoad: number;
    capacity: number;
    distanceMeters: number;
    allowed: boolean;
  }>;
};

type LocationLoadRow = {
  id: number;
  name: string;
  barcode: string | null;
  capacity: number | null;
  current_load: number;
};

function slotId(row: Pick<LocationLoadRow, 'name' | 'barcode'>): string {
  return row.barcode?.trim() || row.name;
}

export async function resolveWmsTrustedSlotContext(
  orgId: OrgId,
  rawSignal: unknown,
  client?: PoolClient,
): Promise<WmsTrustedSlotContext> {
  const signal = SensoryIdentitySchema.parse(rawSignal);
  if (signal.organizationId !== orgId) throw new Error('Signal tenant does not match authenticated tenant.');

  const run = async (transactionClient: PoolClient): Promise<WmsTrustedSlotContext> => {
    const actor = await transactionClient.query(
      `SELECT id FROM staff
        WHERE organization_id = $1 AND id = $2
        LIMIT 1`,
      [orgId, signal.staffId],
    );
    if (!actor.rows[0]) throw new Error('Signal staff actor is not in this tenant.');

    const sourceResult = await transactionClient.query<LocationLoadRow>(
      `SELECT l.id, l.name, l.barcode, l.capacity,
              COUNT(all_p.id)::int AS current_load
         FROM order_pack_placements p
         JOIN locations l
           ON l.id = p.location_id AND l.organization_id = p.organization_id
         LEFT JOIN order_pack_placements all_p
           ON all_p.organization_id = l.organization_id AND all_p.location_id = l.id
        WHERE p.organization_id = $1 AND p.order_id = $2
        GROUP BY l.id, l.name, l.barcode, l.capacity
        LIMIT 1`,
      [orgId, signal.orderId],
    );
    const source = sourceResult.rows[0];
    if (!source) throw new Error('Order has no current pack placement.');
    if (slotId(source) !== signal.observation.sourceSlotId) {
      throw new Error('Observed source slot does not match the current placement.');
    }
    if (source.capacity == null || source.capacity <= 0) {
      throw new Error(`Source slot ${slotId(source)} has no positive capacity configured.`);
    }

    const candidatesResult = await transactionClient.query<LocationLoadRow>(
      `SELECT l.id, l.name, l.barcode, l.capacity,
              COUNT(p.id)::int AS current_load
         FROM locations l
         LEFT JOIN order_pack_placements p
           ON p.organization_id = l.organization_id AND p.location_id = l.id
        WHERE l.organization_id = $1
          AND l.id <> $2
          AND l.is_active = true
          AND l.location_kind = ANY($3::text[])
          AND l.capacity IS NOT NULL
          AND l.capacity > 0
        GROUP BY l.id, l.name, l.barcode, l.capacity
        ORDER BY l.sort_order, l.id`,
      [orgId, source.id, ['DESK', 'STAGING']],
    );
    if (candidatesResult.rows.length === 0) {
      throw new Error('No alternate packing locations have capacity configured.');
    }

    return {
      // Physical coordinates are not yet stored. Zero is an explicit neutral
      // distance so the graph falls through to remaining capacity + slot id.
      source: {
        slotId: slotId(source),
        currentLoad: Number(source.current_load),
        capacity: Number(source.capacity),
        distanceMeters: 0,
        allowed: true,
      },
      candidates: candidatesResult.rows.map((candidate) => ({
        slotId: slotId(candidate),
        currentLoad: Number(candidate.current_load),
        capacity: Number(candidate.capacity),
        distanceMeters: 0,
        allowed: true,
      })),
    };
  };

  return client ? run(client) : withTenantTransaction(orgId, run);
}
