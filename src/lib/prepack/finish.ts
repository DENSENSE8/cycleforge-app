import 'server-only';

import type { PoolClient } from 'pg';
import { recordInventoryEvent } from '@/lib/inventory/events';
import { transition, type SerialState } from '@/lib/inventory/state-machine';
import { createSealedPackageTx } from '@/lib/labels/manifest';
import type { OrgId } from '@/lib/tenancy/constants';
import { loadPrepackEvidence, loadPrepackKit } from './server';
import {
  missingPackageEvidence,
  packageEvidenceRefusal,
  type PrepackCondition,
  type PrepackKit,
  type PrepackProvenance,
} from './types';

export class PrepackRefusal extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

export interface FinishPackageInput {
  serialUnitIds: number[];
  skuCatalogId: number;
  conditionGrade: PrepackCondition;
  refurbProvenance: PrepackProvenance;
  contents: { kitPartId: number; included: boolean }[];
  clientEventId?: string;
  actorStaffId: number | null;
}

export interface FinishedPackage {
  kit: PrepackKit;
  /** Serial keys in package order (unit_uid, else serial) — what the caller reloads. */
  serials: string[];
  /** The SEALED PREBOX package; null for a one-serial package, whose label is the unit's own. */
  package: { id: number; uid: string } | null;
}

interface LockedUnit {
  id: number;
  serial_number: string;
  sku: string | null;
  sku_catalog_id: number | null;
  current_status: string;
}

/**
 * Finish is the only prepack writer. One transaction for the whole package:
 * every serial is validated (not shipped, not on an open order, not packed
 * elsewhere, the package's product) and stamped with the package's grade,
 * provenance and contents; a package of two or more serials becomes one
 * SEALED PREBOX manifest (one label). Prepack never stores: the packers put
 * the package away. A serial first seen at prepack is received (UNKNOWN →
 * RECEIVED) so it is real inventory awaiting putaway.
 */
