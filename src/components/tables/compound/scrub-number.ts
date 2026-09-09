/**
 * Figma-style number-field math: the POINTER'S delta-X is the increment,
 * not position-on-a-track. `ScrubSlider` maps clientX onto min–max on a
 * bar — that is a different job, and it does not belong under a title.
 *
 * 1px of travel = 1× `step` (Shift = coarse, Control = fine / critical).
 * Fine drag is damped (`SUBTITLE_SCRUB_FINE_PX`) so small left/right moves
 * stay near the origin. Alt still aliases Control. Releasing Control parks
 * the origin and keeps the fine band for `SUBTITLE_SCRUB_FINE_GRACE_MS` —
 * the pointer is still displaced ("under the slider"), and that leftover
 * travel must not become dollars. The painted face stays in the DOM while
 * the cursor also carries the live value.
 */

import { formatCurrency } from '@/utils/_number';
import type { CompoundSubtitleScrub } from './compound-row-model';

/** Arm before a click becomes a scrub — tighter than subtitle reorder (6px). */
export const SUBTITLE_SCRUB_ARM_PX = 3;

/**
 * Pixels of Control-drag per fine step. Default drag is 1px = `step`; fine
 * needs this many pixels for one `fineStep` so the value stays near center.
 */
export const SUBTITLE_SCRUB_FINE_PX = 8;

/**
 * After Control-up, keep the fine band this long. The pointer is still
 * where the damped drag left it; dollar scale would jump the price.
 */
export const SUBTITLE_SCRUB_FINE_GRACE_MS = 320;

export type ScrubPointerMods = { shift: boolean; ctrl: boolean; alt?: boolean };

export function scrubPointerMods(event: {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): ScrubPointerMods {
  return { shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey };
}

export function isScrubFine(
  mods: ScrubPointerMods,
  scrub: Pick<CompoundSubtitleScrub, 'fineStep'>,
): boolean {
  return Boolean((mods.ctrl || mods.alt) && scrub.fineStep != null);
}

/** Host attribute. Subtitle reorder must not steal this pointer. */
export const SUBTITLE_SCRUB_ATTR = 'data-subtitle-scrub';

export function subtitleScrubShouldArm(dx: number): boolean {
  return Math.abs(dx) >= SUBTITLE_SCRUB_ARM_PX;
}

export function subtitleReorderIgnoresScrubTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  return Boolean(target.closest(`[${SUBTITLE_SCRUB_ATTR}]`));
}

