/**
 * Timeline rail icon map — resolves {@link TimelineGlyphId} → house Icons.
 * Lives next to EventTimeline (client); the pure id/tooltip SoT is
 * `src/lib/timeline/timeline-glyphs.ts`.
 *
 * Use raw primitives at rail size (h-4) — nav mode-stroke wrappers muddy
 * 14–16px glyphs when weight climbs past ~2.25. Floor identity still comes from
 * the same icon shapes operators learn in MasterNav.
 */
import type { TimelineGlyphId } from '@/lib/timeline/timeline-glyphs';
import {
  Activity,
  Barcode,
  Boxes,
  MessageSquare,
  Package,
  PackageOpen,
  Printer,
  ShieldCheck,
  Ticket,
  Truck,
  Wrench,
  Send,
} from '@/components/Icons';

type IconComponent = (props: { className?: string }) => JSX.Element;

export const TIMELINE_GLYPH_ICONS: Record<TimelineGlyphId, IconComponent> = {
  unbox: PackageOpen,
  'tracking-scan': Barcode,
  support: Ticket,
  'team-note': MessageSquare,
  packing: Package,
  shipping: Send,
  testing: ShieldCheck,
  repair: Wrench,
  labeling: Printer,
  fba: Boxes,
  receiving: Truck,
  carrier: Truck,
  signal: Activity,
};
