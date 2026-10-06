import 'server-only';

import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { unwrapScannedSerial } from '@/lib/barcode-routing';
import { recordInventoryEvent } from '@/lib/inventory/events';
import { transition, type SerialState } from '@/lib/inventory/state-machine';
import { recordUnitEvent } from '@/lib/inventory/unit-events';
import { createSealedPackageTx } from '@/lib/labels/manifest';
import { prepackSyntheticSerial, qcLabelHandle, qcLabelUsesInternalSerial } from '@/lib/labels/qc-label-row';
import type { OrgId } from '@/lib/tenancy/constants';
import { findPrepackUnitId, loadPrepackKit } from './server';
import type { PrepackKit, PrepackLabelFace, PrepackPackageInput, PrepackSaveInput } from './types';

export class PrepackRefusal extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

export interface FinishPackagesInput extends PrepackSaveInput {
  actorStaffId: number | null;
}

export interface FinishedPackages {
  kit: PrepackKit;
  /** One scan key per package, in request order: the PREBOX uid, else the unit's label handle (`qcLabelHandle`). */
  printKeys: string[];
}

interface LockedUnit {
  id: number;
  serial_number: string;
  unit_uid: string | null;
  sku: string | null;
  sku_catalog_id: number | null;
  current_status: string;
}

interface ResolvedPackage {
  input: PrepackPackageInput;
  ids: number[];
}

/**
 * Save is the only prepack writer. One transaction for every package of the
 * request: each serial resolves to its unit or is created (a serial first
 * seen at prepack), a package with no serial gets one unit with a private
 * `AUTO-PP-…` serial, every unit is validated (not shipped, not on an open
 * order, not on hold, not scrapped, not packed elsewhere, the request's
 * product) and stamped with its package's grade, provenance and the contents;
 * a package of two or more serials becomes one SEALED PREBOX manifest (one
 * label). The hand-edited label face is stored on what the label names: the
 * manifest (`label_face`), else the one unit (`metadata.qc_label`); an
 * all-default face clears it. Prepack never stores: the packers put the package away. A unit
 * still UNKNOWN is received (UNKNOWN → RECEIVED) so it is real inventory
 * awaiting putaway.
 */
