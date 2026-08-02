'use client';

/**
 * Step FACE — the icon and hue a procedure step wears on its card.
 *
 * ## Why a registry and not a prop
 *
 * A card that is "full colored per task" is a presentation kind, and presentation
 * kinds resolve from one module in this codebase — never from a hue picked at the
 * call site. Two surfaces already render these steps (the work cards and the
 * right-edge checklist), and a third will; if each chose its own colour for
 * `condition`, the operator would learn three different meanings for the same
 * green.
 *
 * ## The hue is FUNCTIONAL, not decorative
 *
 * It encodes what KIND of work the step is, so the operator can triage the rail
 * by colour before reading a word:
 *
 *   evidence (a photograph)  → sky      · the camera family
 *   identity (what IS this)  → violet   · classify, contents, label
 *   judgement (a grade)      → amber    · condition
 *   traceability (a number)  → emerald  · serial
 *
 * That is the same discipline as the lifecycle dot registry: colour flows from
 * one map, and a new step picks the family its job belongs to rather than a
 * colour nobody else uses.
 *
 * ## Lightly TINTED card, coloured content — never a saturated one
 *
 * The card carries its family as a **50-level fill** (2026-08-02, replacing a
 * leading accent edge): a whole card is legible as a family at arm's length in a
 * way a 4px edge is not, and on a deck where cards tuck behind one another the
 * edge is the first thing occlusion eats.
 *
 * It stops at 50 for two reasons, both load-bearing:
 *
 *   - **The ground plane.** Depth on this surface comes from
 *     `elevationClass('raised')` against `background-canvas`, and a shadow needs
 *     something to cast onto. A 50 tint sits above the canvas step; a heavier
 *     fill closes it, and the deck stops reading as depth. If that ever
 *     flattens, the fix is a stronger canvas — never a heavier shadow.
 *   - **Contrast.** `text-text-default` on a 50 tint keeps its floor at the
 *     12–14px this renders at. A fully saturated card would put white-on-colour
 *     text at the bench's worst viewing angle, which is the one thing a
 *     warehouse monitor renders badly.
 *
 * The medallion therefore steps UP to 100/300 rather than staying at 50 — on a
 * tinted card a 50 medallion is invisible, and the medallion is the glyph plate
 * that identifies the card before any text is read.
 */

import type { ComponentType } from 'react';
import {
  Barcode,
  Camera,
  Image as ImageIcon,
  Images,
  Package,
  PackageOpen,
  Printer,
  SlidersHorizontal,
  Tag,
  Tags,
} from '@/components/Icons';

/** Functional families — never a per-step one-off hue. */
type StepHue = 'sky' | 'violet' | 'amber' | 'emerald';

interface StepFace {
  Icon: ComponentType<{ className?: string }>;
  hue: StepHue;
}

/**
 * Medallion (icon plate) — the saturated element on the tinted card.
 *
 * 100 fill / 300 ring, one step above the card's own 50, because a medallion
 * that matches the card it sits on is not a plate. 700 ink on 100 clears the AA
 * floor.
 */
const HUE_MEDALLION: Record<StepHue, string> = {
  sky: 'bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-300',
  violet: 'bg-violet-100 text-violet-700 ring-1 ring-inset ring-violet-300',
  amber: 'bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-300',
  emerald: 'bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-300',
};

/**
 * The card's own surface — fill + border, as ONE class string.
 *
 * Coupled on purpose: a tinted card with a neutral `border-border-soft` reads as
 * an unfinished swatch, and splitting them into two registries is how a new hue
 * arrives with a fill and no border. The consumer emits a bare `border` and lets
 * this supply the colour.
 *
 * This replaced a leading accent edge, which had itself replaced an
 * absolutely-positioned rail. The rail wore `rounded-l-[inherit]`, and
 * `border-radius: inherit` copies the parent's radius VALUE (≈16px) onto a
 * 4px-wide child box — so it rendered as a lens/notch instead of following the
 * card's curve. `overflow-hidden` was never the fix either: it shears the focus
 * rings off the inputs inside an expanded step body. The general trap is
 * recorded in `ui-design-system.md`.
 */
const HUE_SURFACE: Record<StepHue, string> = {
  sky: 'border-sky-200 bg-sky-50',
  violet: 'border-violet-200 bg-violet-50',
  amber: 'border-amber-200 bg-amber-50',
  emerald: 'border-emerald-200 bg-emerald-50',
};

/** Quantity ink. 700 on the card's 50 tint clears the AA floor at 12px. */
const HUE_QUANTITY: Record<StepHue, string> = {
  sky: 'text-sky-700',
  violet: 'text-violet-700',
  amber: 'text-amber-700',
  emerald: 'text-emerald-700',
};

const FACES: Record<string, StepFace> = {
  classify: { Icon: SlidersHorizontal, hue: 'violet' },
  arrival_check: { Icon: Camera, hue: 'sky' },
  shipping_label_photo: { Icon: Tag, hue: 'sky' },
  box_photo: { Icon: Package, hue: 'sky' },
  packing_material: { Icon: PackageOpen, hue: 'sky' },
  contents: { Icon: Images, hue: 'violet' },
  condition: { Icon: Tags, hue: 'amber' },
  item_photos: { Icon: ImageIcon, hue: 'sky' },
  serial: { Icon: Barcode, hue: 'emerald' },
  // Reading the printed face is an IDENTITY act — what this box will be called
  // on the shelf — so it wears violet beside `classify` and `contents`, not the
  // sky of the camera family. `Tag` is already the shipping-label shot's glyph;
  // `Printer` says "this is the face about to come out of the printer".
  label: { Icon: Printer, hue: 'violet' },
};

/**
 * A step with no declared face falls back to the evidence family rather than
 * throwing. A bench that crashes mid-carton is far worse than one showing a
 * generically-coloured card, and `procedure-step-face.guard.test.ts` fails CI so
 * the gap never reaches an operator.
 */
const FALLBACK: StepFace = { Icon: Camera, hue: 'sky' };

export function stepFace(key: string): StepFace {
  return FACES[key] ?? FALLBACK;
}

export function stepMedallionClass(hue: StepHue): string {
  return HUE_MEDALLION[hue];
}

export function stepSurfaceClass(hue: StepHue): string {
  return HUE_SURFACE[hue];
}

export function stepQuantityClass(hue: StepHue): string {
  return HUE_QUANTITY[hue];
}

/** Every key with a declared face — the guard walks this against the vocabulary. */
export const STEP_FACE_KEYS = Object.keys(FACES);
