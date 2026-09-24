/**
 * Arrival mobile flow SoT — classify step URLs + parse helpers for the door
 * Station (`/m/triage`): scan → guided photos → Platform → Type → Priority.
 *
 * Pure + client-safe. Photos deep-links compose {@link mobileArrivalGuidedPhotosHref}.
 */

import { mobileArrivalGuidedPhotosHref } from '@/lib/receiving/photo-scope';

export const ARRIVAL_CLASSIFY_STEPS = ['platform', 'type', 'priority'] as const;
export type ArrivalClassifyStep = (typeof ARRIVAL_CLASSIFY_STEPS)[number];

/** Parse `?step=` for the Arrival classify host. Unknown → platform. */
export function parseArrivalClassifyStep(
  raw: string | null | undefined,
): ArrivalClassifyStep {
  const t = String(raw ?? '').trim().toLowerCase();
  return (ARRIVAL_CLASSIFY_STEPS as readonly string[]).includes(t)
    ? (t as ArrivalClassifyStep)
    : 'platform';
}

/** Parse `?rid=` — invalid → null. */
export function parseArrivalReceivingId(
  raw: string | null | undefined,
): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The triage decision a row verb carries into the flow (`?type=`). A HINT, not
 * a write: the Type step marks it as the selection and the operator still taps
 * to save, so the verb never records anything the flow would not.
 */
export const ARRIVAL_TYPE_HINTS = ['RETURN', 'REPAIR'] as const;
export type ArrivalTypeHint = (typeof ARRIVAL_TYPE_HINTS)[number];

/** Parse `?type=` — anything outside {@link ARRIVAL_TYPE_HINTS} → null. */
export function parseArrivalTypeHint(raw: string | null | undefined): ArrivalTypeHint | null {
  const t = String(raw ?? '').trim().toUpperCase();
  return (ARRIVAL_TYPE_HINTS as readonly string[]).includes(t) ? (t as ArrivalTypeHint) : null;
}

/** Classify host URL on `/m/scan`. */
export function mobileArrivalClassifyHref(
  receivingId: number,
  step: ArrivalClassifyStep = 'platform',
  opts: { type?: ArrivalTypeHint | null } = {},
): string {
  const params = new URLSearchParams({
    rid: String(receivingId),
    step,
  });
  if (opts.type) params.set('type', opts.type);
  return `/m/scan?${params.toString()}`;
}

/**
 * Guided arrival photos whose Done lands on Platform classify.
 * `back` always points at the classify entry (not the bare list).
 */
export function mobileArrivalPhotosThenClassifyHref(
  receivingId: number,
  opts: { title?: string | null } = {},
): string {
  return mobileArrivalGuidedPhotosHref(receivingId, {
    back: mobileArrivalClassifyHref(receivingId, 'platform'),
    title: opts.title,
  });
}

export function nextArrivalClassifyStep(
  step: ArrivalClassifyStep,
): ArrivalClassifyStep | null {
  const i = ARRIVAL_CLASSIFY_STEPS.indexOf(step);
  if (i < 0 || i >= ARRIVAL_CLASSIFY_STEPS.length - 1) return null;
  return ARRIVAL_CLASSIFY_STEPS[i + 1]!;
}

export function prevArrivalClassifyStep(
  step: ArrivalClassifyStep,
): ArrivalClassifyStep | null {
  const i = ARRIVAL_CLASSIFY_STEPS.indexOf(step);
  if (i <= 0) return null;
  return ARRIVAL_CLASSIFY_STEPS[i - 1]!;
}

export function arrivalClassifyStepIndex(step: ArrivalClassifyStep): number {
  return Math.max(0, ARRIVAL_CLASSIFY_STEPS.indexOf(step));
}
