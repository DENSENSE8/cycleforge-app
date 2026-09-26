'use client';

/**
 * Directed pick — `/m/pick`. Opening the route IS the session: ONE task on
 * screen, fed by the system, no queue and no start button.
 *
 * ```
 * ✕  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Unassigned · 3   0 / 2    progress band
 * C-04-09-2                                          the location — biggest text
 * Zone 3 - Parts                        [Pair bin]
 * ┌──────────────────────────────┐
 * │           photo              │                  product card: title only
 * │ Bose Solo & Cinemate    × 4  │
 * │ RC                      each │
 * └──────────────────────────────┘
 * ┌ Amazon · 113-0178053-2920236 ─┐                 order card: SLA (the to-ship
 * │ ◷ Late 3h · 2 units left · 4:12│                 card's face), tote, owner,
 * │ Your SKU · Backups: Ana, Joe   │                 paperwork, listing, and
 * │ [Packing slip] [Amazon listing]│                 Skip / Pass to…
 * │ [Skip]         [Pass to…]      │
 * └──────────────────────────────┘
 * Scan location barcode                              the step's instruction
 * [ ▲ Scan bin ]                                     the house lens (collapsed)
 * [Out of Stock] [Notes]                             dock
 * ```
 *
 * The worker never sees a list here: finishing a line asks the feed for the
 * next one. Scans come from the bottom capture window (`MobileCaptureWindow`,
 * the lens `/m/scan` runs on — collapsed per line so it never reads stray
 * labels on the walk, one tap to lift) or a hardware wedge (always live);
 * each is heard and felt. Pairing a bin lifts the same window.
 */

import { useState } from 'react';
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
import { locationFace, type DirectedPickStep } from '@/lib/picking/directed-pick';
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

const SCAN_LABEL: Record<DirectedPickStep, string> = {
  tote: 'Scan tote',
  location: 'Scan bin',
  item: 'Scan item',
  done: 'Scan',
};

const MESSAGE_VARIANT = {
  error: 'destructive',
  success: 'success',
  info: 'default',
} as const satisfies Record<DirectedPickMessage['tone'], 'destructive' | 'success' | 'default'>;

/** Where the X leaves to — the Orders queue, the phone's outbound landing. */
const EXIT_HREF = '/m/work';

export function DirectedPickScreen() {
  const router = useRouter();
  const [docsOpen, setDocsOpen] = useState(false);
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

      <div className="flex-1 overflow-y-auto px-mode-page pb-3 pt-3">
        {c.loadError && !line ? (
          <Alert variant="destructive">
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
            <div className="py-10 text-center">
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
            {/* The location — the first thing the eye hits; Pair rides the same row. */}
            <section aria-label="Location" className="mb-3">
              <div className="flex items-start gap-2">
                <p
                  className={cn(
                    'min-w-0 flex-1 break-words font-mono font-semibold leading-none tracking-tight tabular-nums',
                    // A shelf face (`C-04-15-1`) fits one line at the largest size;
                    // a long code steps down rather than breaking into three lines.
                    !line.location ? 'text-3xl text-text-muted' : locationFace(line.location).length > 9 ? 'text-4xl' : 'text-5xl',
                    line.location ? 'text-text-default' : null,
                  )}
                >
                  {line.location ? locationFace(line.location) : 'No bin'}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={c.pairing ? undefined : <MapPin />}
                  className="shrink-0"
                  disabled={!c.pairing && (c.busy || step === 'done')}
                  onClick={c.pairing ? c.cancelPairing : c.startPairing}
                >
                  {c.pairing ? 'Cancel' : 'Pair bin'}
                </Button>
              </div>
              {step === 'item' && line.location ? (
                <p className="mt-1 text-role-caption text-text-success">Bin confirmed</p>
              ) : line.location?.room ? (
                <p className="mt-1 truncate text-role-caption text-text-muted">{line.location.room}</p>
              ) : null}
            </section>

            {/* The product — photo for the glance, then its title and the count. */}
            <section
              aria-label="Product"
              className={cn(
                'border bg-surface-card',
                order?.rush ? 'border-l-4 border-border-danger' : 'border-border-soft',
              )}
            >
              <ItemRecordThumb imageUrl={line.imageUrl} plainEmpty className="h-56 w-full self-auto" iconClassName="h-16 w-16" />
              <div className="flex items-start gap-3 border-t border-border-soft px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-3 text-2xl font-semibold leading-tight text-text-default">{line.title}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-6xl font-semibold leading-none tabular-nums text-text-default">
                    ×{line.units.length - c.pickedCount}
                  </p>
                  <p className="mt-1 text-role-data text-text-soft">
                    {c.pickedCount > 0 ? `${c.pickedCount} of ${line.units.length} picked` : 'each'}
                  </p>
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

      {/* Feedback, then the step's instruction, right above the thumb. */}
      <div className="shrink-0 px-mode-page pb-2">
        {c.message ? (
          <Alert
            variant={MESSAGE_VARIANT[c.message.tone]}
            role={c.message.tone === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className="mb-2 pr-12"
          >
            <AlertDescription className="text-role-data opacity-100">{c.message.text}</AlertDescription>
            <IconButton
              onClick={c.dismissMessage}
              ariaLabel="Dismiss"
              icon={<X className="h-4 w-4" />}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center"
            />
          </Alert>
        ) : null}
        {line ? (
          <p className="text-role-title text-text-default" aria-live="polite">
            {c.busy ? 'Saving…' : c.instruction}
          </p>
        ) : null}
      </div>

      {line ? (
        // Keyed per line: each new line's window mounts collapsed (lens off on
        // the walk); Pair bin lifts it through `armRequest`.
        <MobileCaptureWindow
          key={line.key}
          label="Pick camera"
          collapsedLabel={c.pairing ? 'Scan bin' : SCAN_LABEL[step]}
          status={cameraTarget}
          onDecode={c.handleScan}
          pending={c.busy ? 1 : 0}
          armRequest={c.cameraArmRequest}
          dedupMs={PICK_DEDUP_MS}
          initiallyArmed={false}
        />
      ) : null}

      <DetailDock label="Pick actions" verbs={verbs} onVerb={onVerb} size="glove" />

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
