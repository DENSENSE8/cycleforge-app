'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ImagePlus, Package, Printer, ScanBarcode, X } from '@/components/Icons';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/design-system/primitives';
import { handlingUnitQcFace } from '@/lib/handling-unit-presentation';
import { printHandlingUnitLabel } from '@/lib/print/printHandlingUnitLabel';
import { containerPath, WAREHOUSE_PATHS } from '@/lib/nav/route-tree';
import { QC_SCAN_HREF } from '@/lib/scan/identify-land';
import { qcUnitStage } from '@/lib/qc/unit-qc-stage';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { HandlingUnitMemberRow } from './HandlingUnitMemberRow';
import { handlingUnitQueryKey, useHandlingUnit, type HandlingUnitMemberRead } from './useHandlingUnit';

interface PackScanResponse {
  success: boolean;
  /** The pack hub for the tote's order; it prints the order's bundle on entry. */
  packHref?: string;
}

export function HandlingUnitV2Record({ lpnRef }: { lpnRef: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useHandlingUnit(lpnRef);
  const box = query.data?.handling_unit ?? null;
  const [selected, setSelected] = useState<HandlingUnitMemberRead | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pack = useQuery<PackScanResponse>({
    queryKey: ['handling-unit.pack-order', box?.id],
    enabled: !!box,
    queryFn: async () => {
      const response = await fetch(`/api/packing/resolve-scan?scan=${encodeURIComponent(box!.code)}`, { cache: 'no-store' });
      return response.json() as Promise<PackScanResponse>;
    },
    refetchOnWindowFocus: false,
  });

  if (query.isPending) return <div className="min-h-full bg-mode-panel px-6 py-16 text-center text-sm text-text-soft">Loading tote…</div>;
  if (query.error || !box) return <div role="alert" className="min-h-full bg-mode-panel px-6 py-16 text-center text-sm font-semibold text-text-danger">{query.error?.message || 'Tote not found'}</div>;

  const holdUnits = box.units.filter((unit) => ['failed', 'ticket'].includes(qcUnitStage(unit.current_status))).length;
  const face = handlingUnitQcFace({ totalUnits: box.rollup.total, testedUnits: box.rollup.tested, holdUnits });
  const selfHref = containerPath(box.id);
  const moveHref = `/m/scan?intent=location&moveLpn=${box.id}&returnTo=${encodeURIComponent(selfHref)}`;

  const removeSelected = async () => {
    if (!selected || removing) return;
    setRemoving(true);
    setError(null);
    try {
      const commandId = safeRandomUUID();
      const response = await fetch(`/api/handling-units/${box.id}/unassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandId },
        body: JSON.stringify({ units: [selected.id], idempotencyKey: commandId }),
      });
      const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Could not remove the unit');
      setSelected(null);
      await queryClient.invalidateQueries({ queryKey: handlingUnitQueryKey(lpnRef) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove the unit');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="handling-unit-v2-record">
      <MobileV2DetailTopBar
        backHref={WAREHOUSE_PATHS.stock}
        title={box.code}
        subtitle="Tote"
        meta={`${face.label} · ${box.location_name || 'Not parked'}`}
        mono
        lead={<Package className="h-5 w-5 text-teal-600" />}
        scanHref={`${QC_SCAN_HREF}&lpn=${encodeURIComponent(String(box.id))}`}
        right={(
          <button type="button" aria-label="Print tote label" onClick={() => printHandlingUnitLabel({ handlingUnitId: box.id, code: box.code })} className="flex h-11 w-11 items-center justify-center text-text-muted active:bg-surface-sunken">
            <Printer className="h-5 w-5" />
          </button>
        )}
      />

      {holdUnits > 0 ? <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-mode-page py-2 text-xs font-semibold text-rose-700"><AlertTriangle className="h-4 w-4" />{holdUnits} unit{holdUnits === 1 ? '' : 's'} on hold</div> : null}

      <section className="grid grid-cols-3 border-b border-mode-rule bg-mode-panel text-center" aria-label="Tote summary">
        <div className="border-r border-mode-rule px-2 py-2"><strong className="block text-sm tabular-nums text-mode-ink">{box.rollup.total}</strong><span className="text-[10px] text-mode-muted">Units</span></div>
        <div className="border-r border-mode-rule px-2 py-2"><strong className="block text-sm tabular-nums text-mode-ink">{box.rollup.tested}</strong><span className="text-[10px] text-mode-muted">QC complete</span></div>
        <div className="px-2 py-2"><strong className="block truncate text-sm text-mode-ink">{box.status}</strong><span className="text-[10px] text-mode-muted">Container</span></div>
      </section>

      <div className="grid grid-cols-3 gap-2 border-b border-mode-rule bg-mode-panel p-2">
        <Button variant="primary" size="md" radius="surface" onClick={() => router.push(`/m/qc/lpn/${box.id}`)}>QC</Button>
        <Button variant="secondary" size="md" radius="surface" icon={<ScanBarcode />} onClick={() => router.push(moveHref)}>Move</Button>
        {pack.data?.packHref ? (
          <Button variant="success" size="md" radius="surface" onClick={() => router.push(pack.data!.packHref!)}>Pack</Button>
        ) : (
          <Button variant="secondary" size="md" radius="surface" disabled>Prepack</Button>
        )}
      </div>

      <div className="flex-1">
        {box.units.map((unit) => <HandlingUnitMemberRow key={unit.id} unit={unit} onOpen={() => { setError(null); setSelected(unit); }} />)}
        {box.units.length === 0 ? <p className="px-6 py-16 text-center text-sm font-semibold text-text-soft">Empty tote. Assign units from receiving or QC scanning.</p> : null}
      </div>

      <Sheet open={selected != null} onOpenChange={(open) => { if (!open && !removing) setSelected(null); }}>
        <SheetContent side="bottom">
          {selected ? (
            <>
              <SheetHeader className="shrink-0 border-b border-border-soft pr-12">
                <SheetTitle>{selected.sku || 'Unknown SKU'}</SheetTitle>
                <SheetDescription className="font-mono">{selected.serial_number} · {box.code}</SheetDescription>
              </SheetHeader>
              <SheetBody className="grid content-start gap-3">
                <Button variant="primary" size="lg" radius="surface" onClick={() => router.push(`/m/u/${selected.id}/qc?back=${encodeURIComponent(selfHref)}`)}>Open QC</Button>
                <Button variant="secondary" size="lg" radius="surface" icon={<ImagePlus />} onClick={() => router.push(`/m/unit-photos/${selected.id}?stage=testing&back=${encodeURIComponent(selfHref)}`)}>Add photo</Button>
                <Button variant="ghost" size="lg" radius="surface" onClick={() => router.push(`/m/u/${selected.id}`)}>Open unit record</Button>
                <Button variant="danger" size="lg" radius="surface" icon={<X />} loading={removing} onClick={() => void removeSelected()}>Remove from tote</Button>
                {error ? <p role="alert" className="text-sm font-semibold text-text-danger">{error}</p> : null}
              </SheetBody>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
