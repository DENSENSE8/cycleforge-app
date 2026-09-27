import {
  AlertTriangle,
  Boxes,
  FileText,
  PackageCheck,
  PackageSearch,
  Receipt,
  Truck,
} from '@/components/Icons';

type NavViewIcon = {
  icon: React.ComponentType<{ className?: string }>;
  /** The glyph's ink — the view's state colour, so it reads before its word. */
  tone: string;
};

/**
 * Page-panel view glyphs, keyed `<pageId>.<itemId>` (operator 2026-09-27:
 * "identify and click without even reading the text"). One glyph per job:
 * Exceptions warns, PO paired is the purchase order, Pick list is finding
 * the unit, To ship is the carrier, Shipped is the closed box. A view with no
 * entry paints no glyph.
 */
export const NAV_VIEW_ICONS: Readonly<Record<string, NavViewIcon>> = {
  'outbound.exceptions': { icon: AlertTriangle, tone: 'text-amber-600' },
  'outbound.po': { icon: Receipt, tone: 'text-sky-600' },
  'outbound.pick': { icon: PackageSearch, tone: 'text-violet-600' },
  'outbound.triage': { icon: Truck, tone: 'text-blue-600' },
  'outbound.shipped': { icon: PackageCheck, tone: 'text-emerald-600' },
  // The lane's other pages (lane door, `More in Outbound`): neutral ink —
  // they are places, not states.
  'outbound.fba': { icon: Boxes, tone: 'text-text-muted' },
  'outbound.label-intake': { icon: FileText, tone: 'text-text-muted' },
};
