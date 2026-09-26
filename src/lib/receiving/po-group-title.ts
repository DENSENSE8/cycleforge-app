/** PO-group display title — shared by drill / identity chrome (collapsed PO rows in the receiving table) and receiving sidebar rails. */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  formatReturnSerialProductTitle,
  parseReturnSerialTitle,
  resolveReceivingLinePrimarySerial,
} from '@/components/station/receiving-line-serials';
import { formatMarketplaceReturnIdentityTitle } from '@/lib/receiving/marketplace-return-identity';
import { storedOrInferredSourcePlatform } from '@/lib/marketplace-order-id';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';

/** DB / wire sentinel for an unmatched carton line — never paint this raw. */
export const UNFOUND_PO_SENTINEL = 'Unfound PO';
/** Operator face for {@link UNFOUND_PO_SENTINEL}. */
export const UNFOUND_PO_DISPLAY = 'Unfound order';

export interface ReceivingPoIdentityParts {
  poValue: string;
  idPrefix: 'PO' | 'Order';
  platformLabel: string;
  accountLabel: string;
}

/** Stamped by rail fetchers before render — drives adaptive title mode. */
export interface RailTitleContext {
  line_count: number;
  distinct_sku_count: number;
}

/** Identity fields shared by the PO summary title and its PO chip column. */
export function getReceivingPoIdentityParts(
  row: ReceivingLineRow,
  resolvePlatformLabel: (raw: string) => string,
): ReceivingPoIdentityParts {
  const inboundSource = (row.inbound_source_type || '').trim().toLowerCase();
  const isMarketplacePurchase = inboundSource !== '' && inboundSource !== 'zoho';
  // Ecwid repair-service / store pairing writes the order # into
  // zoho_purchaseorder_number with source_platform='ecwid' and no Zoho PO id —
  // that must read as Order, not PO (repair-service identify display contract).
  const storedPlatform = (row.source_platform || inboundSource || '').trim();
  const isEcwidOrderIdentity =
    storedPlatform.toLowerCase() === 'ecwid' && !(row.zoho_purchaseorder_id || '').trim();
  // An id an operator linked by hand (link-carton-identifier.ts) is the only identity a still-unfound carton has:
  const hasZohoIdentity = Boolean(
    (row.zoho_purchaseorder_number || '').trim() || (row.zoho_purchaseorder_id || '').trim(),
  );
  const isOrderIdentity = !hasZohoIdentity && Boolean((row.source_order_id || '').trim());
  const poValue = (
    row.zoho_purchaseorder_number ||
    row.zoho_purchaseorder_id ||
    (isMarketplacePurchase || isEcwidOrderIdentity || isOrderIdentity ? row.source_order_id : '') ||
    ''
  ).trim();
  const platformRaw = storedOrInferredSourcePlatform(
    storedPlatform,
    poValue,
    row.zoho_purchaseorder_number,
    row.zoho_purchaseorder_id,
    row.source_order_id,
  );
  const idPrefix: 'PO' | 'Order' =
    !row.zoho_purchaseorder_id && (isMarketplacePurchase || isEcwidOrderIdentity || isOrderIdentity)
      ? 'Order'
      : 'PO';
  const platformLabel = platformRaw ? resolvePlatformLabel(platformRaw) : '';
  const accountLabel = (row.platform_account_label || '').trim();
  return { poValue, idPrefix, platformLabel, accountLabel };
}

function marketplaceReturnTitleFromRow(row: ReceivingLineRow, poValue: string): string | null {
  return formatMarketplaceReturnIdentityTitle({
    orderId: poValue,
    sourcePlatform: storedOrInferredSourcePlatform(
      row.source_platform || row.inbound_source_type,
      poValue,
      row.source_order_id,
    ),
    receivingType: row.receiving_type,
    cartonIntakeType: row.carton_intake_type,
    intakeType: row.intake_type,
  });
}

