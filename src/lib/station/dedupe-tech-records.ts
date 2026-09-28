import { normalizeTrackingKey } from '@/lib/tracking-format';
import type { DeskPickRecord } from '@/hooks/useDeskPickLogs';

function normalizeProductTitle(value: string | null | undefined): string {
  return String(value || '').trim();
}

export function hasUsableProductTitle(value: string | null | undefined): boolean {
  const normalized = normalizeProductTitle(value);
  return Boolean(normalized) && !/^unknown product$/i.test(normalized);
}

function hasSerialValue(value: string | null | undefined): boolean {
  return Boolean(String(value || '').trim());
}

export function isFbaDeskPickRecord(record: DeskPickRecord): boolean {
  return (
    record.source_kind === 'fba_scan' ||
    record.account_source === 'fba' ||
    Boolean(String(record.fnsku || '').trim()) ||
    String(record.order_id || '').toUpperCase() === 'FBA'
  );
}

function pickBestValue(primary: string | null | undefined, fallback: string | null | undefined): string | null {
  const a = String(primary || '').trim();
  const b = String(fallback || '').trim();
  if (a && !/^n\/a$/i.test(a)) return a;
  if (b && !/^n\/a$/i.test(b)) return b;
  return a || b || null;
}

function mergeSerialNumbers(a: string | null | undefined, b: string | null | undefined): string {
  const combined = [
    ...String(a || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
    ...String(b || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
  ];
  return Array.from(new Set(combined)).join(', ');
}

/** Stable dedup key shared by History table + shipping sidebar rail. */
export function getDeskPickRecordRowKey(record: DeskPickRecord): string {
  return `${record.source_kind || 'tech'}:${record.source_row_id ?? record.id}`;
}

/**
 * Newest-first deduped tech-log feed — tracking-key merge matches
 * {@link useDeskPickTableController}'s History table contract.
 */
export function dedupeDeskPickRecords(records: DeskPickRecord[]): DeskPickRecord[] {
  const sorted = [...records].sort((a, b) => {
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();
    return timeB - timeA;
  });

  const trackingIndexByKey = new Map<string, number>();
  const unique: DeskPickRecord[] = [];
  for (const record of sorted) {
    if (isFbaDeskPickRecord(record)) {
      unique.push(record);
      continue;
    }

    const trackingKey = normalizeTrackingKey(record.shipping_tracking_number);
    if (!trackingKey) {
      unique.push(record);
      continue;
    }

    const existingIndex = trackingIndexByKey.get(trackingKey);
    if (existingIndex === undefined) {
      trackingIndexByKey.set(trackingKey, unique.length);
      unique.push(record);
      continue;
    }

    const existing = unique[existingIndex];
    if (!existing) continue;
    const existingHasSerial = hasSerialValue(existing.serial_number);
    const candidateHasSerial = hasSerialValue(record.serial_number);

    const shouldPreferCandidate =
      (candidateHasSerial && !existingHasSerial)
      || (
        candidateHasSerial
        && existingHasSerial
        && existing.source_kind !== 'tech_serial'
        && record.source_kind === 'tech_serial'
      );

    const mergedProductTitle = hasUsableProductTitle(record.product_title)
      ? normalizeProductTitle(record.product_title)
      : hasUsableProductTitle(existing.product_title)
        ? normalizeProductTitle(existing.product_title)
        : record.product_title;

    const mergedCondition = shouldPreferCandidate
      ? pickBestValue(record.condition, existing.condition)
      : pickBestValue(existing.condition, record.condition);
    const mergedSku = shouldPreferCandidate
      ? pickBestValue(record.sku, existing.sku)
      : pickBestValue(existing.sku, record.sku);
    const mergedSerial = mergeSerialNumbers(existing.serial_number, record.serial_number);

    if (shouldPreferCandidate) {
      unique[existingIndex] = {
        ...record,
        product_title: mergedProductTitle,
        condition: mergedCondition,
        sku: mergedSku,
        serial_number: mergedSerial,
      };
      continue;
    }

    const titleImproved = !hasUsableProductTitle(existing.product_title) && hasUsableProductTitle(record.product_title);
    const conditionImproved = mergedCondition !== existing.condition;
    const skuImproved = mergedSku !== existing.sku;
    const serialImproved = mergedSerial !== (existing.serial_number || '');
    if (titleImproved || conditionImproved || skuImproved || serialImproved) {
      unique[existingIndex] = {
        ...existing,
        product_title: mergedProductTitle,
        condition: mergedCondition,
        sku: mergedSku,
        serial_number: mergedSerial,
      };
    }
  }
  return unique;
}
