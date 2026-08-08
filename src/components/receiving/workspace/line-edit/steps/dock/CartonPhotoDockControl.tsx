'use client';

/**
 * Dock control for the three bench carton shots — `shipping_label_photo`,
 * `box_photo` and `packing_material`.
 *
 * Two ways to satisfy the step, both at the operator's hand:
 *
 *   • **shoot one** — the carton camera pill, scoped to this step's aspect;
 *   • **link one that exists** — a popover over the carton's bench photos, for
 *     a shot that arrived with no aspect (a phone capture launched from generic
 *     chrome) and could otherwise never satisfy the step it depicts.
 *
 * ## Why the picker is a popover and not a list in the band
 *
 * The dock is a fixed band floating over the canvas; a list inside it would
 * either grow the band (pushing the deck's clearance out from under it) or
 * scroll inside a 40px strip. It opens UPWARD, over the work surface, because
 * the band is at the bottom of the viewport and a downward panel would be
 * off-screen.
 *
 * ## One component for three steps
 *
 * They differ in exactly one value — which aspect they capture. Three
 * near-identical files would be the fork by copy-paste that stays in sync right
 * up until someone fixes a bug in one of them. Same call as the body sibling.
 */

import { useRef, useState } from 'react';
import { Images } from '@/components/Icons';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { Button, Popover } from '@/design-system/primitives';
import { ReceivingPhotoButton } from '../../ReceivingPhotoButton';
import { CartonPhotoPairPanel } from '../CartonPhotoPairPanel';
import { photoAspectLabel } from '@/lib/photos/photo-aspects';
import type { UnboxStepDockContext } from './types';

function handFocusBack() {
  setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
}

export function CartonPhotoDockControl({
  receivingId,
  staffId,
  aspect,
  poRef,
  poRouteRef,
}: UnboxStepDockContext) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [pairOpen, setPairOpen] = useState(false);

  return (
    <div className="flex h-11 min-w-0 items-center gap-1" data-unbox-carton-photo-dock>
      {/* No prose prompt. It read as a sentence in a control strip once this
          moved inside the composer footer, and the cue line directly above the
          dock already names the step and reports what it holds. An un-aspected
          carton step is a declaration bug the divergence guard fails in CI, so
          the aspect only has to survive as the accessible label here. */}
      <div ref={anchorRef} className="shrink-0">
        <Button
          variant="ghost"
          size="sm"
          icon={<Images className="h-3.5 w-3.5" />}
          aria-expanded={pairOpen}
          ariaLabel={
            aspect
              ? `Link an existing photo of the ${photoAspectLabel(aspect).toLowerCase()}`
              : 'Link an existing carton photo'
          }
          onClick={() => setPairOpen((v) => !v)}
        >
          Link a photo
        </Button>
      </div>

      <div
        className="-my-0.5 shrink-0"
        onClick={() => handFocusBack()}
      >
        <ReceivingPhotoButton
          receivingId={receivingId}
          staffId={Number(staffId) || 0}
          poRef={poRef ?? null}
          // Bench shots are `unbox_carton`, never `arrival_package` — that is
          // the pre-opening door stage and the only one the `require_one`
          // receive gate counts. Hardcoded so no call site can get it wrong.
          photoStage="unbox_carton"
          photoAspect={aspect ?? null}
          poRouteRef={poRouteRef ?? null}
          galleryPlacement="above"
        />
      </div>

      <Popover
        open={pairOpen}
        onClose={() => {
          setPairOpen(false);
          handFocusBack();
        }}
        anchorRef={anchorRef}
        // Upward: the dock is pinned to the bottom of the viewport, so a
        // `bottom-*` panel would open off-screen.
        placement="top-end"
        className="w-[22rem] max-w-[90vw]"
      >
        <CartonPhotoPairPanel
          receivingId={receivingId}
          aspect={aspect ?? null}
          onPaired={() => {
            setPairOpen(false);
            handFocusBack();
          }}
        />
      </Popover>
    </div>
  );
}
