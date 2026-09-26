'use client';

/** Directed pick — `/m/pick`. */

import { Fragment, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, MessageSquare, PackageX, X } from '@/components/Icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { Button, IconButton } from '@/design-system/primitives';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { ShortPickSheet } from '@/components/mobile/picker/ShortPickSheet';
import { MobileToShipPickerSheet } from '@/components/mobile/redesign/MobileToShipPickerSheet';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';
import { locationFace, type DirectedPickLocation } from '@/lib/picking/directed-pick';
import { cn } from '@/utils/_cn';
import { DirectedPickNotesSheet } from './DirectedPickNotesSheet';
import { DirectedPickOrderCard } from './DirectedPickOrderCard';
import { DirectedPickStatusBar, PICK_UNASSIGNED_HREF } from './DirectedPickStatusBar';
import { useDirectedPick, type DirectedPickMessage } from './useDirectedPick';

type DockVerb = 'short' | 'notes';

/**
 * Picking ×4 of one SKU reads the same barcode four times on purpose; the
 * house window's 6s cooldown would swallow three of them.
 */
const PICK_DEDUP_MS = 1500;

const MESSAGE_VARIANT = {
  error: 'destructive',
  success: 'success',
  info: 'default',
} as const satisfies Record<DirectedPickMessage['tone'], 'destructive' | 'success' | 'default'>;

/** Where the X leaves to — the Orders queue, the phone's outbound landing. */
const EXIT_HREF = '/m/work';

/** Every fact the line holds about its bin, on one wrapping line: confirmed · barcode · room. */
function LocationFacts({ location, confirmed }: { location: DirectedPickLocation | null; confirmed: boolean }) {
  if (!location) return <>Not on record — pair the bin you find it in</>;
  const facts: ReactNode[] = [];
  if (confirmed) facts.push(<span className="font-semibold text-text-success">Bin confirmed</span>);
  // The label code, when the face shown above is the name rather than the code itself.
  if (location.barcode && location.barcode !== locationFace(location)) {
    facts.push(<span className="font-mono text-text-default">{location.barcode}</span>);
  }
  if (location.room) facts.push(location.room);
  return facts.map((fact, i) => (
    <Fragment key={i}>
      {i > 0 ? ' · ' : null}
      {fact}
    </Fragment>
  ));
}

