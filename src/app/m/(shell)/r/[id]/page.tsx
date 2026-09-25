'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConfirmSheet } from '@/components/ui/BottomSheet';
import { Activity, Camera, Images, ListChecks, PackageCheck, ScanBarcode, Tag } from '@/components/Icons';
import { CartonInfoCard } from '@/components/mobile/receiving/CartonInfoCard';
import { useCartonHub } from '@/components/mobile/receiving/useCartonHub';
import { useCompleteCarton } from '@/components/mobile/receiving/useCompleteCarton';
import { DetailDock } from '@/design-system/components/DetailDock';
import { DetailHubScreen } from '@/design-system/components/DetailHubScreen';
import { useScopedReceivingPhotos } from '@/hooks/useScopedReceivingPhotos';
import { detailDoor, type DetailDoor } from '@/lib/mobile/detail-door';
import { mobileJobReturn, withJobReturn } from '@/lib/mobile/nav-trail';
import {
  cartonUnboxBlock,
  cartonUnboxRow,
  formatCartonStamp,
  plural,
  type CartonHubData,
} from '@/lib/receiving/carton-hub';

type CartonVerb = 'photo' | 'unbox' | 'scan';

function cartonDoors(data: CartonHubData, photoCount: number | null, back: string | null): DetailDoor[] {
  const base = `/m/r/${data.receiving.id}`;
  const classify = detailDoor(base, 'classify', 'Classify', <Tag />, { meta: 'Platform · type · priority' });
  const units = data.lines.reduce((sum, line) => sum + (line.serials?.length ?? 0), 0);
  const photos = detailDoor(base, 'photos', 'Photos', <Images />, {
    meta:
      photoCount == null
        ? 'Carton evidence'
        : photoCount > 0
          ? plural(photoCount, 'photo')
          : 'No photos yet — take the box before it is opened',
  });
  return [
    // The arrival triage decision; the job the carton came from rides along so
    // the flow's exit lands back on a carton whose X still returns there.
    { ...classify, href: back ? withJobReturn(classify.href as string, back) : classify.href },
    detailDoor(base, 'lines', 'Lines', <PackageCheck />, {
      meta:
        data.lines.length > 0
          ? `${data.totals.lines_complete}/${plural(data.totals.lines, 'line')} done · ${data.totals.received}/${data.totals.expected || '?'} units`
          : 'No lines on this carton yet',
      enabled: data.lines.length > 0,
    }),
    // The photo studio's gallery face — the door reviews; the dock's Take photo captures.
    { ...photos, href: `${photos.href}?mode=gallery&back=${encodeURIComponent(base)}` },
    detailDoor(base, 'activity', 'Activity', <Activity />, {
      meta: data.events.length > 0 ? plural(data.events.length, 'recent event') : 'Nothing recorded yet',
    }),
    detailDoor(base, 'qc', 'Quality control', <ListChecks />, {
      meta: units > 0 ? `${plural(units, 'unit')} to check — pick a line` : 'No units received yet — unbox first',
      enabled: units > 0,
    }),
  ];
}

/**
 * `/m/r/[id]` — the receiving carton HUB on {@link DetailHubScreen} (the
 * exoskeleton; reference `/m/rs/[id]`). A read-only card (what's in the box,
 * tracking, progress, `R-id`, stage) opens `/info`; doors open one job each —
 * Classify, Lines, Photos, Activity, Quality control. The dock is the only
 * write: Take photo · Unbox · Scan again. Opened from a job (`?back=`, the
 * `/m/scan` tape) the bar is an X back to it. The anonymous Digital Link face
 * is the layout's gate.
 */
function CartonHubInner() {
  const router = useRouter();
  const { id, data, loading, error, reload } = useCartonHub();
  const back = mobileJobReturn(useSearchParams()?.get('back'));
  const photoScope = useMemo(
    () => ({ receivingId: id, receivingLineId: null, photosListScope: 'all' as const }),
    [id],
  );
  const { photos, query: photosQuery } = useScopedReceivingPhotos(photoScope);
  const photoCount = photosQuery.isSuccess ? photos.length : null;

  const unboxRow = useMemo(() => (data ? cartonUnboxRow(data) : null), [data]);
  const unbox = useCompleteCarton(unboxRow);
  const [confirmUnbox, setConfirmUnbox] = useState(false);
  // The blocked / failed sheet is dismissed locally — never by `unbox.reset()`,
  // which would drop the idempotency key a retry must replay.
  const [notice, setNotice] = useState<'blocked' | 'error' | null>(null);
  const { phase, reset } = unbox;

  useEffect(() => {
    if (phase === 'blocked' || phase === 'error') setNotice(phase);
    if (phase !== 'done') return;
    reset();
    // Receive is committed before the API returns. The only next job is QC:
    // choose this carton's line, then its received unit and run its checklist.
    // Replace avoids returning to a stale pre-receive hub with browser Back.
    router.replace(`/m/r/${id}/qc`);
  }, [phase, reset, router, id]);

  const photosHref = `/m/r/${id}/photos?stage=unbox_carton&back=${encodeURIComponent(`/m/r/${id}`)}`;

  return (
    <DetailHubScreen<CartonHubData>
      record={data}
      state={{ loading, error, onRetry: () => void reload() }}
      bar={{
        title: `R-${id}`,
        mono: true,
        subtitle: 'Carton',
        backHref: back ?? undefined,
        close: back != null,
        meta: (d) => {
          const at = formatCartonStamp(d.receiving.unboxed_at);
          return at ? `Unboxed ${at}` : undefined;
        },
      }}
      card={(d) => <CartonInfoCard data={d} />}
      rowsLabel="Carton screens"
      rows={(d) => cartonDoors(d, photoCount, back)}
      dock={(d) => (
        <DetailDock<CartonVerb>
          label="Carton actions"
          verbs={[
            { id: 'photo', label: 'Take photo', icon: <Camera /> },
            {
              id: 'unbox',
              label: unbox.phase === 'working' ? 'Unboxing…' : 'Unbox',
              icon: <PackageCheck />,
              primary: true,
              disabled: cartonUnboxBlock(d) !== null || unbox.phase === 'working',
            },
            { id: 'scan', label: 'Scan again', icon: <ScanBarcode /> },
          ]}
          onVerb={(verb) => {
            if (verb === 'photo') router.push(photosHref);
            else if (verb === 'scan') router.push('/m/scan');
            else setConfirmUnbox(true);
          }}
        />
      )}
    >
      {(d) => (
        <>
          <ConfirmSheet
            open={confirmUnbox}
            onClose={() => setConfirmUnbox(false)}
            title={`Unbox R-${id}?`}
            message={`Receives every open line on this carton (${plural(d.lines.length, 'line')}).`}
            confirmLabel="Unbox"
            onConfirm={() => void unbox.run()}
          />
          <ConfirmSheet
            open={notice === 'blocked'}
            onClose={() => setNotice(null)}
            title="Photos needed first"
            message={unbox.blockers.join(' ')}
            confirmLabel="Take photos"
            onConfirm={() => router.push(photosHref)}
          />
          <ConfirmSheet
            open={notice === 'error'}
            onClose={() => setNotice(null)}
            title="Unbox didn't go through"
            message={unbox.error ?? undefined}
            confirmLabel="Retry"
            onConfirm={() => void unbox.run()}
          />
        </>
      )}
    </DetailHubScreen>
  );
}

export default function CartonHubPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <CartonHubInner />
    </Suspense>
  );
}
