'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRealtimeToasts } from '@/hooks/useRealtimeToasts';
import { MobilePackingRow } from '@/components/mobile/packer/MobilePackingRow';
import { MobilePackingSheet } from '@/components/mobile/packer/MobilePackingSheet';
import { PackBinSheet } from '@/components/mobile/packer/PackBinSheet';
import { PackOrderSheet } from '@/components/mobile/packer/PackOrderSheet';
import type { PackScanBin, PackScanOrder } from '@/components/mobile/packer/pack-order-card';
import { ScanInput } from '@/components/mobile/redesign/ScanInput';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CaptureStack, useCaptureStackWindow, useCaptureStackQuery } from '@/design-system/components/capture-stack';
import { GridDegradedBox } from '@/design-system/components/grid';
import type { PackScanResult } from '@/lib/packing/pack-scan';
import { useScanFeedback } from '@/lib/scan-feedback/useScanFeedback';
import type { PackerLogRow } from '@/components/mobile/packer/types';

type PackScanResponse = { success: true; result: PackScanResult } | { success: false; error?: string };

/**
 * Mobile packer surface. One scan field answers every pack-station scan
 * (`GET /api/packing/resolve-scan`): a staged tote opens its pack job; a unit
 * serial pops its order ({@link PackOrderSheet}); a paired bin pops its SKUs
 * and the orders waiting on them ({@link PackBinSheet}).
 */
export function MobilePackingList({ packerId, limit = 8 }: { packerId: string; limit?: number }) {
  const router = useRouter();
  const { playScanFeedback } = useScanFeedback();
  const pendingScan = useRef(false);
  const [resolving, setResolving] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [orderScan, setOrderScan] = useState<PackScanOrder | null>(null);
  const [binScan, setBinScan] = useState<PackScanBin | null>(null);
  const resolveScan = useCallback(async (raw: string) => {
    const scan = raw.trim();
    if (!scan || pendingScan.current) return;
    pendingScan.current = true;
    setResolving(true);
    setScanError(null);
    try {
      const res = await fetch(`/api/packing/resolve-scan?scan=${encodeURIComponent(scan)}`, { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as PackScanResponse | null;
      if (!res.ok || !body?.success) throw new Error((body && !body.success && body.error) || `Could not read that scan (${res.status})`);
      const { result } = body;
      playScanFeedback('success');
      if (result.kind === 'tote') router.push(result.packHref);
      else if (result.kind === 'order') setOrderScan(result);
      else if (result.kind === 'bin') setBinScan(result);
    } catch (error) {
      playScanFeedback('reject');
      setScanError(error instanceof Error ? error.message : 'Could not read that scan');
    } finally {
      pendingScan.current = false;
      setResolving(false);
    }
  }, [router, playScanFeedback]);

  // A gun read on the page (rather than in the focused input) must not follow
  // the global H-label redirect to the generic box contents page.
  useEffect(() => {
    const onWedge = (event: Event) => {
      const scanEvent = event as CustomEvent<{ value?: string }>;
      if (!scanEvent.detail?.value) return;
      event.preventDefault();
      void resolveScan(scanEvent.detail.value);
    };
    window.addEventListener('wedge-scan', onWedge);
    return () => window.removeEventListener('wedge-scan', onWedge);
  }, [resolveScan]);
  useRealtimeToasts('packer');

  const queryKey = useMemo(() => ['packer-logs-mobile', packerId] as const, [packerId]);

  const { data, isLoading, isError, refetch } = useCaptureStackQuery<PackerLogRow>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ packerId: String(packerId), limit: '30', offset: '0' });
      const res = await fetch(`/api/packerlogs?${params.toString()}`);
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      return Array.isArray(json) ? (json as PackerLogRow[]) : [];
    },
    realtime: { windowEvents: ['packer-log-updated'], refreshDomains: ['packer.logs'] },
  });

  const { rows, scrollRef, freshIds } = useCaptureStackWindow(data, { limit, anchor: 'bottom' });

  const [sheetRow, setSheetRow] = useState<PackerLogRow | null>(null);
  const openSheet = useCallback((row: PackerLogRow) => setSheetRow(row), []);
  const closeSheet = useCallback(() => setSheetRow(null), []);
  const buildPhotosHref = useCallback((row: PackerLogRow) => {
    if (!row.packer_log_id) return '#';
    // A completed log's camera door is for additional evidence, not another
    // verification/finalization. The primary pack entry owns the guided path.
    const params = new URLSearchParams();
    const oid = (row.order_id || '').trim();
    if (oid) params.set('orderId', oid);
    if (row.order_row_id) params.set('orderRowId', String(row.order_row_id));
    params.set('mode', 'spam');
    return `/m/p/${row.packer_log_id}/photos?${params}`;
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-surface-card">
      <div className="shrink-0 border-b border-border-default px-4 py-3">
        <p className="mb-2 text-role-data font-semibold text-text-default">Scan a unit serial, its bin or its tote</p>
        <ScanInput onDecode={(value) => void resolveScan(value)} placeholder="Serial, bin or tote (H-…)" isResolving={resolving} />
        {scanError ? (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription>{scanError}</AlertDescription>
          </Alert>
        ) : null}
      </div>
      {isError && rows.length === 0 ? (
        <GridDegradedBox
          message="Couldn't load pack history."
          onRetry={() => { void refetch(); }}
        />
      ) : (
        <CaptureStack<PackerLogRow>
          rows={rows}
          isLoading={isLoading}
          scrollRef={scrollRef}
          freshIds={freshIds}
          empty={
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface-card px-6 text-center">
              <p className="text-sm font-semibold text-text-muted">No pack history yet</p>
              <p className="max-w-[260px] text-role-caption font-semibold text-text-soft">
                Scan a unit serial, its bin or its tote above to pack its order.
              </p>
            </div>
          }
          renderRow={(row, { variant, fresh }) => (
            <MobilePackingRow
              row={row}
              variant={variant}
              fresh={fresh}
              onTap={() => openSheet(row)}
              photosHref={buildPhotosHref(row)}
            />
          )}
        />
      )}
      <MobilePackingSheet row={sheetRow} open={sheetRow != null} onClose={closeSheet} />
      <PackOrderSheet scan={orderScan} onClose={() => setOrderScan(null)} />
      <PackBinSheet scan={binScan} onClose={() => setBinScan(null)} />
    </div>
  );
}
