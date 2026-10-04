'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Camera,
  ChevronRight,
  ExternalLink,
  Images,
  ListChecks,
  PackageCheck,
  ScanBarcode,
  Ticket,
} from '@/components/Icons';
import { MobileReceivingPhotoStrip } from '@/components/mobile/receiving/MobileReceivingPhotoStrip';
import { useCartonHub } from '@/components/mobile/receiving/useCartonHub';
import { useCompleteCarton } from '@/components/mobile/receiving/useCompleteCarton';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { MobileV2InboundOrderDoor } from '@/components/mobile/v2/inbound/MobileV2InboundOrderDoor';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DetailDock } from '@/design-system/components/DetailDock';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { conditionGradeTableLabel } from '@/lib/conditions';
import { mobileJobReturn, withJobReturn } from '@/lib/mobile/nav-trail';
import { receivingLinePhotoHrefs } from '@/lib/photos/mobile-gallery-url';
import {
  cartonLineTitle,
  cartonPoNumbers,
  cartonStage,
  cartonUnboxBlock,
  cartonUnboxRow,
  formatCartonStamp,
  type CartonHubLine,
} from '@/lib/receiving/carton-hub';
import { normalizeListingHref } from '@/lib/receiving/listing-links';
import { workflowStageBadge, workflowStageLabel } from '@/lib/receiving/workflow-stages';
import { sourcePlatformLabel } from '@/lib/source-platform';
import { cn } from '@/utils/_cn';

type SheetTab = 'details' | 'photos';
type CartonVerb = 'photo' | 'scan' | 'photos' | 'unbox' | 'qc';

function ticketId(raw: string | null | undefined): number | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function CartonLineRow({ line, onOpen }: { line: CartonHubLine; onOpen: () => void }) {
  const status = workflowStageLabel(line.workflow_status || 'EXPECTED');
  const condition = conditionGradeTableLabel(line.condition_grade || '');
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid min-h-16 w-full grid-cols-[0.75rem_minmax(0,1fr)_auto_1rem] items-center gap-2 border-b border-mode-rule bg-mode-panel px-mode-page py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-accent"
      data-testid="receiving-v2-line-row"
    >
      <span className={cn('h-2.5 w-2.5 rounded-full', line.workflow_status === 'DONE' ? 'bg-emerald-500' : 'bg-amber-500')} aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-mode-ink">{cartonLineTitle(line)}</span>
        <span className="block truncate font-mono text-[11px] leading-4 text-mode-muted">{line.sku || `L-${line.id}`}</span>
      </span>
      <span className="text-right">
        <span className="block text-sm font-bold tabular-nums text-mode-ink">{line.quantity_received}/{line.quantity_expected ?? '?'}</span>
        <span className={cn('block text-[10px] font-semibold', conditionGradeTextClass(line.condition_grade || ''))}>
          {condition === '—' ? status : condition}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 text-mode-muted" />
    </button>
  );
}

