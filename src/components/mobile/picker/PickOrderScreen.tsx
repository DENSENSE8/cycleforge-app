'use client';

/**
 * One order of the `/m/pick` walk on the scan card: the desk's pick flow on
 * the phone. The first serial / SKU scan picks the order (anchored on the
 * order — pickup orders have no label); Skip moves the walk on without a
 * write; once the order is in hand the walk advances (`onPicked`). Pair bin /
 * Update location lifts the same camera to name the SKU's bin
 * ({@link usePairBin}). The bottom bar is the flush terminal block — an
 * `industrial` action region (BRIEF §14: industrial is the phone's action
 * surface) — edge to edge, square cells.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown, ExternalLink, MapPin, RotateCcw, X } from '@/components/Icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DetailFact, DetailFacts, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { Button, IconButton } from '@/design-system/primitives';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_DEADLINE_TONE_CLASS } from '@/design-system/tokens/record-card';
import { cn } from '@/utils/_cn';
import { Badge } from '@/components/ui/badge';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { RecordSquarePhoto } from '@/design-system/components/record-card/RecordCardMobile';
import { RecordLineFacts } from '@/design-system/components/record-card/record-fact';
import type { RecordCardDeadline, RecordCardLine, RecordCardMobileModel } from '@/design-system/components/record-card/record-card-types';
import { OUTBOUND_TRIAGE_VIEW } from '@/lib/triage/views';
import { PickProgress } from './PickProgress';
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
  /** The shown line's marketplace listing (`orderCardModel.listingHref`); null → no listing button. */
  listingHref: string | null;
  /** False → the listing opens another platform's storefront than the order's: the button greys out. */
  listingMatchesOrder: boolean;
}

