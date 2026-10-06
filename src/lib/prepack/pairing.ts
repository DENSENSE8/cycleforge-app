import 'server-only';

import type { PoolClient } from 'pg';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { ManualFileError } from '@/lib/manuals/manual-file-store';
import { uploadProductManual } from '@/lib/manuals/manual-upload';
import {
  linkManualToSkuInTx,
  OrderManualError,
  restoreManualPairingInTx,
  settleManualRepair,
} from '@/lib/manuals/order-manuals';
import { createKitPart } from '@/lib/neon/sku-catalog-queries';
import { deactivateProductManual } from '@/lib/neon/product-manuals-queries';
import { paperworkSkuKey } from '@/lib/manuals/paperwork-pairing';
import { ensureRelationshipInTx, isDescendant } from '@/lib/neon/sku-relationship-queries';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { loadPrepackKit } from './server';
import type { PrepackKit, PrepackKitPartInput, PrepackManualRemoveInput } from './types';

/** Prepack's pairing writes: a part (optionally paired to a child SKU) and the SKU-level manual pack print reads. */

/** A refused pairing write; `status` is the HTTP answer. */
export class PrepackPairingError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'PrepackPairingError';
  }
}

/** The refusal a pairing route answers (pairing, manual-link and manual-file refusals), or null for a server fault. */
export function pairingRefusal(error: unknown): { message: string; status: number } | null {
  if (error instanceof PrepackPairingError || error instanceof OrderManualError || error instanceof ManualFileError) {
    return { message: error.message, status: error.status };
  }
  return null;
}