export function parseScrubOrigin(raw: string): number {
  const n = Number(String(raw).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function scrubTravel(
  scrub: Pick<CompoundSubtitleScrub, 'step' | 'coarseStep' | 'fineStep'>,
  mods: ScrubPointerMods,
): number {
  if (isScrubFine(mods, scrub)) return scrub.fineStep as number;
  if (mods.shift) return scrub.coarseStep;
  return scrub.step;
}

export function snapScrubValue(
  n: number,
  decimals: number,
  min?: number,
  max?: number,
): number {
  const factor = 10 ** decimals;
  let next = Math.round((n + Number.EPSILON) * factor) / factor;
  if (min != null && next < min) next = min;
  if (max != null && next > max) next = max;
  return next;
}

export function scrubValueFromDelta(
  origin: number,
  dxPx: number,
  travel: number,
  decimals: number,
  min?: number,
  max?: number,
  /** >1 stretches pointer travel (Control fine drag). Keyboard nudges omit this. */
  pixelDivisor = 1,
): number {
  const steps = pixelDivisor > 1 ? Math.trunc(dxPx / pixelDivisor) : Math.round(dxPx);
  return snapScrubValue(origin + steps * travel, decimals, min, max);
}

export function liveScrubFromPointer(
  origin: number,
  dxPx: number,
  scrub: CompoundSubtitleScrub,
  mods: ScrubPointerMods,
): number {
  const travel = scrubTravel(scrub, mods);
  const divisor = isScrubFine(mods, scrub) ? SUBTITLE_SCRUB_FINE_PX : 1;
  return scrubValueFromDelta(origin, dxPx, travel, scrub.decimals, scrub.min, scrub.max, divisor);
}

export type ScrubFrame = {
  originX: number;
  originValue: number;
  lastX: number;
  lastHeldFine: boolean;
  fineUntil: number;
  live: number;
};

export function startScrubFrame(
  clientX: number,
  originValue: number,
  mods: ScrubPointerMods,
  scrub: Pick<CompoundSubtitleScrub, 'fineStep'>,
): ScrubFrame {
  return {
    originX: clientX,
    originValue,
    lastX: clientX,
    lastHeldFine: isScrubFine(mods, scrub),
    fineUntil: 0,
    live: originValue,
  };
}

export function continueScrubOrigin(args: {
  originX: number;
  originValue: number;
  fineUntil: number;
  pointerX: number;
  liveValue: number;
  wasHeldFine: boolean;
  heldFine: boolean;
  now: number;
}): { originX: number; originValue: number; fineUntil: number } {
  const { originX, originValue, fineUntil, pointerX, liveValue, wasHeldFine, heldFine, now } = args;
  if (heldFine && wasHeldFine) return { originX, originValue, fineUntil: 0 };
  if (heldFine && !wasHeldFine) {
    return { originX: pointerX, originValue: liveValue, fineUntil: 0 };
  }
  if (!heldFine && wasHeldFine) {
    return {
      originX: pointerX,
      originValue: liveValue,
      fineUntil: now + SUBTITLE_SCRUB_FINE_GRACE_MS,
    };
  }
  if (!heldFine && fineUntil > 0 && now >= fineUntil) {
    return { originX: pointerX, originValue: liveValue, fineUntil: 0 };
  }
  return { originX, originValue, fineUntil };
}

export function effectiveScrubMods(
  mods: ScrubPointerMods,
  scrub: Pick<CompoundSubtitleScrub, 'fineStep'>,
  now: number,
  fineUntil: number,
): ScrubPointerMods {
  if (isScrubFine(mods, scrub) || now < fineUntil) return { ...mods, ctrl: true };
  return mods;
}

export function applyScrubFrame(
  frame: ScrubFrame,
  clientX: number,
  mods: ScrubPointerMods,
  scrub: CompoundSubtitleScrub,
  now: number,
): { frame: ScrubFrame; live: number } {
  const heldFine = isScrubFine(mods, scrub);
  const parked = continueScrubOrigin({
    originX: frame.originX,
    originValue: frame.originValue,
    fineUntil: frame.fineUntil,
    pointerX: frame.lastX,
    liveValue: frame.live,
    wasHeldFine: frame.lastHeldFine,
    heldFine,
    now,
  });
  const live = liveScrubFromPointer(
    parked.originValue,
    clientX - parked.originX,
    scrub,
    effectiveScrubMods(mods, scrub, now, parked.fineUntil),
  );
  return {
    frame: {
      originX: parked.originX,
      originValue: parked.originValue,
      lastX: clientX,
      lastHeldFine: heldFine,
      fineUntil: parked.fineUntil,
      live,
    },
    live,
  };
}

export function nudgeScrubValue(
  origin: number,
  direction: 1 | -1,
  travel: number,
  decimals: number,
  min?: number,
  max?: number,
): number {
  return snapScrubValue(origin + direction * travel, decimals, min, max);
}

export function formatScrubCommit(n: number, decimals: number): string {
  return n.toFixed(decimals);
}

export function formatScrubFace(n: number, scrub: CompoundSubtitleScrub): string {
  if (scrub.money) return formatCurrency(n);
  return formatScrubCommit(n, scrub.decimals);
}

/** Digits only — the `$` lives on the standing keypad slot, not in this string. */
export function formatScrubFigure(n: number, scrub: CompoundSubtitleScrub): string {
  return formatScrubCommit(n, scrub.decimals);
}

/** Strip the currency face (`$49.99` / `$-`) down to the figure the input types. */
export function moneyFigureFromFace(text: string): string {
  const trimmed = String(text).trim();
  if (!trimmed || trimmed === '$-' || trimmed === '$—' || trimmed === '$–') return '-';
  return trimmed.replace(/^\$/, '');
}

export function commitScrubIfChanged(
  originRaw: string,
  next: number,
  decimals: number,
  onCommit: (value: string | null) => void,
): void {
  const commit = formatScrubCommit(next, decimals);
  if (commit === formatScrubCommit(parseScrubOrigin(originRaw), decimals) && originRaw.trim() !== '') {
    return;
  }
  if (originRaw.trim() === '' && next === 0) return;
  onCommit(commit);
}