export function DirectedPickScreen() {
  const router = useRouter();
  const [docsOpen, setDocsOpen] = useState(false);
  /** The lens is up — the dock then stands alone under the panel instead of framing the Scan bar. */
  const [cameraUp, setCameraUp] = useState(false);
  const c = useDirectedPick(docsOpen);
  const { order, line, step } = c;

  if (!c.isLoaded || !c.signedIn) return null;

  const exit = () => router.push(EXIT_HREF);
  const progress = c.data?.progress ?? { done: 0, total: 0 };
  const cameraTarget = c.pairing
    ? `Bin for ${line?.title ?? 'this line'}`
    : step === 'tote'
      ? `Tote for ${order?.orderLabel ?? 'this order'}`
      : step === 'location'
        ? locationFace(line?.location ?? null)
        : (line?.title ?? '');

  const verbs: DetailDockVerb<DockVerb>[] = [
    { id: 'short', label: 'Out of Stock', icon: <PackageX className="h-5 w-5" aria-hidden />, disabled: !line || c.busy },
    { id: 'notes', label: 'Notes', icon: <MessageSquare className="h-5 w-5" aria-hidden />, disabled: !line },
  ];

  const onVerb = (id: DockVerb) => {
    if (id === 'short') c.setShortOpen(true);
    else c.setNotesOpen(true);
  };

  return (
    <div className={cn('flex h-full flex-col', appMobilePageGroundClass)}>
      <DirectedPickStatusBar
        done={progress.done}
        total={progress.total}
        unassignedCount={c.data?.unassignedCount ?? 0}
        onExit={exit}
      />

      <div className="flex-1 overflow-y-auto">
        {c.loadError && !line ? (
          <Alert variant="destructive" className="mx-mode-page mt-3">
            <AlertTitle className="text-role-title">Couldn&apos;t load the next pick</AlertTitle>
            <AlertDescription className="text-role-body">{c.loadError}</AlertDescription>
            <Button variant="primary" size="lg" radius="flush" className="col-start-2 mt-3 w-full" onClick={() => void c.retry()}>
              Try again
            </Button>
          </Alert>
        ) : !line ? (
          c.loading ? (
            <p className="py-10 text-center text-role-body text-text-muted" aria-live="polite">
              Finding your next pick…
            </p>
          ) : (
            <div className="px-mode-page py-10 text-center">
              <p className="text-role-display text-text-default">Nothing left to pick</p>
              <p className="mt-2 text-role-body text-text-muted">
                {progress.done} picked this run · {c.elapsed}
              </p>
              <Button
                variant="primary"
                size="lg"
                radius="flush"
                className="mt-6 w-full"
                onClick={() => {
                  c.endRun();
                  exit();
                }}
              >
                Done
              </Button>
              <Button
                variant="secondary"
                size="lg"
                radius="flush"
                className="mt-3 w-full"
                onClick={() => router.push(PICK_UNASSIGNED_HREF)}
              >
                Unassigned · {c.data?.unassignedCount ?? 0}
              </Button>
            </div>
          )
        ) : (
          <>
            {/* The location — the first thing the eye hits: the face big, every fact we hold under it; Pair is the band's right cell. */}
            <section aria-label="Location" className="flex items-stretch border-b border-mode-rule bg-surface-card">
              <div className="min-w-0 flex-1 px-mode-page py-2">
                <p
                  className={cn(
                    'break-words font-mono font-semibold leading-none tracking-tight tabular-nums',
                    // A shelf face (`C-04-15-1`) fits one line at the largest size;
                    // a long code steps down rather than breaking into three lines.
                    !line.location ? 'text-3xl text-text-muted' : locationFace(line.location).length > 9 ? 'text-4xl' : 'text-5xl',
                    line.location ? 'text-text-default' : null,
                  )}
                >
                  {line.location ? locationFace(line.location) : 'No bin'}
                </p>
                <p className="mt-1 break-words text-role-data text-text-muted">
                  <LocationFacts location={line.location} confirmed={step === 'item'} />
                </p>
              </div>
              <Button
                variant="secondary"
                size="lg"
                radius="flush"
                icon={c.pairing ? undefined : <MapPin />}
                className="h-auto min-h-12 shrink-0 whitespace-normal border-l border-mode-rule px-4 shadow-none ring-0 transition-none enabled:active:scale-100 active:bg-mode-ink active:text-mode-panel"
                disabled={!c.pairing && (c.busy || step === 'done')}
                onClick={c.pairing ? c.cancelPairing : c.startPairing}
              >
                {c.pairing ? 'Cancel' : 'Pair bin'}
              </Button>
            </section>

            {/* The product — full-bleed photo for the glance, then its whole title and the count; rush is the left spine. */}
            <section
              aria-label="Product"
              className={cn('border-b border-mode-rule bg-surface-card', order?.rush && 'border-l-4 border-l-border-danger')}
            >
              <ItemRecordThumb imageUrl={line.imageUrl} plainEmpty className="h-56 w-full self-auto" iconClassName="h-16 w-16" />
              <div className="flex items-start gap-3 border-t border-mode-rule px-mode-page py-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-2xl font-semibold leading-tight text-text-default">{line.title}</p>
                </div>
                {/* The count sits at the title's size — a fact beside the name, not a headline. */}
                <div className="shrink-0 text-right">
                  <p className="font-mono text-2xl font-semibold leading-tight tabular-nums text-text-default">
                    ×{line.units.length - c.pickedCount}
                  </p>
                  {c.pickedCount > 0 ? (
                    <p className="text-role-caption text-text-muted">
                      {c.pickedCount} of {line.units.length} picked
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            {order ? (
              <DirectedPickOrderCard
                order={order}
                tote={c.tote}
                elapsed={c.elapsed}
                docsOpen={docsOpen}
                setDocsOpen={setDocsOpen}
                viewerStaffId={c.viewerStaffId}
                busy={c.busy}
                onSkip={() => void c.skip()}
                onPass={() => c.setPassOpen(true)}
              />
            ) : null}
          </>
        )}
      </div>

      {/* Feedback, right above the thumb. What to do next is the scan bar's own label. */}
      {c.message ? (
        <div className="shrink-0 px-mode-page pb-2">
          <Alert
            variant={MESSAGE_VARIANT[c.message.tone]}
            role={c.message.tone === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className="pr-12"
          >
            <AlertDescription className="text-role-data opacity-100">{c.message.text}</AlertDescription>
            <IconButton
              onClick={c.dismissMessage}
              ariaLabel="Dismiss"
              icon={<X className="h-4 w-4" />}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center"
            />
          </Alert>
        </div>
      ) : null}

      {line ? (
        // Keyed per line: each new line's window mounts collapsed (lens off on
        // the walk); Pair bin lifts it through `armRequest`. Collapsed, the Scan
        // bar is the dock's middle cell; with the lens up the dock rides below it.
        <MobileCaptureWindow
          key={line.key}
          label="Pick camera"
          collapsedLabel={c.scanLabel}
          status={cameraTarget}
          onDecode={c.handleScan}
          pending={c.busy ? 1 : 0}
          armRequest={c.cameraArmRequest}
          dedupMs={PICK_DEDUP_MS}
          initiallyArmed={false}
          onArmedChange={setCameraUp}
          collapsedFrame={(scan) => <DetailDock label="Pick actions" verbs={verbs} onVerb={onVerb} size="glove" center={scan} />}
        />
      ) : null}

      {!line || cameraUp ? <DetailDock label="Pick actions" verbs={verbs} onVerb={onVerb} size="glove" /> : null}

      {line ? (
        <>
          <ShortPickSheet
            open={c.shortOpen}
            onClose={() => c.setShortOpen(false)}
            pickedQty={c.pickedCount}
            plannedQty={line.units.length}
            productLabel={line.title}
            onConfirm={(result) => void c.handleShort(result)}
          />
          <DirectedPickNotesSheet
            open={c.notesOpen}
            onClose={() => c.setNotesOpen(false)}
            lineLabel={`${line.title} · ${locationFace(line.location)}`}
            onSave={c.saveNote}
          />
        </>
      ) : null}
      <MobileToShipPickerSheet
        currentPickerId={order?.owner?.staffId ?? null}
        open={c.passOpen && order != null}
        onClose={() => c.setPassOpen(false)}
        onPass={(staff) => void c.passTo(staff)}
      />
    </div>
  );
}
