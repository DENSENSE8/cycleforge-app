import type { PoolClient } from 'pg';
import {
  upsertSerialUnit,
  type SerialStatus,
} from '@/lib/neon/serial-units-queries';
import { resolveSkuIdentityTitle, SKU_CATALOG_JOIN_ON_SQL } from '@/lib/sku/sku-identity-law';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { refreshReceivingUnitStageFacts } from '@/lib/receiving/receiving-unit-stage-facts';

const MAX_RECEIVING_UNIT_LABELS = 100;

export interface ReceivingUnitLabel {
  receivingLineId: number;
  receivingLineUnitId: number;
  ordinal: number;
  serialUnitId: number;
  unitUid: string;
  sku: string;
  title: string;
  /** The manufacturer's serial. Synthetic storage keys never print on the face. */
  serialNumber: string | null;
  condition: string | null;
  qrPayload: string;
  isReprint: boolean;
  clientEventId: string;
}

export interface IssueReceivingUnitLabelsResult {
  lineId: number;
  quantity: number;
  labels: ReceivingUnitLabel[];
}

export class ReceivingUnitLabelError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 422,
  ) {
    super(message);
    this.name = 'ReceivingUnitLabelError';
  }
}

interface LineRow {
  id: number;
  sku: string | null;
  item_name: string | null;
  quantity_expected: number | null;
  quantity_received: number | null;
  sku_catalog_id: number | null;
  catalog_product_title: string | null;
  line_condition: string | null;
}

interface UnitRow {
  id: string | number;
  ordinal: number;
  serial_unit_id: number | null;
  serial_absent: boolean;
  condition_grade: string | null;
  serial_number: string | null;
  unit_uid: string | null;
  current_status: string | null;
  print_count: string | number;
}

export interface IssueReceivingUnitLabelsDeps {
  transaction: <T>(orgId: OrgId, fn: (client: PoolClient) => Promise<T>) => Promise<T>;
  upsertUnit: typeof upsertSerialUnit;
  refreshFacts: typeof refreshReceivingUnitStageFacts;
}

const defaultDeps: IssueReceivingUnitLabelsDeps = {
  transaction: withTenantTransaction,
  upsertUnit: upsertSerialUnit,
  refreshFacts: refreshReceivingUnitStageFacts,
};

/** Stable private serial key for a physical slot that has no manufacturer serial. */
export function receivingUnitSyntheticSerial(lineUnitId: number): string {
  if (!Number.isInteger(lineUnitId) || lineUnitId <= 0) {
    throw new Error('receiving line unit id must be a positive integer');
  }
  return `AUTO-RLU-${lineUnitId}`;
}

/** One print-ledger idempotency key per physical unit and browser issuance. */
export function receivingUnitLabelEventId(
  lineId: number,
  lineUnitId: number,
  issuanceVersion: string,
): string {
  const version = issuanceVersion.trim();
  if (!version) throw new Error('issuance version is required');
  return `receiving-label:${lineId}:${lineUnitId}:${version}`;
}

function positiveQuantity(value: number | null): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Establish one durable serial_unit identity for every physical unit on a
 * receiving line, then return the canonical 2x1 product-label payloads.
 *
 * This method intentionally does not record a print job: the browser owns the
 * physical print gesture and records the ledger only after dispatching it.
 */
