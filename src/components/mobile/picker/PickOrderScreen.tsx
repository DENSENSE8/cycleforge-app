'use client';

/**
 * One order of the `/m/pick` walk on the scan card: the desk's pick flow on
 * the phone. The first serial / SKU scan picks the order (anchored on the
 * order — pickup orders have no label); Skip moves the walk on without a
 * write; once the order is in hand the walk advances (`onPicked`). Pair bin /
 * Update location lifts the same camera to name the SKU's bin
 * ({@link usePairBin}). The bottom bar is the flush terminal block — an
 * shared triage action region
 * surface) — edge to edge, square cells.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown, MapPin, Send, X } from '@/components/Icons';
import { PickListingPill } from './PickListingPill';
import { PickPairManual } from './PickPairManual';
import { PickSerialAddedPanel } from './PickSerialAddedPanel';
import { LocationBadge } from '@/design-system/components/LocationBadge';
import { PairItemNumberSheet } from './PairItemNumberSheet';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DetailFact, DetailFacts, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { IconButton } from '@/design-system/primitives';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_DEADLINE_TONE_CLASS } from '@/design-system/tokens/record-card';
import { cn } from '@/utils/_cn';
import { Badge } from '@/components/ui/badge';
import { RecordSquarePhoto } from '@/design-system/components/record-card/RecordCardMobile';
import { MobileSwipePhotoViewer } from '@/components/mobile/station/MobileSwipePhotoViewer';
import { marketplaceFullUrl } from '@/lib/photos/marketplace-thumb-url';
import { RecordLineFacts } from '@/design-system/components/record-card/record-fact';
import type { RecordCardDeadline, RecordCardLine, RecordCardMobileModel } from '@/design-system/components/record-card/record-card-types';
import { OUTBOUND_TRIAGE_VIEW } from '@/lib/triage/views';
import { JobProgress } from '@/components/mobile/JobProgress';
import { PassPickSheet } from './PassPickSheet';
import { toast } from '@/lib/toast';
import { PickedByFace } from './PickedByFace';
import { PickSerialList } from './PickSerialList';
import { usePairBin } from './usePairBin';
import { usePickOrder, type PickOrderMessage } from './usePickOrder';

/** The order facts the list card already holds — the order screen's 'More order details'. */
export interface PickOrderDetails {
  /** Linked customer, else the ship-to name / company. */
  buyerName: string | null;
  channel: RecordCardMobileModel['channel'];
  shipBy: RecordCardDeadline;
  buyerNote: string | null;
  staffNote: string | null;
  /**
   * The shown line's listing, resolved from its ITEM NUMBER on the order's own platform; null when
   * there is none (no item number, only a SKU search, or another platform's store) → Pair item number.
   */
  listingHref: string | null;
  /** The shown line's item number as it stands — the Pair sheet's starting value. */
  itemNumber: string | null;
}

type PickVerb = 'pass' | 'bin';

/** A label is scanned once; the same serial twice in a row is a real re-scan only after a beat. */
const SCAN_DEDUP_MS = 1500;

const MESSAGE_VARIANT = {
  error: 'destructive',
  warning: 'warning',
  success: 'success',
  info: 'default',
} as const satisfies Record<PickOrderMessage['tone'], 'destructive' | 'warning' | 'success' | 'default'>;

