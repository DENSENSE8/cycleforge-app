import type { LocationRecord } from '@/components/mobile/scan/location-bind-types';

/** Where a verified location scan lands. */
export type LocationScanLanding = { kind: 'adjust'; sku: string } | { kind: 'select' } | { kind: 'record' };

/**
 * The record's own rows decide: one loose SKU and nothing else opens its ±1
 * adjust; several rows — or loose stock beside a tote — ask which item first,
 * so a tote is never skipped silently; nothing loose is the hub (pair / add).
 * `contents` is the record's list as painted: qty > 0 or an on-hold placeholder.
 */
export function locationScanLanding(record: Pick<LocationRecord, 'contents' | 'handlingUnits'>): LocationScanLanding {
  const [only, ...rest] = record.contents;
  if (!only) return { kind: 'record' };
  if (rest.length === 0 && record.handlingUnits.length === 0) return { kind: 'adjust', sku: only.sku };
  return { kind: 'select' };
}

const SKU_PARAM = 'sku';
const STAGE_PARAM = 'stage';
const PICK_PARAM = 'pick';

/** The landing written onto the hub href; `record` leaves it unchanged. */
export function withLocationScanLanding(href: string, landing: LocationScanLanding): string {
  if (landing.kind === 'record') return href;
  const url = new URL(href, 'https://cycleforge.local');
  if (landing.kind === 'adjust') {
    url.searchParams.set(SKU_PARAM, landing.sku);
    url.searchParams.set(STAGE_PARAM, 'adjust');
  } else {
    url.searchParams.set(PICK_PARAM, '1');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** What the hub reads back: the SKU to open (and whether on adjust), and whether rows are a picker. */
export function readLocationScanLanding(params: { get(name: string): string | null }): {
  sku: string | null;
  adjust: boolean;
  pick: boolean;
} {
  const sku = params.get(SKU_PARAM)?.trim() || null;
  return { sku, adjust: sku != null && params.get(STAGE_PARAM) === 'adjust', pick: params.get(PICK_PARAM) === '1' };
}

/** The href with the one-shot `sku` / `stage` removed, so a refresh or Back does not reopen the sheet. */
export function withoutLocationScanOpen(href: string): string {
  const url = new URL(href, 'https://cycleforge.local');
  url.searchParams.delete(SKU_PARAM);
  url.searchParams.delete(STAGE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