export async function issueReceivingUnitLabels(
  args: {
    lineId: number;
    issuanceVersion: string;
    actorStaffId: number | null;
  },
  orgId: OrgId,
  deps: IssueReceivingUnitLabelsDeps = defaultDeps,
): Promise<IssueReceivingUnitLabelsResult> {
  if (!Number.isInteger(args.lineId) || args.lineId <= 0) {
    throw new ReceivingUnitLabelError('Invalid receiving line id', 422);
  }
  if (!/^[A-Za-z0-9_-]{8,96}$/.test(args.issuanceVersion)) {
    throw new ReceivingUnitLabelError('Invalid issuance version', 422);
  }

  return deps.transaction(orgId, async (client) => {
    const lineResult = await client.query<LineRow>(
      `SELECT rl.id, rl.sku, rl.item_name, rl.quantity_expected, rl.quantity_received,
              sc.id AS sku_catalog_id, sc.product_title AS catalog_product_title,
              rlt.condition_grade::text AS line_condition
         FROM receiving_line rl
         LEFT JOIN sku_catalog sc ON ${SKU_CATALOG_JOIN_ON_SQL}
         LEFT JOIN receiving_line_testing rlt
           ON rlt.receiving_line_id = rl.id
          AND rlt.organization_id = rl.organization_id
        WHERE rl.id = $1 AND rl.organization_id = $2
        FOR UPDATE OF rl`,
      [args.lineId, orgId],
    );
    const line = lineResult.rows[0];
    if (!line) throw new ReceivingUnitLabelError(`Receiving line ${args.lineId} not found`, 404);

    const sku = line.sku?.trim() ?? '';
    if (!sku || !line.sku_catalog_id) {
      throw new ReceivingUnitLabelError(
        'Pair this line to a catalog SKU before issuing item labels',
        409,
      );
    }

    const existingResult = await client.query<{ id: string | number; ordinal: number }>(
      `SELECT id, ordinal
         FROM receiving_line_unit
        WHERE organization_id = $1 AND receiving_line_id = $2
        ORDER BY ordinal ASC
        FOR UPDATE`,
      [orgId, args.lineId],
    );
    const requestedQuantity = Math.max(
      positiveQuantity(line.quantity_expected),
      positiveQuantity(line.quantity_received),
      existingResult.rows.length,
    );
    if (requestedQuantity < 1) {
      throw new ReceivingUnitLabelError(
        'Set the received or expected quantity before issuing item labels',
        409,
      );
    }
    if (requestedQuantity > MAX_RECEIVING_UNIT_LABELS) {
      throw new ReceivingUnitLabelError(
        `A receiving line can issue at most ${MAX_RECEIVING_UNIT_LABELS} labels at once`,
        422,
      );
    }

    const maxOrdinal = existingResult.rows.reduce(
      (max, unit) => Math.max(max, Number(unit.ordinal) || 0),
      0,
    );
    const missing = requestedQuantity - existingResult.rows.length;
    if (missing > 0) {
      const ordinals = Array.from({ length: missing }, (_, index) => maxOrdinal + index + 1);
      await client.query(
        `INSERT INTO receiving_line_unit (organization_id, receiving_line_id, ordinal)
         SELECT $1::uuid, $2::int, ordinal
           FROM unnest($3::int[]) AS ordinal
         ON CONFLICT (organization_id, receiving_line_id, ordinal) DO NOTHING`,
        [orgId, args.lineId, ordinals],
      );
    }

    const unitsResult = await client.query<UnitRow>(
      `SELECT rlu.id, rlu.ordinal, rlu.serial_unit_id, rlu.serial_absent,
              rlu.condition_grade::text AS condition_grade,
              su.serial_number, su.unit_uid, su.current_status::text AS current_status,
              (SELECT COUNT(*)::int
                 FROM label_print_jobs lpj
                WHERE lpj.organization_id = rlu.organization_id
                  AND lpj.serial_unit_id = su.id) AS print_count
         FROM receiving_line_unit rlu
         LEFT JOIN serial_units su
           ON su.id = rlu.serial_unit_id AND su.organization_id = rlu.organization_id
        WHERE rlu.organization_id = $1 AND rlu.receiving_line_id = $2
        ORDER BY rlu.ordinal ASC
        FOR UPDATE OF rlu`,
      [orgId, args.lineId],
    );

    const title =
      resolveSkuIdentityTitle({
        catalog_product_title: line.catalog_product_title,
        item_name: line.item_name,
        sku,
      }) || sku;
    const labels: ReceivingUnitLabel[] = [];

    for (const slot of unitsResult.rows) {
      const lineUnitId = Number(slot.id);
      const syntheticSerial = receivingUnitSyntheticSerial(lineUnitId);
      const storedSerial = slot.serial_number?.trim() || syntheticSerial;
      const condition = slot.condition_grade ?? line.line_condition ?? null;
      // A reprint must not regress TESTED/STOCKED/PICKED/SHIPPED. Existing
      // identified units are read as-is; only a new slot or a legacy linked
      // unit missing its UID passes through the canonical upsert/mint path.
      // A new unit mints RECEIVED — `LABELED` is the outbound shipping-label
      // state, from which no QC verdict is legal; the receiving label itself
      // is recorded by `label_print_jobs`.
      const upserted =
        slot.serial_unit_id != null && slot.unit_uid
          ? null
          : await deps.upsertUnit(
              {
                serial_number: storedSerial,
                sku,
                sku_catalog_id: line.sku_catalog_id,
                origin_source: 'receiving',
                origin_receiving_line_id: args.lineId,
                actor_id: args.actorStaffId,
                condition_grade: condition,
                target_status:
                  slot.serial_unit_id != null && slot.current_status
                    ? (slot.current_status as SerialStatus)
                    : 'RECEIVED',
              },
              { dbClient: client },
              orgId,
            );
      const serialUnitId = slot.serial_unit_id ?? upserted?.unit.id ?? null;
      const unitUid = slot.unit_uid ?? upserted?.unit.unit_uid ?? null;
      if (serialUnitId == null || !unitUid) {
        throw new ReceivingUnitLabelError(
          `Could not establish an item identity for unit ${slot.ordinal}`,
          409,
        );
      }

      if (slot.serial_unit_id == null) {
        await client.query(
          `UPDATE receiving_line_unit
              SET serial_unit_id = $1, updated_at = now()
            WHERE id = $2 AND organization_id = $3 AND receiving_line_id = $4`,
          [serialUnitId, lineUnitId, orgId, args.lineId],
        );
      } else if (slot.serial_unit_id !== serialUnitId) {
        throw new ReceivingUnitLabelError(
          `Unit ${slot.ordinal} changed while labels were being issued`,
          409,
        );
      }

      const isSynthetic = storedSerial === syntheticSerial;
      labels.push({
        receivingLineId: args.lineId,
        receivingLineUnitId: lineUnitId,
        ordinal: Number(slot.ordinal),
        serialUnitId,
        unitUid,
        sku,
        title,
        serialNumber: isSynthetic ? null : storedSerial,
        condition,
        qrPayload: unitUid,
        isReprint: Number(slot.print_count) > 0,
        clientEventId: receivingUnitLabelEventId(
          args.lineId,
          lineUnitId,
          args.issuanceVersion,
        ),
      });
    }

    await deps.refreshFacts(
      orgId,
      { lineIds: [args.lineId] },
      client,
    );
    return { lineId: args.lineId, quantity: labels.length, labels };
  });
}
