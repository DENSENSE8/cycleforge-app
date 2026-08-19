/**
 * Desk PATCH for Incoming identity fields (tracking · listing · order display)
 * on non-Zoho-locked marketplace / manual rows.
 */

import { withTenantTransaction, tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getInboundMirror, upsertInboundMirror } from './mirror';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { linkShipment } from '@/lib/shipping/shipment-links';
import { ensureReceivingForInboundOrder } from '@/lib/receiving/attach-box';
import { INBOUND_SOURCE_FACT_KIND, assertRegisteredInboundSource } from './source-registry';
import { readLineFact, writeLineFact } from '@/lib/receiving/facts/store';

interface UpdateInboundIdentityInput {
  receivingLineId: number;
  trackingNumber?: string | null;
  listingUrl?: string | null;
  orderNumber?: string | null;
}

interface UpdateInboundIdentityResult {
  receivingLineId: number;
  sourceType: string;
  sourceOrderId: string;
  zohoLocked: boolean;
}

export async function updateInboundIdentity(
  orgId: OrgId,
  input: UpdateInboundIdentityInput,
): Promise<UpdateInboundIdentityResult> {
  const receivingLineId = Number(input.receivingLineId);
  if (!Number.isFinite(receivingLineId) || receivingLineId <= 0) {
    throw new Error('inbound: receiving_line_id is required');
  }

  return withTenantTransaction(orgId, async (client) => {
    const lineRes = await client.query<{
      inbound_source_type: string | null;
      source_order_id: string | null;
      receiving_id: number | null;
      platform_account_id: number | null;
      zoho_purchaseorder_id: string | null;
    }>(
      `SELECT rl.inbound_source_type, rl.source_order_id, rl.receiving_id, rl.platform_account_id,
              rz.zoho_purchaseorder_id
         FROM receiving_line rl
         LEFT JOIN receiving_line_zoho rz
           ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
        WHERE rl.id = $1 AND rl.organization_id = $2::uuid
        LIMIT 1`,
      [receivingLineId, orgId],
    );
    const line = lineRes.rows[0];
    if (!line) throw new Error('inbound: receiving line not found');

    const sourceType = (line.inbound_source_type || '').trim().toLowerCase();
    const sourceOrderId = (line.source_order_id || '').trim();
    if (!sourceType || !sourceOrderId) {
      throw new Error('inbound: line has no marketplace identity to update');
    }
    assertRegisteredInboundSource(sourceType);

    const zohoLocked = Boolean(line.zoho_purchaseorder_id?.trim()) && sourceType === 'zoho';
    if (zohoLocked) {
      throw new Error('inbound: Zoho-primary rows are updated via Zoho sync, not desk edit');
    }
    if (sourceType === 'zoho') {
      throw new Error('inbound: Zoho-primary identity is read-only on the desk');
    }

    const tracking =
      input.trackingNumber === undefined
        ? undefined
        : input.trackingNumber?.trim() || null;
    const listingUrl =
      input.listingUrl === undefined ? undefined : input.listingUrl?.trim() || null;
    const orderNumber =
      input.orderNumber === undefined ? undefined : input.orderNumber?.trim() || null;

    if (tracking !== undefined || orderNumber !== undefined) {
      const txQuery = {
        query: (async (_o: OrgId, sql: string, params?: ReadonlyArray<unknown>) =>
          client.query(sql, params ? [...params] : undefined)) as never,
      };
      const existingMirror = await getInboundMirror(orgId, sourceType, sourceOrderId, txQuery);
      await upsertInboundMirror(
        orgId,
        {
          sourceType,
          sourceOrderId,
          platformAccountId: line.platform_account_id ?? existingMirror?.platform_account_id ?? null,
          orderNumber:
            orderNumber !== undefined
              ? orderNumber
              : existingMirror?.order_number ?? null,
          trackingNumber:
            tracking !== undefined
              ? tracking
              : existingMirror?.tracking_number ?? null,
          vendorOrSellerName: existingMirror?.vendor_or_seller_name ?? null,
          status: existingMirror?.status ?? null,
          paymentStatus: existingMirror?.payment_status ?? null,
          carrierCode: existingMirror?.carrier_code ?? null,
        },
        txQuery,
      );
    }

    if (listingUrl !== undefined) {
      const factKind = INBOUND_SOURCE_FACT_KIND[sourceType as 'ebay' | 'amazon' | 'manual' | 'zoho'];
      const deps = {
        query: ((_o: OrgId, sql: string, p?: unknown[]) =>
          client.query(sql, p)) as typeof tenantQuery,
      };
      if (factKind) {
        const existing =
          (await readLineFact<Record<string, unknown>>(
            orgId,
            receivingLineId,
            factKind,
            deps,
          )) ?? {};
        await writeLineFact(
          orgId,
          receivingLineId,
          factKind,
          { ...existing, listingUrl },
          deps,
        );
      } else {
        // amazon / manual — stash listing on the mirror raw_payload merge
        await client.query(
          `UPDATE inbound_purchase_order_mirror
              SET raw_payload = COALESCE(raw_payload, '{}'::jsonb)
                    || jsonb_build_object('listingUrl', to_jsonb($3::text)),
                  updated_at = NOW()
            WHERE organization_id = $1::uuid
              AND source_type = $2
              AND source_order_id = $4`,
          [orgId, sourceType, listingUrl, sourceOrderId],
        );
      }
    }

    if (tracking) {
      const shipmentSource =
        sourceType === 'ebay'
          ? 'ebay_purchase'
          : sourceType === 'amazon'
            ? 'amazon_purchase'
            : 'manual_inbound';
      const shipment = await registerShipmentPermissive(
        { trackingNumber: tracking, sourceSystem: shipmentSource },
        orgId,
      );
      if (shipment?.id && (sourceType === 'ebay' || sourceType === 'amazon' || sourceType === 'manual')) {
        const shipmentId = Number(shipment.id);
        let cartonId = line.receiving_id != null ? Number(line.receiving_id) : null;
        if (cartonId == null) {
          cartonId = await ensureReceivingForInboundOrder({
            sourceType,
            sourceOrderId,
            shipmentId,
            organizationId: orgId,
            db: client as unknown as Parameters<typeof ensureReceivingForInboundOrder>[0]['db'],
          });
          await client.query(
            `UPDATE receiving_line
                SET receiving_id = $2, updated_at = NOW()
              WHERE id = $1 AND organization_id = $3::uuid AND receiving_id IS NULL`,
            [receivingLineId, cartonId, orgId],
          );
        } else {
          await client.query(
            `UPDATE receiving_carton
                SET shipment_id = COALESCE(shipment_id, $2), updated_at = NOW()
              WHERE id = $1 AND organization_id = $3::uuid`,
            [cartonId, shipmentId, orgId],
          );
        }
        await linkShipment(
          orgId,
          {
            ownerType: 'RECEIVING',
            ownerId: cartonId,
            shipmentId,
            direction: 'INBOUND',
            isPrimary: true,
            role: 'PO_ANCHOR',
            source: shipmentSource,
          },
          client as unknown as Parameters<typeof linkShipment>[2],
        );
      }
    }

    return {
      receivingLineId,
      sourceType,
      sourceOrderId,
      zohoLocked: false,
    };
  });
}
