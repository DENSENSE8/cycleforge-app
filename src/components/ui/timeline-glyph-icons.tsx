/** Timeline rail icon map — resolves {@link TimelineGlyphId} → house Icons. */
import type { TimelineGlyphId } from '@/lib/timeline/timeline-glyphs';
import {
  Activity,
  Barcode,
  Boxes,
  FileText,
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
  // Paper, not a bubble — a note is written on the record, not said to someone.
  'team-note': FileText,
  'thread-message': MessageSquare,
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
