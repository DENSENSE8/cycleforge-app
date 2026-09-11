'use client';

/**
 * Step FACE — the icon a procedure step wears on its stack row.
 *
 * ## Why a registry and not a prop
 *
 * Two surfaces already render these steps (the work stack and the right-edge
 * checklist), and a third will. Icons resolve from one module — never picked at
 * the call site — so every view names the same step the same way.
 *
 * ## No hue family (2026-08-02)
 *
 * An earlier revision encoded work kind as sky / violet / amber / emerald fills
 * on every card. At the bench that read as AI card soup, not triage: the stack
 * already says where you are (focus / peek / history), and state marks say done
 * vs pending. Colour-per-family was costume. Surface, medallion, and quantity
 * ink are therefore ONE neutral set shared by every step — the stack geometry
 * (peek / cover / elevation on focus) carries depth, not a pastel ladder.
 */

import type { ComponentType } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Images,
  Package,
  PackageOpen,
  Printer,
  ScanBarcode,
  SlidersHorizontal,
  Tag,
  Tags,
} from '@/components/Icons';

interface StepFace {
  Icon: ComponentType<{ className?: string }>;
}

/** Shared neutral plate — quiet glyph, not a family swatch. */
export const STEP_FACE_MEDALLION =
  'bg-surface-strong text-text-muted ring-1 ring-inset ring-border-soft';

/** Shared neutral row surface — one card language for the whole stack. */
export const STEP_FACE_SURFACE = 'border-border-soft bg-surface-card';

/** Shared quantity ink — soft, not hue-700. */
export const STEP_FACE_QUANTITY = 'text-text-soft';

const FACES: Record<string, StepFace> = {
  classify: { Icon: SlidersHorizontal },
  arrival_label_photo: { Icon: Tag },
  arrival_box_photo: { Icon: Package },
  shipping_label_photo: { Icon: Tag },
  box_photo: { Icon: Package },
  packing_material: { Icon: PackageOpen },
  contents: { Icon: Images },
  condition: { Icon: Tags },
  item_photos: { Icon: ImageIcon },
  serial: { Icon: ScanBarcode },
  // `Tag` is already the shipping-label shot's glyph; `Printer` says "this is
  // the face about to come out of the printer".
  label: { Icon: Printer },
};

/**
 * A step with no declared face falls back to a camera icon rather than
 * throwing. A bench that crashes mid-carton is far worse than one showing a
 * generic glyph, and `procedure-step-face.guard.test.ts` fails CI so the gap
 * never reaches an operator.
 */
const FALLBACK: StepFace = { Icon: Camera };

export function stepFace(key: string): StepFace {
  return FACES[key] ?? FALLBACK;
}

/** Every key with a declared face — the guard walks this against the vocabulary. */
export const STEP_FACE_KEYS = Object.keys(FACES);
