import {
  AlertTriangle,
  History,
  PackageCheck,
  PackageSearch,
  Plus,
  Receipt,
  Truck,
} from '@/components/Icons';

type NavViewIcon = {
  icon: React.ComponentType<{ className?: string }>;
  /** The glyph's ink — the view's state colour, so it reads before its word. */
  tone: string;
  /** The view's count is a worklist of problems: amber while it is above zero. */
  alertCount?: true;
};

/**
 * Page-panel view glyphs, keyed `<pageId>.<itemId>` (operator 2026-09-27:
 * "identify and click without even reading the text"). One glyph per job:
 * Exceptions warns, PO paired is the purchase order, Pick list is finding
 * the unit, To ship is the carrier, Shipped is the closed box. A view with no
 * entry paints no glyph.
 */
export const NAV_VIEW_ICONS: Readonly<Record<string, NavViewIcon>> = {
  'outbound.exceptions': { icon: AlertTriangle, tone: 'text-amber-600', alertCount: true },
  'outbound.po': { icon: Receipt, tone: 'text-sky-600' },
  'outbound.pick': { icon: PackageSearch, tone: 'text-violet-600' },
  'outbound.triage': { icon: Truck, tone: 'text-blue-600' },
  'outbound.shipped': { icon: PackageCheck, tone: 'text-emerald-600' },
  'incoming.pipeline': { icon: Truck, tone: 'text-blue-600' },
  'incoming.docked': { icon: History, tone: 'text-emerald-600' },
};

/** Glyphs of the verbs that lead a view-less page panel (`NavPanelActions`), keyed by action id. */
export const NAV_ACTION_ICONS: Readonly<Record<string, NavViewIcon>> = {
  'chat.new': { icon: Plus, tone: 'text-text-muted' },
};
