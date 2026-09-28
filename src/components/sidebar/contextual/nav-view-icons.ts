import {
  AlertCircle,
  AlertTriangle,
  Barcode,
  Clipboard,
  ClipboardList,
  Clock,
  Cpu,
  FileText,
  History,
  Layers,
  Link2,
  ListChecks,
  Package,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  Plus,
  Printer,
  Receipt,
  ScanBarcode,
  Search,
  Star,
  Truck,
  Upload,
  Warehouse,
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
  // Unboxed = the opened carton (the Unbox station's glyph), in Inbound's blue.
  'incoming.docked': { icon: PackageOpen, tone: 'text-blue-600' },
  // FBA wears the purple family (its mode tone is `text-purple-600`).
  'fba.ready': { icon: ListChecks, tone: 'text-violet-600' },
  'fba.plan': { icon: ClipboardList, tone: 'text-purple-500' },
  'fba.combine': { icon: Package, tone: 'text-purple-600' },
  'fba.shipped': { icon: PackageCheck, tone: 'text-purple-700' },
  'fba.catalog': { icon: Barcode, tone: 'text-violet-700' },
  // Labels & docs wears its lane row's teal.
  'label-intake.labels': { icon: Printer, tone: 'text-teal-600' },
  'label-intake.paperwork': { icon: FileText, tone: 'text-teal-600' },
  'label-intake.printed': { icon: History, tone: 'text-teal-700' },
  // Sourcing wears its lane row's indigo; the same glyphs as its nav children.
  'sourcing.queue': { icon: AlertCircle, tone: 'text-amber-600' },
  'sourcing.scout': { icon: Search, tone: 'text-indigo-600' },
  'sourcing.watchlist': { icon: Star, tone: 'text-indigo-500' },
  'sourcing.searches': { icon: Clock, tone: 'text-indigo-600' },
  'sourcing.suppliers': { icon: Link2, tone: 'text-indigo-700' },
  'sourcing.models': { icon: Cpu, tone: 'text-indigo-600' },
  'sourcing.compatibility': { icon: Layers, tone: 'text-indigo-700' },
  // Inventory wears its lane row's emerald; the same glyphs as its nav children.
  'inventory.stock': { icon: Package, tone: 'text-emerald-600' },
  'inventory.sku-exceptions': { icon: AlertTriangle, tone: 'text-amber-600' },
  'inventory.ledger': { icon: Clipboard, tone: 'text-emerald-700' },
  'inventory.replenish': { icon: History, tone: 'text-emerald-600' },
  'inventory.locations': { icon: Warehouse, tone: 'text-emerald-700' },
  // QC labels wears its mode's amber.
  'qc-labels.all': { icon: ScanBarcode, tone: 'text-amber-600' },
  'qc-labels.stock': { icon: Package, tone: 'text-amber-600' },
  'qc-labels.order': { icon: PackageCheck, tone: 'text-amber-700' },
};

/**
 * Glyphs of page verbs, keyed by action id: the verbs that lead a view-less
 * page panel (`NavPanelActions`) and the desk header's primary CTA
 * (`NavPageActions`, which falls back to ↻ Sync).
 */
export const NAV_ACTION_ICONS: Readonly<Record<string, NavViewIcon>> = {
  'chat.new': { icon: Plus, tone: 'text-text-muted' },
  'labels-docs.print-labels': { icon: Printer, tone: 'text-text-muted' },
  'labels-docs.print-paperwork': { icon: Printer, tone: 'text-text-muted' },
  'labels-docs.print-all': { icon: Printer, tone: 'text-text-muted' },
  'labels-docs.upload': { icon: Upload, tone: 'text-text-muted' },
  'labels-docs.upload-slips': { icon: Upload, tone: 'text-text-muted' },
  'sourcing.add-model': { icon: Plus, tone: 'text-text-muted' },
  'qc-labels.print': { icon: Printer, tone: 'text-text-muted' },
};