export function PickOrderScreen({
  orderId,
  active,
  progress,
  lines,
  details,
  bin,
  onPicked,
  onSkip,
  onBack,
}: {
  orderId: number;
  /** The order's segment on my walk's bar (over `progress.total`); null when it is outside the walk. */
  active: number | null;
  /** My walk's progress (`pickWalkProgress`) — the bar at the very top. */
  progress: { picked: number; total: number };
  /** The order's lines, lead first, as the list card paints them (photo · title · qty · condition · price). Empty → the card's title alone. */
  lines: readonly RecordCardLine[];
  /** The list card's order facts; null when the order was opened from outside the loaded queue. */
  details: PickOrderDetails | null;
  /** The order's resolved bin (the list card's); null → the verb reads 'Pair', else 'Update'. */
  bin: string | null;
  onPicked: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const c = usePickOrder({ orderId, onPicked });
  /** Pass pick's bottom sheet of pickers. */
  const [passOpen, setPassOpen] = useState(false);
  /** Pair item number's bottom sheet. */
  const [itemSheetOpen, setItemSheetOpen] = useState(false);
  /** The product photo full screen (tap the photo); the url outlives `open` so the exit animates it. */
  const [viewerPhoto, setViewerPhoto] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  /** Bumped by Done on "Serial added": the camera goes away. */
  const [doneRequest, setDoneRequest] = useState(0);
  const { user, has } = useAuth();
  const { card } = c;
  const sku = String(card?.sku ?? '').trim();
  const pairBin = usePairBin({ sku, returnHref: `/m/pick?order=${orderId}` });

  if (!c.isLoaded || !c.signedIn) return null;

  const qty = Math.max(1, Number(card?.quantity) || 1);
  // The scan bar says one word (owner 2026-10-08): "Scan" — only pairing and saving change it.
  const scanLabel = pairBin.pairing
    ? pairBin.busy
      ? 'Pairing…'
      : 'Scan bin to pair'
    : c.busy
      ? 'Saving…'
      : 'Scan';

  const verbs: DetailDockVerb<PickVerb>[] = [
    // Bottom left (owner 2026-10-08): hand this pick to another picker; each scanned serial carries its own Undo inline.
    {
      id: 'pass',
      label: 'Pass pick',
      icon: <Send className="h-5 w-5" aria-hidden />,
      // The writer is `/api/orders/assign` (gated `orders.create`): without it the verb stays off rather than fail.
      disabled: !card || c.busy || !has('orders.create'),
      testId: 'pick-order-pass',
      // Passing is a hand-off, painted as one (owner 2026-10-08): the yellow fill.
      variant: 'yellow',
    },
    // The SKU's bin, where Unpick used to sit (owner 2026-09-29): pair it when unknown, update it when known —
    // on the camera alone (owner 2026-10-08: no dock while pairing; the camera's check closes it).
    {
      id: 'bin',
      label: bin ? 'Update' : 'Pair',
      icon: <MapPin className="h-5 w-5" aria-hidden />,
      disabled: !sku || c.busy || pairBin.busy,
      testId: 'pick-order-bin',
      // Blue (owner 2026-10-08) — the same dock Button as Pass pick, only the fill differs.
      variant: 'primary',
    },
  ];
  const onVerb = (id: PickVerb) => (id === 'pass' ? setPassOpen(true) : pairBin.start());
  const message: PickOrderMessage | null = pairBin.error ? { tone: 'error', text: pairBin.error } : c.message;

  return (
    <div className={cn('flex h-full flex-col', appMobilePageGroundClass)} data-testid="pick-order">
      <JobProgress
        done={progress.picked}
        total={progress.total}
        doneWord="picked"
        active={active ?? undefined}
        onClose={onBack}
        onSkip={onSkip}
        skipDisabled={c.busy}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className={cn('flex-1 overflow-y-auto', card && 'pb-20')}>
          {!card ? (
            c.message ? null : (
              <p className="px-mode-page py-10 text-center text-role-body text-text-muted" aria-live="polite">
                Opening the order…
              </p>
            )
          ) : (
            // Edge to edge (owner 2026-10-08): horizontal hairlines between the blocks, no side lines.
            <div className="divide-y divide-mode-rule border-b border-mode-rule">
              {/* Where to go first (owner 2026-10-08): the full location above the photo and title, scrolling
                  left ↔ right so the whole path and the bin or tote code are always readable. */}
              <div
                data-testid="pick-order-location"
                className="flex items-center gap-2 overflow-x-auto overscroll-x-contain bg-surface-card px-mode-page py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <LocationBadge text={bin} fit="full" onPress={!bin && sku ? pairBin.start : undefined} className="shrink-0 text-role-caption" />
              </div>
              {(lines.length > 0
                ? lines
                : [{ id: 0, title: card.productTitle, photoUrl: null, facts: { qty: { kind: 'qty' as const, value: qty } }, alert: false, alertNote: null }]
              ).map((line) => (
                // The photo sits flush in the row's corner, whole (owner 2026-10-08): no padding around it; the text keeps its inset.
                <section key={line.id} aria-label="Product" data-testid="pick-order-product" className="flex items-start gap-3 bg-surface-card">
                  <RecordSquarePhoto
                    url={line.photoUrl}
                    size="xl"
                    alt={line.title}
                    fit="natural"
                    onOpen={
                      line.photoUrl
                        ? () => {
                            setViewerPhoto(line.photoUrl);
                            setViewerOpen(true);
                          }
                        : undefined
                    }
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1 py-2 pr-mode-page">
                    <p className="break-words text-2xl font-semibold leading-tight text-text-default">{line.title}</p>
                    {/* The list card's facts, the same painter: ×qty first, then condition · price. */}
                    <RecordLineFacts
                      line={line}
                      columns={OUTBOUND_TRIAGE_VIEW.facts}
                      className="text-role-body"
                    />
                    {line.alertNote ? <p className="text-role-caption font-medium text-text-danger">{line.alertNote}</p> : null}
                  </div>
                </section>
              ))}

              {/* Only once picked (owner 2026-10-08): the staff bubble, the name and when — no "Not picked" empty state. */}
              {c.picked ? (
                <DetailFacts label="Pick">
                  <DetailFact
                    label="Picked by"
                    value={<PickedByFace staffId={c.picked.byId} name={c.picked.byName} at={c.picked.at} />}
                  />
                </DetailFacts>
              ) : null}

              <Disclosure label="More order details" testId="pick-order-details">
                <DetailFacts label="Order details">
                  <DetailFact label="Buyer" value={details?.buyerName} />
                  <DetailFact
                    label="Platform"
                    value={
                      details?.channel ? (
                        <span className="inline-flex items-center gap-1.5">
                          {details.channel.dot}
                          {details.channel.label}
                          {details.channel.badge ? <Badge variant="outline">{details.channel.badge}</Badge> : null}
                        </span>
                      ) : null
                    }
                  />
                  <DetailFact label="Order" value={card.orderId} mono copy={card.orderId} />
                  <DetailFact
                    label="Ship by"
                    value={details ? <span className={RECORD_DEADLINE_TONE_CLASS[details.shipBy.tone]}>{details.shipBy.face}</span> : null}
                    hint={details?.shipBy.tip ?? undefined}
                  />
                  <DetailFact label="Tracking" value={card.tracking} mono copy={card.tracking} />
                  <DetailFact label="SKU" value={card.sku} mono copy={card.sku} />
                  {details?.buyerNote ? <DetailFact label="Buyer note" value={details.buyerNote} /> : null}
                  {card.inlineMicrocopy ? <DetailFact label="Scan note" value={card.inlineMicrocopy} /> : null}
                </DetailFacts>
              </Disclosure>

              {/* The staff note in sight, between the order's details and its serials (owner 2026-10-08): one row,
                  no heading band, nothing at all when there is no note. */}
              {details?.staffNote ? (
                <DetailFacts label="Staff note">
                  <DetailFact label="Staff note" value={details.staffNote} />
                </DetailFacts>
              ) : null}

              <DetailSectionHeading>
                Serials · {card.serialNumbers.length} of {qty} scanned
              </DetailSectionHeading>
              {c.serialRows.length === 0 ? (
                <p className="bg-mode-panel px-mode-page py-2.5 text-role-body text-mode-muted">
                  {c.tasksLoading ? 'Loading allocated units…' : 'No unit allocated — scan the serial in hand.'}
                </p>
              ) : (
                <PickSerialList
                  rows={c.serialRows}
                  busy={c.busy}
                  onRemove={(serial) => c.removeSerials([serial])}
                  onReplace={c.replaceSerial}
                />
              )}
            </div>
          )}
        </div>
        {card ? (
          <PickListingPill
            listingHref={details?.listingHref ?? null}
            canEdit={has('orders.create')}
            onEditItemNumber={() => setItemSheetOpen(true)}
          />
        ) : null}
      </div>

      {/* Feedback, right above the thumb. What to do next is the scan bar's own label. */}
      {message ? (
        <div className="shrink-0 px-mode-page pb-2">
          <Alert
            variant={MESSAGE_VARIANT[message.tone]}
            role={message.tone === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className="pr-12"
          >
            <AlertDescription className="text-role-data opacity-100">{message.text}</AlertDescription>
            <IconButton
              onClick={pairBin.error ? pairBin.dismissError : c.dismissMessage}
              ariaLabel="Dismiss"
              icon={<X className="h-4 w-4" />}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center"
            />
          </Alert>
        </div>
      ) : null}

      <div className="shrink-0">
        <MobileCaptureWindow
          label={pairBin.pairing ? 'Bin camera' : 'Pick camera'}
          collapsedLabel={scanLabel}
          status={pairBin.pairing ? `Pair ${lines[0]?.title ?? sku}` : card ? card.orderId : 'Order'}
          onDecode={pairBin.pairing ? (value) => void pairBin.pair(value) : c.handleScan}
          // Hand entry on the pick camera is a serial (or another identifier); a serial's last 8 is enough.
          manualLabel="Serial / identification"
          manualHint="Last 8 of the serial number"
          pending={c.busy || pairBin.busy ? 1 : 0}
          armRequest={pairBin.armRequest}
          // Pairing done, or the picker pressed Done on "Serial added": the camera goes away.
          disarmRequest={pairBin.disarmRequest + doneRequest}
          dedupMs={SCAN_DEDUP_MS}
          initiallyArmed={false}
          // The camera stands alone at the bottom (owner 2026-10-08): no dock under the lens or the typed
          // field; its check puts it away and the dock returns. While pairing, that check is the way out.
          onArmedChange={(armed) => {
            if (armed) return;
            if (pairBin.pairing) pairBin.cancel();
            // The camera's own check on "Serial added" is Done.
            if (c.added) c.finishAdded();
          }}
          resultContent={
            c.added && !pairBin.pairing ? (
              <PickSerialAddedPanel
                added={c.added}
                title={lines[0]?.title ?? card?.productTitle ?? ''}
                photoUrl={lines[0]?.photoUrl ?? null}
                onAddMore={c.addMore}
                onDone={() => {
                  c.finishAdded();
                  setDoneRequest((n) => n + 1);
                }}
              />
            ) : undefined
          }
          manualContent={
            pairBin.pairing ? (
              <PickPairManual
                busy={pairBin.busy}
                onPairTote={(tote) => void pairBin.pair(tote, 'tote')}
                onChooseLocation={pairBin.chooseLocation}
              />
            ) : undefined
          }
          collapsedFrame={(scan) => (
            <DetailDock label="Pick actions" verbs={verbs} onVerb={onVerb} size="glove" center={scan} />
          )}
        />
      </div>
      <PassPickSheet
        orderId={orderId}
        myStaffId={user?.staffId ?? null}
        open={passOpen}
        onOpenChange={setPassOpen}
        onPassed={(name) => {
          toast.success(`${card?.orderId ?? 'Order'} passed to ${name}`);
          // Passed: the order leaves my list, so the walk moves on without a write of its own.
          onSkip();
        }}
      />
      <MobileSwipePhotoViewer
        // The row paints the table-sized thumb; full screen asks the marketplace for its full-size rendition.
        slides={viewerPhoto ? [{ id: `pick-photo:${orderId}`, previewUrl: marketplaceFullUrl(viewerPhoto) ?? viewerPhoto }] : []}
        open={viewerOpen && viewerPhoto != null}
        onClose={() => setViewerOpen(false)}
      />
      <PairItemNumberSheet
        orderId={orderId}
        initial={details?.itemNumber ?? null}
        myStaffId={user?.staffId ?? null}
        open={itemSheetOpen}
        onOpenChange={setItemSheetOpen}
        onPaired={(itemNumber) => toast.success(`Item number ${itemNumber} paired to ${card?.orderId ?? 'the order'}`)}
      />
    </div>
  );
}

/** A full-width row that folds a block open under itself. */
function Disclosure({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        data-testid={`${testId}-toggle`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'ds-raw-button flex min-h-mode-hit w-full items-center justify-between gap-3 bg-mode-panel px-mode-page py-2.5 text-left text-mode-body font-semibold text-mode-ink',
          focusRing('control'),
        )}
      >
        {label}
        <ChevronDown className={cn('size-5 shrink-0 text-mode-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? <div className="border-t border-mode-rule">{children}</div> : null}
    </div>
  );
}
