import type { BarcodeMode } from '@/components/barcode/ModeSelector';
import { focusRing } from '@/design-system/tokens/focus-ring';

/** Per-mode accent tokens for the horizontal workspace (tone + CTA + focus ring). */
export interface ModeAccent {
  tone: 'blue' | 'emerald' | 'orange' | 'violet';
  ctaBg: string;
  ctaHover: string;
  focusRing: string;
}

const FIELD_FOCUS = focusRing('field', 'accent');

export const MODE_ACCENT_THEME: Record<BarcodeMode, ModeAccent> = {
  print: {
    tone: 'blue',
    ctaBg: 'bg-blue-600',
    ctaHover: 'hover:bg-blue-700',
    focusRing: FIELD_FOCUS,
  },
  'auto-unit': {
    tone: 'orange',
    ctaBg: 'bg-orange-600',
    ctaHover: 'hover:bg-orange-700',
    focusRing: FIELD_FOCUS,
  },
  'sn-to-sku': {
    tone: 'emerald',
    ctaBg: 'bg-emerald-600',
    ctaHover: 'hover:bg-emerald-700',
    focusRing: FIELD_FOCUS,
  },
  reprint: {
    tone: 'violet',
    ctaBg: 'bg-violet-700',
    ctaHover: 'hover:bg-violet-800',
    focusRing: FIELD_FOCUS,
  },
};
