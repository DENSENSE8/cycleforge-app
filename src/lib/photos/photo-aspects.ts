/** Photo ASPECT — the second axis of receiving evidence: */

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
  'condition',
  'front',
  'back',
  'side',
  'bottom',
] as const;

export type PhotoAspect = (typeof PHOTO_ASPECTS)[number];

/** Which aspects a stage may legally carry. */
export const ASPECTS_BY_STAGE: Record<PhotoEvidenceStage, readonly PhotoAspect[]> = {
  arrival_package: ['shipping_label', 'box_exterior'],
  unbox_carton: ['shipping_label', 'box_exterior', 'box_interior', 'packing_material'],
  unbox_item: ['included', 'serial', 'front', 'back', 'side', 'bottom'],
  testing: [],
  packing: ['serial', 'condition', 'front', 'back', 'side', 'bottom', 'included'],
};

const PHOTO_ASPECT_LABELS: Record<PhotoAspect, string> = {
  shipping_label: 'Shipping label',
  box_exterior: 'The box',
  box_interior: 'Inside the box',
  packing_material: 'Packing material',
  included: "What's included",
  serial: 'Serial',
  condition: 'Condition',
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

/** Parse a wire value (request body, query param, settings string). */
export function parsePhotoAspect(raw: string | null | undefined): PhotoAspect | null {
  const t = String(raw ?? '').trim().toLowerCase();
  return (PHOTO_ASPECTS as readonly string[]).includes(t) ? (t as PhotoAspect) : null;
}

/** Parse a comma/space-separated list (the `receiving.requiredItemPhotoAspects` org setting, the `?photoAspects=` query param). */
export function parsePhotoAspectList(raw: string | null | undefined): PhotoAspect[] {
  const out: PhotoAspect[] = [];
  for (const token of String(raw ?? '').split(/[,\s]+/)) {
    const aspect = parsePhotoAspect(token);
    if (aspect && !out.includes(aspect)) out.push(aspect);
  }
  return out;
}
