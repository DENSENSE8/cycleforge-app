'use client';

/**
 * The `label` step body — read the face this carton is about to print, and say
 * so.
 *
 * ## There is ONE label surface, and this is it
 *
 * The preview used to render as a sibling BELOW the procedure column, which is
 * how it came to slide under the composer dock: it was outside the stack the
 * dock reserves clearance for. Folding it into its own step fixes the overlap
 * and answers the question the sibling could not — *when* in the job is the
 * operator supposed to look at this? Right before the dock prints it.
 *
 * `print` stays a COMMIT step on the terminal dock. This step is the reading;
 * that one is the act.
 *
 * ## The acknowledgement is the fact — and its button is in the DOCK
 *
 * Every other capture step derives from evidence the carton carries — a photo at
 * a stage and aspect, a serial, a grade. Reading a label leaves nothing behind,
 * so `receiving_line_testing.label_previewed_at` records the only fact there is:
 * a person looked at this face and said it was right. Same shape as
 * `contents_confirmed_at`.
 *
 * That is NOT the hand-ticked checklist deleted 2026-08-01. That list let an
 * operator tick "photographed the packing material" — a claim about EVIDENCE the
 * carton can answer for itself, and therefore must. Nothing here claims evidence
 * exists.
 *
 * Ruled 2026-08-02: a step card carries no action button, so *Face is right* /
 * *Reopen* render in the bottom dock ({@link LabelDockControl}). This body is the
 * face itself — the thing being read. Which is the honest split: the card is what
 * you look at, the dock is what you press once you have.
 */

import type { UnboxStepBodyContext } from './types';

export function LabelStepBody({ labelSlot }: UnboxStepBodyContext) {
  return (
    <>
      {labelSlot ?? (
        <p className="text-role-caption text-text-soft">No label face for this line yet.</p>
      )}
    </>
  );
}
