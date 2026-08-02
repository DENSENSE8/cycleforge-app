'use client';

/**
 * One bench carton shot — the body for `shipping_label_photo`, `box_photo` AND
 * `packing_material`.
 *
 * ## Why one component for three steps
 *
 * The three differ in exactly one value: which aspect they capture. Three
 * near-identical files would be a fork by copy-paste — the kind that stays in
 * sync right up until someone fixes a bug in one of them.
 *
 * ## It captures `unbox_carton`, never `arrival_package`
 *
 * These are bench shots, taken after the box is open. `arrival_package` is the
 * pre-opening door photo and is the only stage the `require_one` receive gate
 * counts, precisely so that gate cannot be satisfied once the carton is opened.
 * A bench capture stamping it would void the control. The stage is hardcoded
 * here rather than threaded so there is no call site that can get it wrong.
 *
 * ## Two ways to satisfy it: shoot one, or name one that exists
 *
 * The camera is the default. Beside it, {@link CartonPhotoPairPanel} names an
 * existing carton shot — the recovery path for a photo that arrived with no
 * aspect (a phone capture launched from generic chrome), which otherwise could
 * never satisfy the step it obviously depicts. Naming is not ticking: the photo
 * is already on the carton, so nothing here can claim evidence that does not
 * exist.
 */

import { ReceivingPhotoButton } from '../ReceivingPhotoButton';
import { CartonPhotoPairPanel } from './CartonPhotoPairPanel';
import { photoAspectLabel } from '@/lib/photos/photo-aspects';
import type { UnboxStepBodyContext } from './types';

export function CartonPhotoStepBody({
  receivingId,
  staffId,
  aspect,
  poRef,
  poRouteRef,
}: UnboxStepBodyContext) {
  // An un-aspected carton photo step is a declaration bug. Render the pill
  // unscoped rather than crashing the bench mid-carton — the step simply will
  // not go done, which is visible, and the divergence guard fails CI so it never
  // reaches an operator in the first place.
  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-role-caption text-text-soft">
          {aspect ? `Photograph the ${photoAspectLabel(aspect).toLowerCase()}` : 'Photograph the carton'}
        </p>
        <div className="-my-0.5 shrink-0">
          <ReceivingPhotoButton
            receivingId={receivingId}
            staffId={Number(staffId) || 0}
            poRef={poRef ?? null}
            photoStage="unbox_carton"
            photoAspect={aspect ?? null}
            poRouteRef={poRouteRef ?? null}
            galleryPlacement="above"
          />
        </div>
      </div>
      <CartonPhotoPairPanel receivingId={receivingId} aspect={aspect ?? null} />
    </div>
  );
}
