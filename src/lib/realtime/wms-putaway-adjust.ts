import pool from '@/lib/db';
import { withIdempotencyClaim } from '@/lib/api-idempotency';
import { assertPermission } from '@/lib/auth/permissions';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { adjustBinQty, getBinContentsByBarcode } from '@/lib/neon/location-queries';
import type { OrgId } from '@/lib/tenancy/constants';

const ROUTE = 'wms.command.putaway.adjust';

export type WmsPutawayAdjustInput = {
  commandId: string;
  organizationId: string;
  staffId: number;
  barcode: string;
  sku: string;
  direction: 'put' | 'take';
  qty: number;
  reason: string;
  reasonCodeId: number | null;
  notes: string | null;
};

type PutawayData = {
  success: true;
  binQty: number;
  totalStock: number;
  ledgerId: number | null;
  binId: number;
};

type Deps = {
  assertPermission(staffId: number, permission: 'bin.adjust'): Promise<void>;
  getBin(barcode: string, orgId: OrgId): ReturnType<typeof getBinContentsByBarcode>;
  adjust: typeof adjustBinQty;
  claim(
    input: WmsPutawayAdjustInput,
    produce: () => Promise<PutawayData>,
  ): Promise<{ data: PutawayData; replayed: boolean }>;
  audit(input: WmsPutawayAdjustInput, data: PutawayData, beforeQty: number): Promise<void>;
};

const defaultDeps: Deps = {
  async assertPermission(staffId, permission) {
    await assertPermission(staffId, permission);
  },
  getBin: getBinContentsByBarcode,
  adjust: adjustBinQty,
  async claim(input, produce) {
    const orgId = input.organizationId as OrgId;
    const result = await withIdempotencyClaim(pool, {
      orgId,
      idempotencyKey: `wms:${input.commandId}`,
      route: ROUTE,
      staffId: input.staffId,
    }, async () => ({ status: 200, body: await produce() }));
    if (result.inProgress) throw new Error('This putaway command is already in progress.');
    if (result.status !== 200 || result.body.success !== true) {
      const error = (result.body as unknown as { error?: unknown }).error;
      throw new Error(String(error || 'Putaway adjustment failed.'));
    }
    return { data: result.body as PutawayData, replayed: result.cached };
  },
  async audit(input, data, beforeQty) {
    await recordAudit(pool, null, null, {
      source: 'wms-socket',
      action: AUDIT_ACTION.SKU_STOCK_ADJUST,
      entityType: AUDIT_ENTITY.BIN,
      entityId: data.binId,
      before: { qty: beforeQty },
      after: { qty: data.binQty },
      binCode: input.barcode,
      scanRef: input.barcode,
      method: 'scan',
      reasonCode: input.reason,
      note: input.notes,
      actorStaffIdOverride: input.staffId,
      organizationIdOverride: input.organizationId,
      extra: {
        sku: input.sku,
        delta: input.direction === 'put' ? input.qty : -input.qty,
        total_stock: data.totalStock,
        ledger_id: data.ledgerId,
        command_id: input.commandId,
      },
    });
  },
};

export async function executeWmsPutawayAdjust(
  input: WmsPutawayAdjustInput,
  deps: Deps = defaultDeps,
): Promise<{ data: PutawayData; replayed: boolean }> {
  await deps.assertPermission(input.staffId, 'bin.adjust');
  return deps.claim(input, async () => {
    const orgId = input.organizationId as OrgId;
    const bin = await deps.getBin(input.barcode.trim(), orgId);
    if (!bin) throw new Error(`Location ${input.barcode} not found.`);

    const sku = input.sku.trim();
    const skuOnHand = bin.contents
      .filter((row) => row.sku === sku)
      .reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const totalOnHand = bin.contents.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const capacity = Number(bin.location.capacity || 0);

    if (input.direction === 'take' && skuOnHand < input.qty) {
      throw new Error(`Location has ${skuOnHand}; cannot take ${input.qty}.`);
    }
    if (input.direction === 'put' && capacity > 0 && totalOnHand + input.qty > capacity) {
      throw new Error(`Slot Full: ${input.barcode} capacity is ${capacity}.`);
    }

    const result = await deps.adjust({
      locationId: bin.location.id,
      sku,
      delta: input.direction === 'put' ? input.qty : -input.qty,
      staffId: input.staffId,
      reason: input.reason,
      reasonCodeId: input.reasonCodeId,
      notes: input.notes,
      source: 'wms.command.putaway.adjust',
    }, orgId);
    const data: PutawayData = {
      success: true,
      binQty: Number(result.binContent.qty),
      totalStock: result.newStockQty,
      ledgerId: result.ledgerId,
      binId: bin.location.id,
    };
    await deps.audit(input, data, skuOnHand);
    return data;
  });
}