/** Collapsed-PO / carton-level title — drill / identity chrome. */
export function getReceivingPoGroupTitle(
  row: ReceivingLineRow,
  resolvePlatformLabel: (raw: string) => string,
): string {
  const { poValue, idPrefix, platformLabel, accountLabel } = getReceivingPoIdentityParts(
    row,
    resolvePlatformLabel,
  );
  const returnTitle = poValue ? marketplaceReturnTitleFromRow(row, poValue) : null;
  if (returnTitle) return returnTitle;
  return (
    [platformLabel, accountLabel, poValue ? `${idPrefix} ${poValue}` : '']
      .filter(Boolean)
      .join(' · ') || (row.item_name ?? 'Grouped lines')
  );
}

/** True when the row should read as a matched PO/order identity, not a product line. */
export function isReceivingPoGroupTitleRow(row: ReceivingLineRow): boolean {
  if (row.receiving_source === 'unmatched') return false;
  if ((row.item_name || '').trim() === UNFOUND_PO_SENTINEL) return false;
  const { poValue } = getReceivingPoIdentityParts(row, () => '');
  return poValue.length > 0;
}

/** Minimal fields used by {@link receivingPoGroupKey} / {@link filterLinesByPoGroup}. */
export type PoGroupKeySource = {
  id: number;
  zoho_purchaseorder_number?: string | null;
  zoho_purchaseorder_id?: string | null;
  inbound_source_type?: string | null;
  source_order_id?: string | null;
};

/** PO grouping key — mirrors {@link useReceivingGrouping}. */
export function receivingPoGroupKey(row: PoGroupKeySource): string {
  const po = (
    row.zoho_purchaseorder_number ||
    row.zoho_purchaseorder_id ||
    ''
  ).trim();
  if (po) return `po:${po}`;
  const src = (row.inbound_source_type || '').trim().toLowerCase();
  const orderId = (row.source_order_id || '').trim();
  if (src && orderId) return `src:${src}:${orderId}`;
  return `line:${row.id}`;
}

/** Keep lines that share the anchor's PO group key. */
export function filterLinesByPoGroup<T extends PoGroupKeySource>(
  lines: ReadonlyArray<T>,
  anchor: PoGroupKeySource,
): T[] {
  const key = receivingPoGroupKey(anchor);
  return lines.filter((l) => receivingPoGroupKey(l) === key);
}

/** Distinct product identity for adaptive title (SKU preferred, else item name). */
function lineProductKey(row: ReceivingLineRow): string {
  const sku = (row.sku || '').trim().toLowerCase();
  if (sku) return `sku:${sku}`;
  const item = (row.item_name || row.zoho_item_id || '').trim().toLowerCase();
  if (item) return `item:${item}`;
  return `line:${row.id}`;
}

/** Count lines + distinct product keys in a group. */
export function countLinesAndSkus(rows: ReadonlyArray<ReceivingLineRow>): RailTitleContext {
  const keys = new Set(rows.map(lineProductKey));
  return {
    line_count: rows.length,
    distinct_sku_count: keys.size,
  };
}

/** Stamp PO-level title context on every row (door-scan feeds). */
export function stampPoRailTitleContext(rows: ReceivingLineRow[]): ReceivingLineRow[] {
  const byPo = new Map<string, ReceivingLineRow[]>();
  for (const r of rows) {
    const key = receivingPoGroupKey(r);
    const list = byPo.get(key) ?? [];
    list.push(r);
    byPo.set(key, list);
  }
  return rows.map((r) => ({
    ...r,
    rail_title_context: countLinesAndSkus(byPo.get(receivingPoGroupKey(r)) ?? [r]),
  }));
}

/** Stamp carton-level title context on deduped representative rows (unbox Recent). */
export function stampCartonRailTitleContext(
  allRows: ReadonlyArray<ReceivingLineRow>,
  representatives: ReceivingLineRow[],
): ReceivingLineRow[] {
  const byCarton = new Map<number, ReceivingLineRow[]>();
  for (const r of allRows) {
    const rid = r.receiving_id;
    if (rid == null || !Number.isFinite(Number(rid))) continue;
    const list = byCarton.get(rid) ?? [];
    list.push(r);
    byCarton.set(rid, list);
  }
  return representatives.map((r) => {
    const rid = r.receiving_id;
    if (rid == null) return r;
    const group = byCarton.get(rid) ?? [r];
    return { ...r, rail_title_context: countLinesAndSkus(group) };
  });
}