type PickVerb = 'undo' | 'bin';

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
  /** The order's resolved bin (the list card's); null → the verb reads 'Pair bin'. */
  bin: string | null;
  onPicked: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const c = usePickOrder({ orderId, onPicked });
  /** The lens is up — the dock then stands alone under the panel instead of framing the Scan bar. */
  const [cameraUp, setCameraUp] = useState(false);
  const { card } = c;
  const sku = String(card?.sku ?? '').trim();
  const pairBin = usePairBin({ sku, returnHref: `/m/pick?order=${orderId}` });

  if (!c.isLoaded || !c.signedIn) return null;

  const qty = Math.max(1, Number(card?.quantity) || 1);
  const toPick = c.serialRows.filter((r) => r.state === 'to-pick').length;
  const scanLabel = pairBin.pairing
    ? pairBin.busy
      ? 'Pairing…'
      : 'Scan bin to pair'
    : c.busy
    ? 'Saving…'
    : c.preview
      ? 'Scan serial or SKU'
      : !c.live
        ? 'Scan serial or SKU to re-pick'
        : toPick > 0
          ? `Scan serial · ${toPick} left`
          : 'Scan serial or SKU';

  const verbs: DetailDockVerb<PickVerb>[] = [
    { id: 'undo', label: 'Undo', icon: <RotateCcw className="h-5 w-5" aria-hidden />, disabled: !c.live || c.busy },
    // The SKU's bin, where Unpick used to sit (owner 2026-09-29): pair it when unknown, update it when known —
    // on the camera; pressed again while the camera waits for the bin, it cancels.
    {
      id: 'bin',
      label: pairBin.pairing ? 'Cancel pairing' : bin ? 'Update location' : 'Pair bin',
      icon: pairBin.pairing ? <X className="h-5 w-5" aria-hidden /> : <MapPin className="h-5 w-5" aria-hidden />,
      disabled: !sku || c.busy || pairBin.busy,
      testId: 'pick-order-bin',
    },
  ];
  const onVerb = (id: PickVerb) => (id === 'undo' ? c.undo() : pairBin.pairing ? pairBin.cancel() : pairBin.start());
  const message: PickOrderMessage | null = pairBin.error ? { tone: 'error', text: pairBin.error } : c.message;

  return (
    <div className={cn('flex h-full flex-col', appMobilePageGroundClass)} data-testid="pick-order">
      <PickProgress
        picked={progress.picked}
        total={progress.total}
        active={active ?? undefined}
        onClose={onBack}
        onSkip={onSkip}
        skipDisabled={c.busy}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className={cn('flex-1 overflow-y-auto', details?.listingHref && 'pb-20')}>
          {!card ? (
            c.message ? null : (
              <p className="px-mode-page py-10 text-center text-role-body text-text-muted" aria-live="polite">
                Opening the order…
              </p>
            )
          ) : (
            <div className={cn('mx-mode-page my-3 divide-y divide-mode-rule overflow-hidden border border-mode-rule', cornerClass('surface'))}>
              {(lines.length > 0
                ? lines
                : [{ id: 0, title: card.productTitle, photoUrl: null, facts: { qty: { kind: 'qty' as const, value: qty } }, alert: false, alertNote: null }]
              ).map((line) => (
                <section key={line.id} aria-label="Product" data-testid="pick-order-product" className="flex items-start gap-3 bg-surface-card px-mode-page py-2">
                  <RecordSquarePhoto url={line.photoUrl} size="xl" alt={line.title} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
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

              <DetailFacts label="Pick">
                <DetailFact
                  label="Picked"
                  value={c.picked ? 'Picked' : 'Not picked'}
                  hint={c.picked?.byName ?? (card.orderFound === false ? 'Order not in system' : undefined)}
                />
              </DetailFacts>

              <Disclosure label="More order details" testId="pick-order-details">
                <DetailFacts label="Order details">
                  <DetailFact label="Buyer" value={details?.buyerName} />
                  <DetailFact
                    label="Channel"
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
                  {details?.staffNote ? <DetailFact label="Notes" value={details.staffNote} /> : null}
                  {card.inlineMicrocopy ? <DetailFact label="Scan note" value={card.inlineMicrocopy} /> : null}
                </DetailFacts>
              </Disclosure>

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
        {/* The listing, one tap away (owner 2026-09-29): a white pill with a soft grey shadow floating
            over the content, centred on the dock's Pair bin cell (Undo · Scan · Pair bin) —
            "Listing" with the external-link glyph at its right; opens the marketplace in a new tab.
            A listing on another platform than the order's (an eBay order → the Ecwid store) would open
            the wrong page, so it greys out instead of linking. */}
        {details?.listingHref ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 grid grid-cols-3">
            <Button
              href={details.listingMatchesOrder ? details.listingHref : undefined}
              disabled={!details.listingMatchesOrder}
              variant="secondary"
              size="lg"
              radius="pill"
              iconRight={<ExternalLink />}
              ariaLabel={details.listingMatchesOrder ? 'View listing' : "Listing unavailable — it would open another platform's store"}
              data-testid="pick-order-listing"
              className={cn('pointer-events-auto col-start-3 justify-self-center border-0 bg-surface-card px-5 font-semibold ring-0', elevationClass('raised'))}
            >
              Listing
            </Button>
          </div>
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

      <ModeRegion mode="industrial" className="shrink-0">
        <MobileCaptureWindow
          label={pairBin.pairing ? 'Bin camera' : 'Pick camera'}
          collapsedLabel={scanLabel}
          status={pairBin.pairing ? `Bin for ${lines[0]?.title ?? sku}` : card ? card.orderId : 'Order'}
          onDecode={pairBin.pairing ? (value) => void pairBin.pair(value) : c.handleScan}
          pending={c.busy || pairBin.busy ? 1 : 0}
          armRequest={pairBin.armRequest}
          dedupMs={SCAN_DEDUP_MS}
          initiallyArmed={false}
          onArmedChange={setCameraUp}
          collapsedFrame={(scan) => (
            <DetailDock label="Pick actions" verbs={verbs} onVerb={onVerb} size="glove" center={scan} />
          )}
        />
        {cameraUp ? <DetailDock label="Pick actions" verbs={verbs} onVerb={onVerb} size="glove" /> : null}
      </ModeRegion>
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
