/**
 * The phone pack station's scan (`/m/pack`, owner 2026-09-29): one read that
 * says what a packer's scan IS, so the phone can answer with the right thing.
 *
 *   - a TOTE (house `H-…` plate or external tote code) → its staged order,
 *     straight to the pack job (the existing tote rule, {@link toteScanRefusal});
 *   - a LOCATION that is a SKU's paired bin → the SKUs paired there
 *     (`sku_stock.location` — the Pair-bin write — plus `bin_contents`);
 *   - a unit SERIAL (or the order's carrier tracking) → the order that
 *     carries it, via {@link resolveOrderLinkage} (allocation, then
 *     `tech_serial_numbers.order_id`), and the tote it rides in.
 *
 * Read-only: resolving a scan never changes the tote, the bin or the order.
 */

import { routeScan, unwrapScannedLocation, unwrapScannedSerial } from '@/lib/barcode-routing';
import { resolveOrderLinkage } from '@/lib/order-linkage';
import { resolveToteScan, toteScanRefusal } from '@/lib/picking/tote-scan';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';

/** One SKU paired to a scanned bin. */
export interface PackScanBinSku {
  sku: string;
  title: string | null;
  /** The SKU's home bin is this location (`sku_stock.location`). */
  home: boolean;
  /** Counted here (`bin_contents.qty`); null when never counted into this bin. */
  binQty: number | null;
  /** The SKU's on-hand (`sku_stock.stock`); null without a stock row. */
  onHand: number | null;
}

export type PackScanResult =
  | { kind: 'tote'; toteCode: string; orderId: number; packHref: string }
  | { kind: 'refused'; error: string }
  | {
      kind: 'order';
      /** `orders.id` of the line the scan resolved to. */
      orderId: number;
      orderRef: string | null;
      productTitle: string | null;
      sku: string | null;
      matchedBy: 'serial' | 'tracking';
      /** The scanned serial as the linkage stores it; null for a tracking match. */
      serial: string | null;
      /** The tote paired to this order, when one is. */
      toteCode: string | null;
    }
  | { kind: 'bin'; code: string; name: string | null; skus: PackScanBinSku[] };

interface BinSkuRow {
  location_barcode: string;
  location_name: string | null;
  sku: string | null;
  title: string | null;
  home: boolean | null;
  bin_qty: number | null;
  on_hand: number | null;
}

/**
 * The location (by its barcode, or its printed name) and every SKU paired to
 * it: homed there, or counted there. `codes` are the scan's candidate keys.
 */
async function resolveBinScan(orgId: OrgId, codes: readonly string[]): Promise<PackScanResult | null> {
  const res = await tenantQuery<BinSkuRow>(
    orgId,
    `WITH loc AS (
       SELECT id, barcode, name FROM locations
        WHERE organization_id = $1 AND is_active = true
          AND (barcode = ANY($2::text[]) OR name = ANY($2::text[]))
        ORDER BY (barcode = ANY($2::text[])) DESC, id
        LIMIT 1
     ), paired AS (
       SELECT ss.sku FROM sku_stock ss JOIN loc ON ss.location IN (loc.barcode, loc.name)
        WHERE ss.organization_id = $1
       UNION
       SELECT bc.sku FROM bin_contents bc JOIN loc ON bc.location_id = loc.id
        WHERE bc.organization_id = $1
     )
     SELECT loc.barcode AS location_barcode, loc.name AS location_name,
            p.sku,
            COALESCE(NULLIF(ss.display_name_override, ''), NULLIF(ss.product_title, ''), sc.product_title) AS title,
            COALESCE(ss.location IN (loc.barcode, loc.name), false) AS home,
            bc.qty::int AS bin_qty,
            ss.stock::int AS on_hand
       FROM loc
       LEFT JOIN paired p ON true
       LEFT JOIN sku_stock ss ON ss.organization_id = $1 AND ss.sku = p.sku
       LEFT JOIN bin_contents bc ON bc.organization_id = $1 AND bc.location_id = loc.id AND bc.sku = p.sku
       LEFT JOIN LATERAL (
         SELECT NULLIF(btrim(c.product_title), '') AS product_title
           FROM sku_catalog c
          WHERE c.organization_id = $1 AND c.sku = p.sku
          ORDER BY c.is_active DESC, c.id
          LIMIT 1
       ) sc ON true
      ORDER BY home DESC, p.sku`,
    [orgId, codes],
  );
  const first = res.rows[0];
  if (!first) return null;
  return {
    kind: 'bin',
    code: first.location_barcode,
    name: first.location_name,
    skus: res.rows
      .filter((row): row is BinSkuRow & { sku: string } => Boolean(row.sku))
      .map((row) => ({
        sku: row.sku,
        title: row.title,
        home: row.home === true,
        binQty: row.bin_qty,
        onHand: row.on_hand,
      })),
  };
}

async function pairedToteCode(orgId: OrgId, orderId: number): Promise<string | null> {
  const res = await tenantQuery<{ code: string }>(
    orgId,
    `SELECT code FROM handling_units
      WHERE organization_id = $1 AND paired_order_id = $2
      ORDER BY paired_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [orgId, orderId],
  );
  return res.rows[0]?.code ?? null;
}

/** Resolve one pack-station scan; `null` when it names nothing this org knows. */
export async function resolvePackScan(orgId: OrgId, raw: string): Promise<PackScanResult | null> {
  const scan = raw.trim();
  if (!scan) return null;
  const route = routeScan(scan);

  const tote = await resolveToteScan(orgId, scan);
  if (tote) {
    const refusal = toteScanRefusal(tote);
    if (refusal || tote.orderId == null) return { kind: 'refused', error: refusal ?? `tote ${tote.code} is not carrying an order` };
    return { kind: 'tote', toteCode: tote.code, orderId: tote.orderId, packHref: `/m/pack/start/${tote.orderId}` };
  }

  if (route?.type === 'bin' || route?.type === 'bin-paired-order') {
    const code = unwrapScannedLocation(scan);
    const bin = await resolveBinScan(orgId, code === scan ? [scan] : [code, scan]);
    if (bin) return bin;
  }

  // A printed unit label (`U-…` / GS1 `(01)(21)`) carries its serial.
  const serialKey = unwrapScannedSerial(scan).toUpperCase();
  const bySerial = await resolveOrderLinkage(orgId, { serial: serialKey });
  const linkage =
    bySerial.order || route?.type !== 'carrier-tracking'
      ? bySerial
      : await resolveOrderLinkage(orgId, { tracking: route.value });
  if (!linkage.order) return null;
  const matchedBy = linkage.matchedBy === 'tracking' ? 'tracking' : 'serial';
  const serial = matchedBy === 'serial' ? serialKey : null;
  return {
    kind: 'order',
    orderId: linkage.order.id,
    orderRef: linkage.order.orderId,
    productTitle: linkage.order.productTitle,
    sku: linkage.order.sku,
    matchedBy,
    serial,
    toteCode: await pairedToteCode(orgId, linkage.order.id),
  };
}
