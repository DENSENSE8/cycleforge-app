/**
 * Photo ASPECT — the second axis of receiving evidence: *what does this shot
 * show*, within a stage.
 *
 * Sibling of `./stages.ts`, which it composes and never re-derives. Pure and
 * client-safe: no DB, no server-only imports.
 *
 * ## Why this is not a photo_type
 *
 * `photos.photo_type` encodes **entity legality** — it is the key of the
 * `WRITE_MATRIX` in `./stages.ts`, of the `require_one` policy gate
 * (`@/lib/receiving/photo-policy`), and of `photo_image_types.key`. Adding
 * `receiving_shipping_label`, `receiving_box_front`, … would fan that matrix
 * out by six and silently change what every existing filter, gallery and gate
 * counts. Aspect answers a different question and refines **within** a type,
 * so the two axes stay orthogonal:
 *
 *   stage  = which evidentiary moment (arrival · unbox carton · unbox item)
 *   aspect = which shot of that moment (shipping label · box · serial · …)
 *
 * ## Three rules, each already paid for in this codebase
 *
 *   1. **`parsePhotoAspect` returns `null` on an unknown value and has no
 *      default.** An aspect is a CLAIM about what a photo shows, so it is a
 *      safety classification in the sense of `.claude/rules/backend-patterns.md`
 *      — and a defaulted classification is the bug that shipped twice here
 *      (`intakeSurface` defaulting to `'triage'`, `scanKind` defaulting to
 *      `'work'`). A caller that cannot name the aspect must send none.
 *   2. **Aspect is nullable everywhere.** `NULL` is legal and is what every
 *      pre-existing row carries. It means *unclassified evidence*, never
 *      *missing evidence* — a receipt says "3 photos" for it, not "step
 *      incomplete".
 *   3. **Labels come from here.** No call site types "Shipping label".
 *
 * The DB half is `photos.photo_aspect` (nullable TEXT + named CHECK, migration
 * `2026-08-01b_photo_aspect.sql`). `photo-aspect-vocabulary.guard.test.ts`
 * asserts this union and that CHECK list are identical.
 */

import type { PhotoEvidenceStage } from './stages';

export const PHOTO_ASPECTS = [
  // carton-stage shots
  'shipping_label',
  'box_exterior',
  'box_interior',
  'packing_material',
  // item-stage shots
  'included',
  'serial',
  'front',
  'back',
  'side',
  'bottom',
] as const;

export type PhotoAspect = (typeof PHOTO_ASPECTS)[number];

/**
 * Which aspects a stage may legally carry.
 *
 * `arrival_package` deliberately carries only the two pre-opening shots: it is
 * the door/Triage stage and the only one the `require_one` receive gate counts,
 * so an interior or item aspect landing there would describe a photo taken
 * after the box was open (see `@/lib/receiving/photo-intent` →
 * `receivingUploadStage`).
 *
 * `testing` and `packing` carry no aspect vocabulary yet — an aspect on one of
 * those stages is illegal rather than unclassified, because nothing writes one.
 * Give them a vocabulary the day a station needs it; do not widen this to make
 * a caller compile.
 */
export const ASPECTS_BY_STAGE: Record<PhotoEvidenceStage, readonly PhotoAspect[]> = {
  arrival_package: ['shipping_label', 'box_exterior'],
  unbox_carton: ['shipping_label', 'box_exterior', 'box_interior', 'packing_material'],
  unbox_item: ['included', 'serial', 'front', 'back', 'side', 'bottom'],
  testing: [],
  packing: [],
};

const PHOTO_ASPECT_LABELS: Record<PhotoAspect, string> = {
  shipping_label: 'Shipping label',
  box_exterior: 'The box',
  box_interior: 'Inside the box',
  packing_material: 'Packing material',
  included: "What's included",
  serial: 'Serial',
  front: 'Front',
  back: 'Back',
  side: 'Side',
  bottom: 'Bottom',
};

export function photoAspectLabel(aspect: PhotoAspect): string {
  return PHOTO_ASPECT_LABELS[aspect];
}

export function isAspectLegalForStage(aspect: PhotoAspect, stage: PhotoEvidenceStage): boolean {
  return ASPECTS_BY_STAGE[stage].includes(aspect);
}

/**
 * Parse a wire value (request body, query param, settings string).
 *
 * Unknown → `null`, and there is deliberately **no fallback aspect**. See rule 1
 * in the module doc: the caller that could not name the shot must be told, not
 * quietly given one.
 */
export function parsePhotoAspect(raw: string | null | undefined): PhotoAspect | null {
  const t = String(raw ?? '').trim().toLowerCase();
  return (PHOTO_ASPECTS as readonly string[]).includes(t) ? (t as PhotoAspect) : null;
}

/**
 * Parse a comma/space-separated list (the `receiving.requiredItemPhotoAspects`
 * org setting, the `?photoAspects=` query param).
 *
 * Unknown entries are DROPPED, not defaulted — same reasoning as
 * {@link parsePhotoAspect}, one level up. Order is preserved and duplicates are
 * collapsed, so a settings string is a set and reads back the way it was typed.
 */
export function parsePhotoAspectList(raw: string | null | undefined): PhotoAspect[] {
  const out: PhotoAspect[] = [];
  for (const token of String(raw ?? '').split(/[,\s]+/)) {
    const aspect = parsePhotoAspect(token);
    if (aspect && !out.includes(aspect)) out.push(aspect);
  }
  return out;
}
