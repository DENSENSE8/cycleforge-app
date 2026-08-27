/**
 * Pure field math for {@link UniversalLoader} — no React, no DOM, no motion.
 *
 * Split out so the branchy half (the palette, the CSS lattice) is unit testable
 * without mounting a canvas, and so a test importing it does not drag the
 * motion engine into a node runner.
 */

import { baseColors } from '@/design-system/tokens/colors';

/** Idle dot radius, in CSS px. Fine grain: the field is chrome, not texture. */
export const BASE_RADIUS = 0.75;

/**
 * Idle dot opacity.
 *
 * Not the 0.2 this pattern usually ships with — at 0.2 a dot this small resolved
 * to about a five-value delta against the plane and measured invisible, not
 * subtle. It rose again when {@link BASE_RADIUS} dropped: a 0.75px dot is under
 * a quarter the area of the 1.5px one this started at, and antialiasing eats the
 * edge of a circle that small, so opacity buys back what radius gave up.
 *
 * It rose a third time with the pastel palette: a `-300` pastel at 0.6 over
 * white lands around `rgb(190, 220, 254)`, and once antialiasing has thinned a
 * sub-pixel circle the eye reads that as grey. A pastel field whose pastels do
 * not register is just a grey field. Raise THIS before reaching for radius —
 * the dots are meant to stay fine.
 */
export const IDLE_ALPHA = 0.8;

export type RGB = readonly [number, number, number];

/** One dot's colour pair: its resting pastel and the saturated peak it reaches. */
export interface PastelStop {
  readonly name: string;
  readonly idle: RGB;
  readonly active: RGB;
}

function rgb(hex: string): RGB {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ] as RGB;
}

/** Composite an RGB over white at {@link IDLE_ALPHA} and return its luminance. */
export function luminanceOnWhite(c: RGB): number {
  const [r, g, b] = c.map((ch) => IDLE_ALPHA * ch + (1 - IDLE_ALPHA) * 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The band every resting pastel must land in, as composited over white.
 *
 * Below it a dot stops reading as pastel and starts reading as ink; above it,
 * it washes out into the plane. Measured, not guessed: the first six families
 * at `-300` sit between 183 (navy) and 213 (emerald).
 */
export const READABLE_LUMINANCE = { min: 175, max: 218 } as const;

type Family = 'blue' | 'purple' | 'emerald' | 'orange' | 'red' | 'navy' | 'green' | 'yellow';

/**
 * One palette entry: a base family at a chosen resting step, deepening two
 * steps for the sweep and the pointer.
 *
 * **The resting step is not always `-300`.** Yellow and green are far lighter
 * at that step than the rest of the scale (luminance 226 and 220 against a
 * 183–213 band), so at `-300` they wash out on white while their neighbours
 * read fine — a palette that looks even in a swatch strip and uneven in the
 * field. They rest at `-400` instead. The invariant is the LUMINANCE BAND,
 * never a fixed step number, and `palette-reads-on-white` pins it.
 */
function stop(name: Family, idleStep: 300 | 400): PastelStop {
  const scale = baseColors[name] as Record<number, string>;
  return { name, idle: rgb(scale[idleStep]), active: rgb(scale[idleStep + 200]) };
}

/**
 * The field's palette: eight base families, each resting on a pastel and
 * deepening within its own family under the sweep or the pointer.
 *
 * **Straight off `baseColors`, and deliberately NOT the staff accent.** The
 * field used to read `--ds-color-accent-bg`, which is the per-staff accent — so
 * the whole loader was one operator's colour, and every dot in it was the same
 * hue. These are the house base scales rather than the semantic/theme layer
 * because the plane under them is now fixed white in every theme (see the
 * background note on {@link UniversalLoader}), so a palette that flipped with
 * `data-theme` would be answering a question the surface no longer asks.
 *
 * A dot deepens within its OWN family rather than blending toward one shared
 * accent: cross-family blending sends a green dot through grey on its way to
 * blue, and a field full of that reads as dirty rather than as pastel.
 */
export const PASTEL_PALETTE: readonly PastelStop[] = [
  stop('blue', 300),
  stop('purple', 300),
  stop('emerald', 300),
  stop('orange', 300),
  stop('red', 300),
  stop('navy', 300),
  stop('green', 400),
  stop('yellow', 400),
] as const;

/**
 * Which pastel a lattice cell wears — a spatial hash, deliberately NOT linear.
 *
 * Any `(a·col + b·row) % n` lays the palette out as a repeating lattice, and
 * with the sweep front running along `x + y` the regular ones are exactly the
 * wrong shape: colour by that sum and every instant of the wave is a single
 * solid hue. Even a coprime pair only rotates the stripes. The xor-hash breaks
 * the periodicity outright, so the field reads as a mix at rest and the wave
 * stays multicoloured as it crosses.
 */
export function pastelFor(col: number, row: number): PastelStop {
  // Two large primes — the standard spatial hash. `| 0` keeps it in int32 so
  // the result is stable rather than drifting once the grid gets large.
  const h = ((col * 73856093) ^ (row * 19349663)) | 0;
  return PASTEL_PALETTE[Math.abs(h) % PASTEL_PALETTE.length];
}

/** Dot alpha at a given interaction intensity (0 = idle, 1 = full). */
export function dotAlpha(intensity: number): number {
  return IDLE_ALPHA + intensity * (1 - IDLE_ALPHA);
}

/** A dot's fill: its own pastel at rest, its own deeper sibling at intensity. */
export function dotFill(stop: PastelStop, intensity: number): string {
  const { idle, active } = stop;
  if (intensity <= 0) {
    return `rgba(${idle[0]}, ${idle[1]}, ${idle[2]}, ${IDLE_ALPHA})`;
  }
  const [r, g, b] = [0, 1, 2].map((i) =>
    Math.round(idle[i] + (active[i] - idle[i]) * intensity),
  );
  return `rgba(${r}, ${g}, ${b}, ${dotAlpha(intensity)})`;
}

/**
 * The JS-free twin of the canvas lattice — present in the server HTML so the
 * field is not blank before hydration (see the pre-hydration note on
 * {@link UniversalLoader}).
 *
 * Four gradients on a `2 × spacing` tile, offset into the four quadrant slots,
 * so the CSS lattice lands on the SAME pitch as the canvas and carries four of
 * the palette's hues. One gradient cannot do this: a single `radial-gradient`
 * repeats one colour, and the handoff to the canvas would then be a visible
 * recolour rather than a swap.
 */
export function latticeStyle(spacing: number): {
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
} {
  const tile = spacing * 2;
  // Sample ACROSS the palette rather than taking the first four, so the
  // pre-hydration lattice previews the field's real spread and the handoff to
  // the canvas is not a widening of the range.
  const step = Math.max(1, Math.floor(PASTEL_PALETTE.length / 4));
  const stops = [0, 1, 2, 3].map((i) => PASTEL_PALETTE[(i * step) % PASTEL_PALETTE.length]);
  const dot = (c: RGB) =>
    `radial-gradient(circle, rgba(${c[0]}, ${c[1]}, ${c[2]}, ${IDLE_ALPHA}) ${BASE_RADIUS}px, transparent ${BASE_RADIUS + 0.5}px)`;
  return {
    backgroundImage: stops.map((s) => dot(s.idle)).join(', '),
    backgroundSize: `${tile}px ${tile}px`,
    backgroundPosition: `0 0, ${spacing}px 0, 0 ${spacing}px, ${spacing}px ${spacing}px`,
  };
}