/** Compact V2 face for a scanned `R-*` receiving licence plate. */
export function MobileV2ReceivingCartonRecord() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { id, data, loading, error, reload } = useCartonHub();
  const back = mobileJobReturn(searchParams.get('back'));
  const viewOnly = searchParams.get('scanMode') === 'view';
  const recordHref = `/m/r/${id}${back ? `?back=${encodeURIComponent(back)}&scanMode=${viewOnly ? 'view' : 'operate'}` : ''}`;
  const [selected, setSelected] = useState<CartonHubLine | null>(null);
  const [sheetTab, setSheetTab] = useState<SheetTab>('details');
  const [confirmUnbox, setConfirmUnbox] = useState(false);
  const [notice, setNotice] = useState<'blocked' | 'error' | null>(null);
  const unboxRow = useMemo(() => (data ? cartonUnboxRow(data) : null), [data]);
  const unbox = useCompleteCarton(unboxRow);
  const { phase, reset } = unbox;

  useEffect(() => {
    if (phase === 'blocked' || phase === 'error') setNotice(phase);
    if (phase !== 'done') return;
    reset();
    router.replace(`/m/r/${id}/qc`);
  }, [phase, reset, router, id]);

  if (loading || error || !data) {
    return (
      <div className="flex min-h-full flex-col bg-mode-panel">
        <MobileV2DetailTopBar
          title={`R-${Number.isFinite(id) ? id : ''}`}
          subtitle="Receiving licence plate"
          backHref={back ?? '/m/receiving'}
          close={back != null}
          mono
          scanHref="/m/scan?mode=view"
        />
        <div className="px-6 py-16 text-center text-sm font-semibold text-text-soft">
          {loading ? 'Loading receiving record…' : error || 'Receiving record not found'}
          {error ? <Button variant="secondary" size="md" radius="surface" onClick={() => void reload()} className="mx-auto mt-4">Retry</Button> : null}
        </div>
      </div>
    );
  }

  const carton = data.receiving;
  const stage = cartonStage(data.lines);
  const stageLabel = workflowStageLabel(stage);
  const cartonTicket = ticketId(carton.zendesk_ticket) ?? data.lines.map((line) => ticketId(line.zendesk_ticket)).find((value) => value != null) ?? null;
  const platform = sourcePlatformLabel(carton.source_platform || '') || carton.source_platform || 'Receiving';
  const unboxedAt = formatCartonStamp(carton.unboxed_at);
  const photosHref = `/m/r/${id}/photos?stage=unbox_carton&back=${encodeURIComponent(recordHref)}`;
  const canUnbox = cartonUnboxBlock(data) === null;
  const currentSheetTicket = ticketId(selected?.zendesk_ticket) ?? cartonTicket;
  const listingHref = normalizeListingHref(selected?.listing_url) ?? normalizeListingHref(carton.listing_url);
  const linePhotos = selected
    ? receivingLinePhotoHrefs({
        receivingId: id,
        lineId: selected.id,
        itemName: cartonLineTitle(selected),
        sku: selected.sku,
        poRef: cartonPoNumbers(data)[0],
        back: recordHref,
      })
    : null;

  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="mobile-v2-receiving-carton">
      <MobileV2DetailTopBar
        title={`R-${id}`}
        subtitle={`${platform} · Receiving`}
        meta={`${carton.tracking || 'No tracking'}${unboxedAt ? ` · ${unboxedAt}` : ''}`}
        backHref={back ?? '/m/receiving'}
        close={back != null}
        mono
        scanHref={`/m/scan?mode=${viewOnly ? 'view' : 'operate'}`}
        right={cartonTicket ? (
          <button
            type="button"
            onClick={() => router.push(withJobReturn(`/m/t/${cartonTicket}`, recordHref))}
            className="rounded-mode-pill bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800"
            aria-label={`Open ticket ${cartonTicket}`}
          >
            #{cartonTicket}
          </button>
        ) : undefined}
      />

      <section className="grid grid-cols-3 border-b border-mode-rule bg-mode-panel text-center" aria-label="Receiving summary">
        <div className="border-r border-mode-rule px-2 py-2"><strong className="block text-sm tabular-nums text-mode-ink">{data.lines.length}</strong><span className="text-[10px] text-mode-muted">Items</span></div>
        <div className="border-r border-mode-rule px-2 py-2"><strong className="block text-sm tabular-nums text-mode-ink">{data.totals.received}/{data.totals.expected || '?'}</strong><span className="text-[10px] text-mode-muted">Units</span></div>
        <div className="px-2 py-2"><strong className="block truncate text-sm text-mode-ink">{stageLabel}</strong><span className="text-[10px] text-mode-muted">Status</span></div>
      </section>

      {viewOnly ? (
        <div className="border-b border-blue-200 bg-blue-50 px-mode-page py-2 text-xs font-semibold text-blue-700">
          View only · no receiving changes will be made
        </div>
      ) : null}

      {cartonTicket ? (
        <button type="button" onClick={() => router.push(withJobReturn(`/m/t/${cartonTicket}`, recordHref))} className="flex min-h-11 items-center gap-2 border-b border-amber-200 bg-amber-50 px-mode-page text-left text-xs font-semibold text-amber-800">
          <Ticket className="h-4 w-4" /> Ticket #{cartonTicket} · tap to view conversation
        </button>
      ) : null}

      <div className="flex-1">
        {data.lines.map((line) => <CartonLineRow key={line.id} line={line} onOpen={() => { setSheetTab('details'); setSelected(line); }} />)}
        {data.lines.length === 0 ? <p className="px-6 py-16 text-center text-sm font-semibold text-text-soft">No items are linked to this receiving label.</p> : null}
        {viewOnly ? null : <MobileV2InboundOrderDoor receivingId={id} returnTo={recordHref} />}
      </div>

      <DetailDock<CartonVerb>
        label="Receiving actions"
        verbs={[
          { id: 'photo', label: 'Photo', icon: <Camera /> },
          { id: 'scan', label: 'Scan', icon: <ScanBarcode /> },
          viewOnly
            ? { id: 'photos', label: 'Photos', icon: <Images /> }
            : canUnbox
              ? { id: 'unbox', label: 'Unbox', icon: <PackageCheck />, primary: true, loading: unbox.phase === 'working' }
              : { id: 'qc', label: 'QC', icon: <ListChecks />, primary: true },
        ]}
        onVerb={(verb) => {
          if (verb === 'photo') router.push(photosHref);
          else if (verb === 'scan') router.replace(`/m/scan?mode=${viewOnly ? 'view' : 'operate'}`);
          else if (verb === 'photos') router.push(`${photosHref}&mode=gallery`);
          else if (verb === 'unbox') setConfirmUnbox(true);
          else router.push(`/m/r/${id}/qc`);
        }}
      />

      <Sheet open={selected != null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent side="bottom">
          {selected ? (
            <>
              <SheetHeader className="shrink-0 border-b border-border-soft pr-12">
                <SheetTitle className="line-clamp-2">{cartonLineTitle(selected)}</SheetTitle>
                <SheetDescription className="font-mono">{selected.sku || `L-${selected.id}`} · {selected.quantity_received}/{selected.quantity_expected ?? '?'}</SheetDescription>
              </SheetHeader>
              <div className="shrink-0 p-4 pb-2">
                <TabSwitch
                  tabs={[{ id: 'details', label: 'Details' }, { id: 'photos', label: 'Photos' }]}
                  activeTab={sheetTab}
                  onTabChange={(next) => setSheetTab(next as SheetTab)}
                  size="sm"
                />
              </div>
              {sheetTab === 'details' ? (
                <SheetBody className="grid content-start gap-3 pt-2">
                  <div className="grid grid-cols-3 border border-border-soft bg-surface-card text-center">
                    <div className="border-r border-border-soft px-2 py-2"><strong className="block text-sm">{selected.quantity_received}/{selected.quantity_expected ?? '?'}</strong><span className="text-[10px] text-text-muted">Quantity</span></div>
                    <div className="border-r border-border-soft px-2 py-2"><strong className={cn('block truncate text-sm', conditionGradeTextClass(selected.condition_grade || ''))}>{conditionGradeTableLabel(selected.condition_grade || '')}</strong><span className="text-[10px] text-text-muted">Condition</span></div>
                    <div className="px-2 py-2"><strong className={cn('block truncate text-sm', workflowStageBadge(selected.workflow_status || 'EXPECTED'))}>{workflowStageLabel(selected.workflow_status || 'EXPECTED')}</strong><span className="text-[10px] text-text-muted">Status</span></div>
                  </div>

                  {selected.serials && selected.serials.length > 0 ? (
                    <div className="border border-border-soft bg-surface-card">
                      {selected.serials.map((unit) => (
                        <button key={unit.id} type="button" onClick={() => router.push(`/m/u/${unit.id}`)} className="flex min-h-11 w-full items-center justify-between border-b border-border-soft px-3 text-left last:border-b-0">
                          <span><span className="block font-mono text-xs font-semibold">{unit.serial_number}</span><span className="block text-[10px] text-text-muted">{unit.current_location || 'No location'} · {unit.current_status || 'Received'}</span></span>
                          <ChevronRight className="h-4 w-4 text-text-muted" />
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {listingHref ? <Button variant="secondary" size="lg" radius="surface" icon={<ExternalLink />} onClick={() => window.open(listingHref, '_blank', 'noopener,noreferrer')}>Open listing</Button> : null}
                  {currentSheetTicket ? <Button variant="secondary" size="lg" radius="surface" icon={<Ticket />} onClick={() => router.push(withJobReturn(`/m/t/${currentSheetTicket}`, recordHref))}>Open ticket #{currentSheetTicket}</Button> : null}
                </SheetBody>
              ) : (
                <SheetBody className="grid content-start gap-3 pt-2">
                  {linePhotos?.captureHref && linePhotos.captureHref !== '#' ? <Button variant="primary" size="lg" radius="surface" icon={<Camera />} onClick={() => router.push(linePhotos.captureHref)}>Add photo</Button> : null}
                  <MobileReceivingPhotoStrip receivingId={id} staffId={user?.staffId ?? 0} galleryHref={linePhotos?.galleryHref || '#'} />
                </SheetBody>
              )}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmSheet open={confirmUnbox} onClose={() => setConfirmUnbox(false)} title={`Unbox R-${id}?`} message={`Receives every open line on this carton (${data.lines.length} item${data.lines.length === 1 ? '' : 's'}).`} confirmLabel="Unbox" onConfirm={() => void unbox.run()} />
      <ConfirmSheet open={notice === 'blocked'} onClose={() => setNotice(null)} title="Photos needed first" message={unbox.blockers.join(' ')} confirmLabel="Take photos" onConfirm={() => router.push(photosHref)} />
      <ConfirmSheet open={notice === 'error'} onClose={() => setNotice(null)} title="Unbox didn't go through" message={unbox.error ?? undefined} confirmLabel="Retry" onConfirm={() => void unbox.run()} />
    </div>
  );
}