export async function finishPrepackPackages(
  db: PoolClient,
  orgId: OrgId,
  input: FinishPackagesInput,
): Promise<FinishedPackages> {
  const kit = await loadPrepackKit(orgId, input.skuCatalogId, db);
  if (!kit) throw new PrepackRefusal('That product no longer exists — choose the product again.', 404);

  const decisions = new Map(input.contents.map((row) => [row.kitPartId, row.included]));
  if (decisions.size !== kit.parts.length || kit.parts.some((part) => !decisions.has(part.id))) {
    throw new PrepackRefusal('Mark every expected piece Included or Missing.', 400);
  }

  // A retry with the same clientEventId finds the serial-less units it created.
  const syntheticToken = input.clientEventId?.replace(/[^A-Za-z0-9-]/g, '') || randomUUID();
  const packages: ResolvedPackage[] = [];
  const typedBy = new Map<number, string>();
  for (const [index, pkg] of input.packages.entries()) {
    const ids: number[] = [];
    if (pkg.serials.length === 0) {
      const serial = prepackSyntheticSerial(`${syntheticToken}-${index + 1}`);
      ids.push((await findPrepackUnitId(orgId, serial, db)) ?? (await mintUnitAtPrepack(db, orgId, kit, serial, input.actorStaffId)));
    }
    for (const raw of pkg.serials) {
      const serial = unwrapScannedSerial(raw);
      if (!serial) throw new PrepackRefusal(`Package ${index + 1} has an empty serial — type it again.`, 400);
      let id = await findPrepackUnitId(orgId, raw, db);
      if (id == null) {
        if (qcLabelUsesInternalSerial(serial)) {
          throw new PrepackRefusal(`${serial} is not in CycleForge — scan the unit's label, or leave the package without a serial.`, 404);
        }
        id = await mintUnitAtPrepack(db, orgId, kit, serial, input.actorStaffId);
      }
      if (typedBy.has(id)) {
        throw new PrepackRefusal(`${serial} is in this save twice — remove one.`, 400);
      }
      typedBy.set(id, serial);
      ids.push(id);
    }
    packages.push({ input: pkg, ids });
  }

  const allIds = packages.flatMap((pkg) => pkg.ids);
  const locked = await db.query<LockedUnit>(
    `SELECT id, serial_number, unit_uid, sku, sku_catalog_id, current_status::text AS current_status
       FROM serial_units
      WHERE organization_id = $1 AND id = ANY($2::int[])
      ORDER BY id
      FOR UPDATE`,
    [orgId, allIds],
  );
  const byId = new Map(locked.rows.map((row) => [Number(row.id), { ...row, id: Number(row.id) }]));
  const missingId = allIds.find((id) => !byId.has(id));
  if (missingId != null) {
    throw new PrepackRefusal(`${typedBy.get(missingId) ?? `Unit ${missingId}`} is no longer in CycleForge — remove it and scan it again.`, 404);
  }
  const unitOf = (id: number) => byId.get(id)!;
  // A serial-less unit is named by its label handle, never its private serial.
  const nameOf = (unit: LockedUnit) =>
    qcLabelUsesInternalSerial(unit.serial_number)
      ? qcLabelHandle({ unit_uid: unit.unit_uid, serial_number: unit.serial_number, serial_unit_id: unit.id })
      : unit.serial_number;

  const allocations = await db.query<{ serial_unit_id: number; order_label: string | null }>(
    `SELECT DISTINCT ON (a.serial_unit_id) a.serial_unit_id, o.order_id AS order_label
       FROM order_unit_allocations a
  LEFT JOIN orders o ON o.id = a.order_id AND o.organization_id = a.organization_id
      WHERE a.organization_id = $1 AND a.serial_unit_id = ANY($2::int[])
        AND a.state::text NOT IN ('RELEASED', 'RETURNED', 'SHIPPED')
      ORDER BY a.serial_unit_id, a.allocated_at DESC, a.id DESC`,
    [orgId, allIds],
  );
  const allocatedTo = new Map(allocations.rows.map((row) => [Number(row.serial_unit_id), row.order_label]));

  for (const id of allIds) {
    const unit = unitOf(id);
    const serial = nameOf(unit);
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
    [orgId, allIds],
  );
  const reuseFor = new Map<ResolvedPackage, { id: number; uid: string }>();
  for (const row of memberships.rows) {
    const unitId = Number(row.serial_unit_id);
    const pkg = packages.find((candidate) => candidate.ids.includes(unitId))!;
    const memberIds = row.member_ids.map(Number);
    const exact =
      row.manifest_type === 'PREBOX' && row.status === 'SEALED' &&
      memberIds.length === pkg.ids.length && memberIds.every((id) => pkg.ids.includes(id));
    if (!exact) {
      throw new PrepackRefusal(`${nameOf(unitOf(unitId))} is already packed in ${row.manifest_uid} — scan every serial of that package, or dissolve it under Label manifests first.`);
    }
    reuseFor.set(pkg, { id: Number(row.manifest_id), uid: row.manifest_uid });
  }

  const included = kit.parts.filter((part) => decisions.get(part.id) === true).length;
  const missing = kit.parts.length - included;
  const printKeys: string[] = [];
  for (const [index, pkg] of packages.entries()) {
    const { condition, provenance } = pkg.input;
    for (const id of pkg.ids) {
      const unit = unitOf(id);
      await writeContents(db, orgId, id, kit, decisions);
      if (unit.current_status !== 'UNKNOWN') continue;
      const received = await transition({
        unitId: id,
        to: 'RECEIVED',
        eventType: 'RECEIVED',
        actorStaffId: input.actorStaffId,
        station: 'MOBILE',
        clientEventId: input.clientEventId ? `${input.clientEventId}:${id}:received` : null,
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
      [pkg.ids, orgId, kit.catalog.id, kit.catalog.sku, condition, input.actorStaffId, provenance],
    );

    // The face lives on the labelled thing: the PREBOX manifest, else the one unit.
    const labelFace = labelFaceJson(pkg.input.label);
    let packed = reuseFor.get(pkg) ?? null;
    if (packed) {
      await db.query(
        `UPDATE label_manifests
            SET sku = $3, sku_catalog_id = $4, condition_grade = $5, label_face = $6::jsonb, updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [orgId, packed.id, kit.catalog.sku, kit.catalog.id, condition, labelFace],
      );
    } else if (pkg.ids.length > 1) {
      const created = await createSealedPackageTx(db, orgId, {
        sku: kit.catalog.sku,
        skuCatalogId: kit.catalog.id,
        conditionGrade: condition,
        createdBy: input.actorStaffId,
        notes: 'Prepack package',
        serialUnitIds: pkg.ids,
      });
      packed = { id: created.id, uid: created.manifest_uid };
      await db.query(
        `UPDATE label_manifests SET label_face = $3::jsonb WHERE organization_id = $1 AND id = $2`,
        [orgId, packed.id, labelFace],
      );
    } else {
      await db.query(
        `UPDATE serial_units
            SET metadata = CASE WHEN $3::jsonb IS NULL THEN COALESCE(metadata, '{}'::jsonb) - 'qc_label'
                                ELSE jsonb_set(COALESCE(metadata, '{}'::jsonb), '{qc_label}', $3::jsonb) END
          WHERE organization_id = $1 AND id = $2`,
        [orgId, pkg.ids[0], labelFace],
      );
    }

    for (const id of pkg.ids) {
      await recordInventoryEvent({
        event_type: 'NOTE',
        actor_staff_id: input.actorStaffId,
        station: 'MOBILE',
        serial_unit_id: id,
        sku: kit.catalog.sku,
        bin_id: null,
        client_event_id: input.clientEventId ? `${input.clientEventId}:${id}:note` : null,
        notes: 'Prepack finished',
        payload: {
          source: 'prepack',
          package_uid: packed?.uid ?? null,
          package_index: index + 1,
          package_serials: pkg.input.serials.length,
          included,
          missing,
          condition,
          provenance,
        },
      }, db, orgId);
    }

    const lead = unitOf(pkg.ids[0]!);
    printKeys.push(
      packed?.uid ?? qcLabelHandle({ unit_uid: lead.unit_uid, serial_number: lead.serial_number, serial_unit_id: lead.id }),
    );
  }

  return { kit, printKeys };
}

/** The stored face (`{title,color,text}` JSON), or null when every field prints the default. */
function labelFaceJson(face: PrepackLabelFace): string | null {
  const title = face.title?.trim() || null;
  const color = face.color?.trim() || null;
  const text = face.text?.trim() || null;
  return title || color || text ? JSON.stringify({ title, color, text }) : null;
}

/**
 * A unit first met at prepack — an OEM serial CycleForge has never seen, or
 * the private `AUTO-PP-…` serial of a package with no serial — created through
 * the canonical unit writer (`recordUnitEvent`, origin `manual`) as UNKNOWN and
 * stamped with the product, which mints its `unit_uid`. Save then receives it.
 */
async function mintUnitAtPrepack(
  db: PoolClient,
  orgId: OrgId,
  kit: PrepackKit,
  serial: string,
  actorStaffId: number | null,
): Promise<number> {
  const created = await recordUnitEvent(
    {
      organizationId: orgId,
      serialNumber: serial,
      sku: kit.catalog.sku,
      skuCatalogId: kit.catalog.id,
      originSource: 'manual',
      targetStatus: 'UNKNOWN',
      eventType: 'NOTE',
      station: 'MOBILE',
      actorStaffId,
      notes: qcLabelUsesInternalSerial(serial) ? 'Unit with no serial created at prepack' : 'Serial first seen at prepack',
      payload: { source: 'prepack' },
      writeTechSerial: false,
    },
    db,
  );
  return Number(created.unit.id);
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