/** The `[id]` segment of `/api/prepack/catalog/[id]/…` as a catalog id, or null. */
export async function catalogIdFrom(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const AUDIT_SOURCE = 'prepack';

async function lockCatalogSku(client: PoolClient, orgId: OrgId, skuCatalogId: number): Promise<string> {
  const res = await client.query<{ sku: string }>(
    `SELECT sku FROM sku_catalog WHERE id = $1 AND organization_id = $2 FOR SHARE`,
    [skuCatalogId, orgId],
  );
  const sku = res.rows[0]?.sku;
  if (!sku) throw new PrepackPairingError('SKU not found', 404);
  return sku;
}

async function freshKit(orgId: OrgId, skuCatalogId: number): Promise<PrepackKit> {
  const kit = await loadPrepackKit(orgId, skuCatalogId);
  if (!kit) throw new PrepackPairingError('SKU not found', 404);
  return kit;
}

/**
 * Add one part to the product's list (`sku_kit_parts`, as the kit-parts editor
 * writes it) and, when `childSkuCatalogId` is set, the parent → child edge
 * (`sku_relationships`, idempotent; its notes name the part so the kit reads
 * the pairing back). Never writes a reference document. Answers the fresh kit.
 */
export async function addPrepackKitPart(
  orgId: OrgId,
  skuCatalogId: number,
  input: PrepackKitPartInput,
  actorStaffId: number | null,
): Promise<PrepackKit> {
  const childId = input.childSkuCatalogId;
  if (childId === skuCatalogId) throw new PrepackPairingError('A product cannot contain itself', 400);
  // Cycle guard (as the relationship editor): parent must not already sit under the child.
  if (childId != null && (await isDescendant(childId, skuCatalogId, orgId))) {
    throw new PrepackPairingError('That child SKU already contains this product', 409);
  }

  await withTenantTransaction(orgId, async (client) => {
    await lockCatalogSku(client, orgId, skuCatalogId);
    if (childId != null) {
      const child = await client.query(`SELECT 1 FROM sku_catalog WHERE id = $1 AND organization_id = $2`, [
        childId,
        orgId,
      ]);
      if (!child.rowCount) throw new PrepackPairingError('Child SKU not found', 404);
    }

    const part = await createKitPart(
      {
        skuCatalogId,
        componentName: input.componentName,
        componentType: input.componentType,
        qtyRequired: input.qtyRequired,
      },
      orgId,
      client,
    );
    await recordAudit(client, null, null, {
      source: AUDIT_SOURCE,
      action: AUDIT_ACTION.KIT_PART_CREATE,
      entityType: AUDIT_ENTITY.KIT_PART_TEMPLATE,
      entityId: part.id,
      before: null,
      after: { ...part },
      extra: { sku_catalog_id: skuCatalogId },
      actorStaffIdOverride: actorStaffId,
      organizationIdOverride: orgId,
    });

    if (childId != null) {
      const { relationship, created } = await ensureRelationshipInTx(client, orgId, {
        parentSkuId: skuCatalogId,
        childSkuId: childId,
        notes: input.componentName,
      });
      if (created) {
        await recordAudit(client, null, null, {
          source: AUDIT_SOURCE,
          action: AUDIT_ACTION.SKU_RELATIONSHIP_CREATE,
          entityType: AUDIT_ENTITY.SKU_RELATIONSHIP,
          entityId: relationship.id,
          before: null,
          after: { ...relationship },
          actorStaffIdOverride: actorStaffId,
          organizationIdOverride: orgId,
        });
      }
    }
  });

  // Bust the cached get-title-by-sku bundle (tagged sku-kit-parts), as the kit-parts editor does.
  await invalidateCacheTags(orgId, [CACHE_TAGS.skuKitParts]);
  return freshKit(orgId, skuCatalogId);
}

/** Pin `manualId` to this catalog SKU inside `client`'s transaction; the SKU's own catalog row, or refused. */
async function linkInTx(
  client: PoolClient,
  orgId: OrgId,
  skuCatalogId: number,
  manualId: number,
  actorStaffId: number | null,
  action: string,
) {
  const sku = await lockCatalogSku(client, orgId, skuCatalogId);
  const link = await linkManualToSkuInTx(client, orgId, manualId, sku);
  // linkManualToSkuInTx pins the first catalog row wearing this SKU key; a
  // duplicate spelling on another row would pin that row instead — refuse.
  if (link.skuCatalogId !== skuCatalogId) {
    throw new PrepackPairingError(`SKU ${sku} also names catalog row ${link.skuCatalogId}; pair the manual there`, 409);
  }
  await recordAudit(client, null, null, {
    source: AUDIT_SOURCE,
    action,
    entityType: AUDIT_ENTITY.SKU,
    entityId: skuCatalogId,
    before: { manualId, pairing: link.before },
    after: { manualId, pairing: { ...link.before, sku: link.sku, skuCatalogId: link.skuCatalogId } },
    actorStaffIdOverride: actorStaffId,
    organizationIdOverride: orgId,
  });
  return link;
}

/**
 * Pair an existing org manual to this product at SKU level
 * (`product_manuals.sku` + `sku_catalog_id` — the row pack print resolves for
 * every order of this SKU). Answers the fresh kit.
 */
export async function linkPrepackManual(
  orgId: OrgId,
  skuCatalogId: number,
  manualId: number,
  actorStaffId: number | null,
): Promise<PrepackKit> {
  await withTenantTransaction(orgId, (client) =>
    linkInTx(client, orgId, skuCatalogId, manualId, actorStaffId, AUDIT_ACTION.ORDER_MANUAL_PAIR),
  );
  await settleManualRepair(orgId);
  return freshKit(orgId, skuCatalogId);
}

/**
 * Upload a new manual through the library upload (`uploadProductManual`) and
 * pair it to this product at SKU level. Answers the fresh kit.
 */
export async function uploadPrepackManual(
  orgId: OrgId,
  skuCatalogId: number,
  file: File,
  actorStaffId: number | null,
): Promise<PrepackKit> {
  // Refuse an unknown product before storing any bytes.
  await freshKit(orgId, skuCatalogId);
  const { manual } = await uploadProductManual(orgId, { file, status: 'unassigned' });
  await withTenantTransaction(orgId, (client) =>
    linkInTx(client, orgId, skuCatalogId, Number(manual.id), actorStaffId, AUDIT_ACTION.ORDER_MANUAL_ATTACH),
  );
  await settleManualRepair(orgId);
  return freshKit(orgId, skuCatalogId);
}

/**
 * Unpair (back to the library, unassigned — every key cleared) or delete
 * (soft, `is_active = false`) a manual from this product. Unpair needs the
 * manual linked to THIS product; delete refuses one linked to another SKU.
 * Answers the fresh kit.
 */
export async function removePrepackManual(
  orgId: OrgId,
  skuCatalogId: number,
  input: PrepackManualRemoveInput,
  actorStaffId: number | null,
): Promise<PrepackKit> {
  const { manualId, mode } = input;
  await withTenantTransaction(orgId, async (client) => {
    const sku = await lockCatalogSku(client, orgId, skuCatalogId);
    const res = await client.query<{
      order_id: number | null;
      item_number: string | null;
      sku: string | null;
      sku_catalog_id: number | null;
      catalog_sku: string | null;
    }>(
      `SELECT pm.order_id, pm.item_number, pm.sku, pm.sku_catalog_id, sc.sku AS catalog_sku
         FROM product_manuals pm
         LEFT JOIN sku_catalog sc ON sc.id = pm.sku_catalog_id AND sc.organization_id = pm.organization_id
        WHERE pm.id = $1 AND pm.organization_id = $2 AND pm.is_active = TRUE
        FOR UPDATE OF pm`,
      [manualId, orgId],
    );
    const row = res.rows[0];
    if (!row) throw new PrepackPairingError(`Manual ${manualId} not found`, 404);
    const pairing = {
      orderId: row.order_id != null ? Number(row.order_id) : null,
      itemNumber: row.item_number?.trim() || null,
      sku: row.sku?.trim() || row.catalog_sku?.trim() || null,
      skuCatalogId: row.sku_catalog_id != null ? Number(row.sku_catalog_id) : null,
    };
    // Linked here: pinned to this catalog row, or (no row pinned) to this SKU key — as the kit resolves it.
    const linkedHere =
      pairing.skuCatalogId === skuCatalogId ||
      (pairing.skuCatalogId == null && pairing.sku != null && paperworkSkuKey(pairing.sku) === paperworkSkuKey(sku));
    const linkedElsewhere = !linkedHere && (pairing.skuCatalogId != null || pairing.sku != null);
    if (linkedElsewhere) {
      throw new PrepackPairingError(
        `Manual ${manualId} is linked to SKU ${pairing.sku ?? `catalog row ${pairing.skuCatalogId}`}; ${mode} it there`,
        409,
      );
    }
    if (mode === 'unpair') {
      if (!linkedHere) throw new PrepackPairingError(`Manual ${manualId} is not linked to SKU ${sku}`, 409);
      await restoreManualPairingInTx(client, orgId, manualId, {
        orderId: null,
        itemNumber: null,
        sku: null,
        skuCatalogId: null,
      });
    }
    await recordAudit(client, null, null, {
      source: AUDIT_SOURCE,
      action: mode === 'unpair' ? AUDIT_ACTION.ORDER_MANUAL_UNPAIR : AUDIT_ACTION.ORDER_MANUAL_DELETE,
      entityType: AUDIT_ENTITY.SKU,
      entityId: skuCatalogId,
      before: { manualId, pairing },
      after:
        mode === 'unpair'
          ? { manualId, pairing: { orderId: null, itemNumber: null, sku: null, skuCatalogId: null } }
          : { manualId, pairing, isActive: false },
      actorStaffIdOverride: actorStaffId,
      organizationIdOverride: orgId,
    });
    return pairing;
  });
  // The library delete path (`DELETE /api/product-manuals?id=`).
  if (mode === 'delete') await deactivateProductManual(manualId, orgId);
  await settleManualRepair(orgId);
  return freshKit(orgId, skuCatalogId);
}
