'use client';

/**
 * The Arrival Card — the render half of `@/lib/scan/arrival-card`.
 *
 * A carton lands at the door, the gun reads somebody else's label, and this is
 * the whole screen the phone opens: *do I open this now, or does it go on the
 * rack?* The shape is the plan's, top to bottom, and nothing else:
 *
 *   header → the object → 1–3 facts → two photo slots → ONE primary verb with
 *   its reason, and one secondary.
 *
 * **Every word here is the model's.** The title comes from `arrivalTitle`, the
 * facts and the two actions come from `arrivalCardModel`. This component
 * formats nothing it could ask for — a second spelling of `Arrival · {carrier}
 * {last4}` beside the pure one is how the Stack starts showing an operator two
 * rows for one carton.
 *
 * **One primary, always.** `arrivalRecommendation` preselects exactly one verb
 * and offers the loser beside it; the Card paints that decision and does not
 * add a third door. No toast, no dialog, no second textarea — a state-changing
 * scan lands as a card the operator can still read with their eyes on the
 * carton (`display/station.md` §6).
 *
 * Plan: docs/warehouse-os/PLAN-scan-shell-mobile.md → the phone in one screen.
 */

import { useCallback } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import {
  arrivalCardModel,
  arrivalTitle,
  type ArrivalPhotoSlot,
} from '@/lib/scan/arrival-card';
import type { ScanRoute } from '@/lib/barcode-routing';

export interface ArrivalCardProps {
  /** The scanned string itself, printed so it can be matched against the label. */
  tracking: string;
  /** `UPS` · `FedEx` · … — the carrier the route decoded, already in hand. */
  carrier: string;
  /** Who sent it, when an inbound record or the carrier account names them. */
  seller?: string;
  /** Cartons announced on this inbound. */
  expectedCartons: number;
  /** Cartons of that inbound already through the door, this one included. */
  arrivedCartons: number;
  /** Pending orders that would be filled by what is in this carton. */
  pendingOrdersForCarton: number;
  /** False when the rack has no free slot — then racking is not a destination. */
  rackHasSpace: boolean;
  onUnboxNow: () => void;
  onRack: () => void;
  onPhotos: (files: File[]) => void;
}

/**
 * The two props that decode a carrier label, handed back to the pure module as
 * the route it would have produced.
 *
 * The caller has already routed this scan — that is how it knows the carrier —
 * so re-parsing the string here would run the same decode twice and let the two
 * answers drift. `arrivalTitle` / `arrivalCardModel` accept a `ScanRoute` for
 * exactly this reason.
 */
function routeFromProps(tracking: string, carrier: string): ScanRoute {
  return {
    type: 'carrier-tracking',
    value: tracking,
    carrier: carrier as ScanRoute['carrier'],
  };
}

/**
 * One photo slot — the label, or the box.
 *
 * Its own component because `usePhotoDropzone` is a hook and the two slots are
 * two dropzones, not one dropzone rendered twice: a drag over the Box slot must
 * not light up the Label slot's frame.
 */
function ArrivalPhotoSlotBox({
  slot,
  onPhotos,
}: {
  slot: ArrivalPhotoSlot;
  onPhotos: (files: File[]) => void;
}) {
  const dz = usePhotoDropzone(onPhotos, { paste: false });

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-role-caption font-semibold uppercase tracking-wider text-text-muted">
        {slot.label}
      </span>
      <button
        type="button"
        {...dz.rootProps}
        onClick={dz.openPicker}
        aria-label={`Add a photo of ${slot.hint}`}
        className={cn(
          'ds-raw-button flex w-full flex-col items-center justify-center gap-1 border border-dashed px-2 py-6 text-center',
          cornerClass('field'),
          dz.isDragging
            ? 'border-border-strong bg-surface-hover'
            : 'border-border-emphasis bg-surface-canvas',
        )}
      >
        <span className="text-role-caption font-medium text-text-muted">{slot.hint}</span>
      </button>
      {/* Sibling, not a child of the button: `openPicker` synthesises a click on
          this input, and from inside the button that click would bubble back
          into `onClick` and re-open the picker forever. */}
      <input {...dz.inputProps} ref={dz.inputRef} />
    </div>
  );
}

/**
 * Render the Arrival Card for one never-seen tracking number.
 *
 * Returns `null` when the pure model refuses the scan — the dispatch table owns
 * that judgement, and a Card mounted on the wrong scan should show nothing
 * rather than a plausible screen.
 */
export function ArrivalCard({
  tracking,
  carrier,
  seller,
  expectedCartons,
  arrivedCartons,
  pendingOrdersForCarton,
  rackHasSpace,
  onUnboxNow,
  onRack,
  onPhotos,
}: ArrivalCardProps) {
  const route = routeFromProps(tracking, carrier);

  // `rackHasSpace` is the boolean an operator surface actually has; the model
  // reasons in free slots, and `0` is the only value that means "full".
  const card = arrivalCardModel({
    scan: route,
    supplier: seller ?? null,
    cartonsExpected: expectedCartons,
    pendingOrdersForCarton,
    rackCapacity: rackHasSpace ? 1 : 0,
  });

  const handlePhotos = useCallback((files: File[]) => onPhotos(files), [onPhotos]);

  if (!card) return null;

  const title = arrivalTitle(route) ?? card.header.title;
  const [primary, secondary] = card.recommendation.actions;
  const runVerb = (verb: typeof primary.verb) => (verb === 'unbox' ? onUnboxNow : onRack);

  return (
    <section
      aria-label={title}
      className={cn(
        'flex w-full flex-col gap-3 border border-border-soft bg-surface-card p-3',
        cornerClass('card'),
      )}
    >
      {/* Header — the armed session's own title, not a second spelling of it. */}
      <h2 className="text-base font-bold tracking-tight text-text-default">{title}</h2>

      {/* The object. The tracking number is mono and truncates from the FRONT:
          a carrier number's identity lives in its last digits, so an ellipsis
          belongs at the head. The carton count rides beside it — it is which
          box this is, not a fourth fact. */}
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-role-data text-text-muted" dir="rtl">
          {card.tracking}
        </span>
        {expectedCartons > 0 && (
          <span className="shrink-0 text-role-caption font-semibold tabular-nums text-text-faint">
            carton {arrivedCartons} of {expectedCartons}
          </span>
        )}
      </div>

      {/* One to three facts. Two an operator can act on beat six they scroll past. */}
      <dl className="flex flex-col gap-1">
        {card.facts.map((fact) => (
          <div key={fact.label} className="flex items-baseline gap-2">
            <dt className="w-20 shrink-0 text-role-caption font-semibold uppercase tracking-wider text-text-faint">
              {fact.label}
            </dt>
            <dd className="min-w-0 flex-1 text-role-data text-text-default">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {/* Two inputs, not a gallery: the label and the box. */}
      <div className="flex gap-2">
        {card.photos.map((slot) => (
          <ArrivalPhotoSlotBox key={slot.kind} slot={slot} onPhotos={handlePhotos} />
        ))}
      </div>

      {/* ONE primary verb with its reason, and one secondary. The recommendation
          is preselected, never enforced — the loser is offered beside it. */}
      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={runVerb(primary.verb)}
          data-arrival-verb={primary.verb}
        >
          {primary.label}
        </Button>
        <p className="text-role-caption text-text-muted">{primary.reason}</p>
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={runVerb(secondary.verb)}
          data-arrival-verb={secondary.verb}
        >
          {secondary.label}
        </Button>
      </div>
    </section>
  );
}

export default ArrivalCard;
