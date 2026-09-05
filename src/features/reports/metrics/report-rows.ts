import type { BinsOverviewRow } from '@/hooks/useBinsOverview';

export interface SkuVelocityRow {
  sku: string;
  product_title: string | null;
  velocity_tier: string;
  out_qty: number;
  in_qty: number;
  current_stock: number;
}

export interface DeadStockRow {
  sku: string;
  product_title: string | null;
  stock: number;
  days_dormant: number;
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Map `/api/reports/bin-utilization` onto the warehouse-bins sheet row. */
export function utilizationToBinRow(raw: Record<string, unknown>): BinsOverviewRow {
  const id = num(raw.bin_id);
  const inBin = num(raw.in_bin);
  const capRaw = raw.capacity == null ? null : Number(raw.capacity);
  const cap = capRaw != null && Number.isFinite(capRaw) ? capRaw : null;
  const fillRaw = raw.fill_ratio == null ? null : Number(raw.fill_ratio);
  const fillPct = fillRaw != null && Number.isFinite(fillRaw) ? fillRaw * 100 : null;
  const barcode = str(raw.barcode) || null;
  return {
    id,
    barcode,
    name: str(raw.bin_name) || barcode || '',
    room: str(raw.room) || null,
    row_label: str(raw.row_label) || null,
    col_label: str(raw.col_label) || null,
    capacity: cap,
    bin_type: null,
    zone_letter: null,
    total_qty: inBin,
    sku_count: num(raw.sku_count),
    fill_pct: fillPct,
    last_counted: null,
    is_empty: inBin === 0,
    is_stale: false,
    has_low_stock: false,
    is_over_capacity: cap != null && inBin > cap,
  };
}

export function parseSkuVelocityRow(raw: Record<string, unknown>): SkuVelocityRow {
  return {
    sku: str(raw.sku),
    product_title: str(raw.product_title) || null,
    velocity_tier: str(raw.velocity_tier) || '—',
    out_qty: num(raw.out_qty),
    in_qty: num(raw.in_qty),
    current_stock: num(raw.current_stock),
  };
}

export function parseDeadStockRow(raw: Record<string, unknown>): DeadStockRow {
  return {
    sku: str(raw.sku),
    product_title: str(raw.product_title) || null,
    stock: num(raw.stock),
    days_dormant: num(raw.days_dormant),
  };
}
