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
 *   identity (what IS this)  → violet   · classify, contents
 *   judgement (a grade)      → amber    · condition
 *   traceability (a number)  → emerald  · serial
 *
 * That is the same discipline as the lifecycle dot registry: colour flows from
 * one map, and a new step picks the family its job belongs to rather than a
 * colour nobody else uses.
 *
 * ## White card, coloured content
 *
 * The CARD stays `bg-surface-card` — white — so the raised elevation has a real
 * ground plane to cast onto and the rail reads as depth rather than as a row of
 * paint chips. The hue lives in the icon medallion, the accent rail and the
 * quantity, which is enough to identify a card at arm's length without the text
 * losing its contrast floor. A fully saturated card would put white-on-colour
 * text at the bench's worst viewing angle, and it is the one thing a warehouse
 * monitor renders badly.
 */

import type { ComponentType } from 'react';
import {
  Barcode,
  Camera,
  Image as ImageIcon,
  Images,
  Package,
  PackageOpen,
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

/** Medallion (icon plate) — the saturated element on the white card. */
const HUE_MEDALLION: Record<StepHue, string> = {
  sky: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
};

/** Leading accent rail — identifies the card's family down the whole strip. */
const HUE_ACCENT: Record<StepHue, string> = {
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
};

/** Quantity ink. 700 on white clears the AA floor at the 12px this renders at. */
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

export function stepAccentClass(hue: StepHue): string {
  return HUE_ACCENT[hue];
}

export function stepQuantityClass(hue: StepHue): string {
  return HUE_QUANTITY[hue];
}

/** Every key with a declared face — the guard walks this against the vocabulary. */
export const STEP_FACE_KEYS = Object.keys(FACES);
