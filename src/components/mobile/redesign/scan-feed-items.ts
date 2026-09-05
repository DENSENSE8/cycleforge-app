/**
 * Pure `ReceivingLineRow` → {@link ScanFeedItem} mappers for the /m/scan
 * feeds. No React, no 'use client' — extracted from `ScanModeFeeds.tsx`
 * (2026-09-02) so the server paint seed (`seedMobileScanPrioritize`) and the
 * client queryFn map rows through ONE implementation and cannot drift. The
 * Prioritize feed's key + mapper live here for the same reason: the seed must
 * write the exact cache entry the panel mounts with.
 */

import type { ScanFeedItem } from '@/components/mobile/feed/rows/ScanResultRow';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
// Type-only on purpose: this module is imported by the server-only paint seed,
// and a VALUE import from the client component would poison that graph.
import type { TestingVerdict } from '@/components/receiving/workspace/TestingStatusPills';

/** The Prioritize feed's react-query key — shared by panel and paint seed. */
export const SCAN_PRIORITIZE_QUERY_KEY = [
  'receiving-lines-table',
  'rail',
  'scanned',
  'triage',
  'priority',
  '',
] as const;

export function receivingStatusLabel(row: ReceivingLineRow): string {
  const ws = String(row.workflow_status ?? '').toUpperCase();
  if (ws === 'ARRIVED') return 'Scanned';
  if (ws === 'RECEIVED') return 'Received';
  if (ws === 'EXPECTED') return 'Expected';
  if (!ws) return 'Scanned';
  return ws.charAt(0) + ws.slice(1).toLowerCase();
}

export function receivingState(row: ReceivingLineRow): ScanFeedItem['state'] {
  if (row.receiving_source === 'unmatched') return 'warn';
  const full =
    row.quantity_expected != null &&
    row.quantity_expected > 0 &&
    row.quantity_received >= row.quantity_expected;
  return full ? 'ok' : 'warn';
}

export function testingStatusLabel(row: ReceivingLineRow): string {
  const ws = String(row.workflow_status ?? '').toUpperCase();
  if (ws.startsWith('PASS') || ws === 'DONE') return 'Pass';
  if (ws.startsWith('FAIL') || ws.startsWith('SCRAP') || ws.startsWith('RTV')) return 'Failed';
  if (ws.startsWith('TEST')) return 'Testing';
  return ws ? ws.charAt(0) + ws.slice(1).toLowerCase() : 'Tested';
}

export function testingState(row: ReceivingLineRow): ScanFeedItem['state'] {
  const ws = String(row.workflow_status ?? '').toUpperCase();
  if (ws.startsWith('FAIL') || ws.startsWith('SCRAP') || ws.startsWith('RTV')) return 'error';
  if (ws.startsWith('TEST')) return 'warn';
  return 'ok';
}

/** Line-level verdict from workflow_status — fallback for per-serial badges when
 *  the serial's own status doesn't carry a verdict. */
export function lineVerdict(row: ReceivingLineRow): TestingVerdict | null {
  const v = String(row.workflow_status || '').trim().toUpperCase();
  if (v.startsWith('PASS') || v === 'DONE') return 'PASS';
  if (v.startsWith('FAIL') || v.startsWith('SCRAP') || v.startsWith('RTV') || v.startsWith('HOLD')) return 'TESTING_FAILED';
  if (v.startsWith('TEST') || v === 'IN_TEST') return 'TEST_AGAIN';
  return null;
}

export function lineToScanItem(
  row: ReceivingLineRow,
  opts: { statusLabel: string; state: ScanFeedItem['state']; meta?: string | null },
): ScanFeedItem {
  const whenIso = row.last_activity_at ?? row.created_at ?? null;
  return {
    id: `line-${row.id}`,
    primary: row.sku ?? row.tracking_number ?? String(row.id),
    title: row.item_name ?? row.sku ?? 'Item',
    subtitle: row.sku ?? null,
    at: whenIso ? new Date(whenIso) : new Date(),
    state: opts.state,
    statusLabel: opts.statusLabel,
    meta: opts.meta ?? null,
    href: row.receiving_id ? `/m/r/${row.receiving_id}` : null,
  };
}

/**
 * The Prioritize feed's whole row pipeline — filter + map, verbatim from the
 * panel's queryFn. Rows must be WIRE-SHAPED (JSON round-tripped) before this
 * runs so seed and fetch paths agree byte-for-byte.
 */
export function mapPrioritizeRows(rows: readonly ReceivingLineRow[]): ScanFeedItem[] {
  return rows
    .filter((r) => r.receiving_source !== 'unmatched')
    .map((r) =>
      lineToScanItem(r, {
        statusLabel: receivingStatusLabel(r),
        state: receivingState(r),
        meta: `${r.quantity_received}/${r.quantity_expected ?? '?'}`,
      }),
    );
}

export type { TestingVerdict };
