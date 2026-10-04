/** Figma-style number-field math: delta-X drag, Shift coarse, Control fine with a release grace. */

/** A number field the operator can drag-scrub or arrow-nudge. */
export interface ScrubSpec {
  /** 1px of drag (or one arrow key) in the default band. */
  step: number;
  /** Shift+drag / Shift+arrow. */
  coarseStep: number;
  /**
   * Control+drag / Control+arrow (Alt still aliases). Omit to ignore.
   * Control-up parks the origin and keeps this band for a grace period so
   * leftover pointer travel is not whole steps.
   */
  fineStep?: number;
  min?: number;
  max?: number;
  /** Snap + face precision. */
  decimals: number;
}

/** Arm before a click becomes a scrub. */
export const SCRUB_ARM_PX = 3;

/**
 * Pixels of Control-drag per fine step. Default drag is 1px = `step`; fine
 * needs this many pixels for one `fineStep` so the value stays near center.
 */
export const SCRUB_FINE_PX = 8;

/**
 * After Control-up, keep the fine band this long. The pointer is still
 * where the damped drag left it; the coarse scale would jump the value.
 */
export const SCRUB_FINE_GRACE_MS = 320;

export type ScrubPointerMods = { shift: boolean; ctrl: boolean; alt?: boolean };

export function scrubPointerMods(event: {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): ScrubPointerMods {
  return { shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey };
}

function isScrubFine(mods: ScrubPointerMods, scrub: Pick<ScrubSpec, 'fineStep'>): boolean {
  return Boolean((mods.ctrl || mods.alt) && scrub.fineStep != null);
}

export function scrubShouldArm(dx: number): boolean {
  return Math.abs(dx) >= SCRUB_ARM_PX;
}

export function parseScrubOrigin(raw: string): number {
  const n = Number(String(raw).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function scrubTravel(
  scrub: Pick<ScrubSpec, 'step' | 'coarseStep' | 'fineStep'>,
  mods: ScrubPointerMods,
): number {
  if (isScrubFine(mods, scrub)) return scrub.fineStep as number;
  if (mods.shift) return scrub.coarseStep;
  return scrub.step;
}

export function snapScrubValue(n: number, decimals: number, min?: number, max?: number): number {
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
  scrub: ScrubSpec,
  mods: ScrubPointerMods,
): number {
  const travel = scrubTravel(scrub, mods);
  const divisor = isScrubFine(mods, scrub) ? SCRUB_FINE_PX : 1;
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
  scrub: Pick<ScrubSpec, 'fineStep'>,
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

function continueScrubOrigin(args: {
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
      fineUntil: now + SCRUB_FINE_GRACE_MS,
    };
  }
  if (!heldFine && fineUntil > 0 && now >= fineUntil) {
    return { originX: pointerX, originValue: liveValue, fineUntil: 0 };
  }
  return { originX, originValue, fineUntil };
}

function effectiveScrubMods(
  mods: ScrubPointerMods,
  scrub: Pick<ScrubSpec, 'fineStep'>,
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
  scrub: ScrubSpec,
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