export async function finishPrepackPackage(
  db: PoolClient,
  orgId: OrgId,
  input: FinishPackageInput,
): Promise<FinishedPackage> {
  const ids = Array.from(new Set(input.serialUnitIds));
  const locked = await db.query<LockedUnit>(
    `SELECT id, serial_number, sku, sku_catalog_id, current_status::text AS current_status
       FROM serial_units
      WHERE organization_id = $1 AND id = ANY($2::int[])
      ORDER BY id
      FOR UPDATE`,
    [orgId, ids],
  );
  const byId = new Map(locked.rows.map((row) => [Number(row.id), row]));
  const units = ids.map((id) => byId.get(id));
  const missingIndex = units.findIndex((unit) => !unit);
  if (missingIndex >= 0) {
    throw new PrepackRefusal(`Serial unit ${ids[missingIndex]} is no longer in CycleForge — remove it and scan it again.`, 404);
  }
  const members = units as LockedUnit[];

  const kit = await loadPrepackKit(orgId, input.skuCatalogId, db);
  if (!kit) throw new PrepackRefusal('That product no longer exists — choose the product again.', 404);

  const allocations = await db.query<{ serial_unit_id: number; order_label: string | null }>(
    `SELECT DISTINCT ON (a.serial_unit_id) a.serial_unit_id, o.order_id AS order_label
       FROM order_unit_allocations a
  LEFT JOIN orders o ON o.id = a.order_id AND o.organization_id = a.organization_id
      WHERE a.organization_id = $1 AND a.serial_unit_id = ANY($2::int[])
        AND a.state::text NOT IN ('RELEASED', 'RETURNED', 'SHIPPED')
      ORDER BY a.serial_unit_id, a.allocated_at DESC, a.id DESC`,
    [orgId, ids],
  );
  const allocatedTo = new Map(allocations.rows.map((row) => [Number(row.serial_unit_id), row.order_label]));

  for (const unit of members) {
    const serial = unit.serial_number;
    if (unit.current_status === 'SHIPPED') {
      throw new PrepackRefusal(`${serial} already shipped — remove it from this package.`);
    }
    if (allocatedTo.has(unit.id)) {
      const order = allocatedTo.get(unit.id);
      throw new PrepackRefusal(`${serial} is on order ${order || 'an open order'} — remove it from this package or release it from that order first.`);
    }
    const idMismatch = unit.sku_catalog_id != null && Number(unit.sku_catalog_id) !== kit.catalog.id;
    const skuMismatch =
      unit.sku_catalog_id == null && Boolean(unit.sku?.trim()) && unit.sku!.trim().toUpperCase() !== kit.catalog.sku.trim().toUpperCase();
    if (idMismatch || skuMismatch) {
      throw new PrepackRefusal(`${serial} belongs to ${unit.sku || 'a different product'}, not ${kit.catalog.sku} — remove it from this package.`);
    }
    const status = unit.current_status as SerialState;
    if (status === 'ON_HOLD') throw new PrepackRefusal(`${serial} is on hold — release the hold, then print again.`);
    if (status === 'SCRAPPED') throw new PrepackRefusal(`${serial} is scrapped — remove it from this package.`);
  }

  // Packed elsewhere? Re-finishing an existing package is allowed only with exactly its serials.
  const memberships = await db.query<{
    serial_unit_id: number;
    manifest_id: number;
    manifest_uid: string;
    manifest_type: string;
    status: string;
    member_ids: number[];
  }>(
    `SELECT item.serial_unit_id, lm.id AS manifest_id, lm.manifest_uid, lm.manifest_type, lm.status,
            ARRAY(SELECT other.serial_unit_id FROM label_manifest_items other
                   WHERE other.organization_id = lm.organization_id AND other.manifest_id = lm.id) AS member_ids
       FROM label_manifest_items item
       JOIN label_manifests lm ON lm.id = item.manifest_id AND lm.organization_id = item.organization_id
      WHERE item.organization_id = $1 AND item.serial_unit_id = ANY($2::int[])`,
    [orgId, ids],
  );
  let reuse: { id: number; uid: string } | null = null;
  for (const row of memberships.rows) {
    const memberIds = row.member_ids.map(Number);
    const exact =
      row.manifest_type === 'PREBOX' && row.status === 'SEALED' &&
      memberIds.length === ids.length && memberIds.every((id) => byId.has(id));
    if (!exact) {
      const serial = byId.get(Number(row.serial_unit_id))?.serial_number ?? `unit ${row.serial_unit_id}`;
      throw new PrepackRefusal(`${serial} is already packed in ${row.manifest_uid} — scan every serial of that package, or dissolve it under Label manifests first.`);
    }
    reuse = { id: Number(row.manifest_id), uid: row.manifest_uid };
  }

  const decisionMap = new Map(input.contents.map((row) => [row.kitPartId, row.included]));
  if (decisionMap.size !== kit.parts.length || kit.parts.some((part) => !decisionMap.has(part.id))) {
    throw new PrepackRefusal('Mark every expected piece Included or Missing.', 400);
  }

  const evidence = await Promise.all(
    members.map(async (unit) => ({ id: unit.id, evidence: await loadPrepackEvidence(orgId, unit.id, db) })),
  );
  const evidenceRefusal = packageEvidenceRefusal(missingPackageEvidence(evidence, kit.parts.length), members.length);
  if (evidenceRefusal) throw new PrepackRefusal(evidenceRefusal);

  for (const unit of members) {
    await writeContents(db, orgId, unit.id, kit, decisionMap);
    if (unit.current_status !== 'UNKNOWN') continue;
    const received = await transition({
      unitId: unit.id,
      to: 'RECEIVED',
      eventType: 'RECEIVED',
      actorStaffId: input.actorStaffId,
      station: 'MOBILE',
      clientEventId: input.clientEventId ? `${input.clientEventId}:${unit.id}:received` : null,
      notes: 'Received at prepack — awaiting putaway by packing',
      payload: { source: 'prepack' },
      expectedFrom: 'UNKNOWN',
      binId: null,
    }, db, orgId);
    if (!received.ok) throw new PrepackRefusal(received.error, received.status);
  }

  await db.query(
    `UPDATE serial_units
        SET sku_catalog_id = $3,
            sku = $4,
            condition_grade = $5::condition_grade_enum,
            prepacked_at = NOW(),
            prepacked_by_staff_id = $6,
            refurb_provenance = $7,
            updated_at = NOW()
      WHERE organization_id = $2 AND id = ANY($1::int[])`,
    [
      ids,
      orgId,
      kit.catalog.id,
      kit.catalog.sku,
      input.conditionGrade,
      input.actorStaffId,
      input.refurbProvenance,
    ],
  );

  let pkg = reuse;
  if (reuse) {
    await db.query(
      `UPDATE label_manifests
          SET sku = $3, sku_catalog_id = $4, condition_grade = $5, updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [orgId, reuse.id, kit.catalog.sku, kit.catalog.id, input.conditionGrade],
    );
  } else if (members.length > 1) {
    const created = await createSealedPackageTx(db, orgId, {
      sku: kit.catalog.sku,
      skuCatalogId: kit.catalog.id,
      conditionGrade: input.conditionGrade,
      createdBy: input.actorStaffId,
      notes: 'Prepack package',
      serialUnitIds: ids,
    });
    pkg = { id: created.id, uid: created.manifest_uid };
  }

  for (const unit of members) {
    await recordInventoryEvent({
      event_type: 'NOTE',
      actor_staff_id: input.actorStaffId,
      station: 'MOBILE',
      serial_unit_id: unit.id,
      sku: kit.catalog.sku,
      bin_id: null,
      client_event_id: input.clientEventId ? `${input.clientEventId}:${unit.id}:note` : null,
      notes: 'Prepack finished',
      payload: {
        source: 'prepack',
        package_uid: pkg?.uid ?? null,
        package_serials: members.length,
        included: kit.parts.filter((part) => decisionMap.get(part.id) === true).length,
        missing: kit.parts.filter((part) => decisionMap.get(part.id) === false).length,
        condition: input.conditionGrade,
        provenance: input.refurbProvenance,
      },
    }, db, orgId);
  }

  return { kit, serials: members.map((unit) => unit.serial_number), package: pkg };
}

async function writeContents(
  db: PoolClient,
  orgId: OrgId,
  unitId: number,
  kit: PrepackKit,
  decisions: ReadonlyMap<number, boolean>,
): Promise<void> {
  await db.query(
    `DELETE FROM serial_unit_prepack_contents WHERE organization_id = $1 AND serial_unit_id = $2`,
    [orgId, unitId],
  );
  for (const part of kit.parts) {
    await db.query(
      `INSERT INTO serial_unit_prepack_contents (
         organization_id, serial_unit_id, kit_part_id,
         component_name, component_type, qty_required, component_sku, included
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orgId, unitId, part.id, part.componentName, part.componentType, part.qtyRequired, part.componentSku, decisions.get(part.id)],
    );
  }
}