/** Operator-recognition product title — aligned with mobile `unitTitle`. */
export function receivingProductTitle(row: ReceivingLineRow): string {
  // The law treats the `'Unfound PO'` stub as absent so a real later field
  // wins; when nothing real exists the stub is still the operator's face, so
  // it is restored here rather than falling through to `Line #N`.
  const identity = resolveSkuIdentityTitle(row);
  if (!identity && row.item_name === UNFOUND_PO_SENTINEL) return UNFOUND_PO_DISPLAY;
  const raw = identity || `Line #${row.id}`;
  if (raw === UNFOUND_PO_SENTINEL) return UNFOUND_PO_DISPLAY;
  const rawStr = String(raw);
  // Generated return-intake titles: paint from live serial units when present
  // so a rescan/edit never leaves a stale serial in the title face.
  if (parseReturnSerialTitle(rawStr) != null) {
    return formatReturnSerialProductTitle(
      rawStr,
      resolveReceivingLinePrimarySerial(row),
    );
  }
  return rawStr;
}

/** Workspace accordion / line-picker title — same product SoT as the rail, but never paints bare `Line #N` when the carton already has a… */
export function receivingWorkspaceLineTitle(
  row: ReceivingLineRow,
  resolvePlatformLabel: (raw: string) => string = (raw) => raw,
): string {
  // Same fields the ladder reads, in the ladder's order — see
  // {@link SKU_IDENTITY_TITLE_ORDER}. Order is irrelevant to a presence check,
  // but a second spelling of the ladder is how ladders drift apart.
  const hasProductField = Boolean(resolveSkuIdentityTitle(row));
  if (hasProductField) return receivingProductTitle(row);
  if (isReceivingPoGroupTitleRow(row)) {
    return getReceivingPoGroupTitle(row, resolvePlatformLabel);
  }
  return receivingProductTitle(row);
}

/** True when adaptive mode should show PO summary instead of product title. */
export function shouldUsePoGroupRailTitle(row: ReceivingLineRow): boolean {
  const ctx = row.rail_title_context;
  if (!ctx) return false;
  return (
    ctx.line_count > 1 &&
    ctx.distinct_sku_count > 1 &&
    isReceivingPoGroupTitleRow(row)
  );
}

export type ReceivingRailRowTitleMode = 'line' | 'po-group' | 'adaptive-po';

/** Adaptive rail title — product name for single-SKU; PO summary for multi distinct SKU. */
export function receivingAdaptiveRailTitle(
  row: ReceivingLineRow,
  resolvePlatformLabel: (raw: string) => string,
): string {
  if (!isReceivingPoGroupTitleRow(row)) {
    return receivingProductTitle(row);
  }
  const { poValue } = getReceivingPoIdentityParts(row, resolvePlatformLabel);
  const returnTitle = poValue ? marketplaceReturnTitleFromRow(row, poValue) : null;
  if (returnTitle) return returnTitle;
  if (shouldUsePoGroupRailTitle(row)) {
    return getReceivingPoGroupTitle(row, resolvePlatformLabel);
  }
  return receivingProductTitle(row);
}

/** Rail row label — line-level, always PO-group, or adaptive. */
export function receivingRailRowTitle(
  row: ReceivingLineRow,
  rowTitleMode: ReceivingRailRowTitleMode,
  resolvePlatformLabel: (raw: string) => string,
): string {
  if (rowTitleMode === 'adaptive-po') {
    return receivingAdaptiveRailTitle(row, resolvePlatformLabel);
  }
  if (rowTitleMode === 'po-group' && isReceivingPoGroupTitleRow(row)) {
    return getReceivingPoGroupTitle(row, resolvePlatformLabel);
  }
  if (rowTitleMode === 'line') {
    return receivingProductTitle(row);
  }
  // Unmatched / thin rows fall through here — still paint the operator face,
  // never the raw DB sentinel.
  return receivingProductTitle(row);
}
