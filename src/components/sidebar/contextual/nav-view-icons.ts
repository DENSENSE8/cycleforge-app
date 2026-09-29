import {
  AlertCircle,
  AlertTriangle,
  Barcode,
  Clipboard,
  Check,
  ClipboardList,
  Clock,
  Cpu,
  Download,
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
  RefreshCw,
  ScanBarcode,
  Search,
  Star,
  Truck,
  Upload,
  Warehouse,
} from '@/components/Icons';
import { domainLane } from '@/lib/nav/lanes';

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
  // Deliveries lifecycle: three distinct inks make the switcher scannable
  // before its label — inbound transit, docked package, opened carton.
  'incoming.pipeline': { icon: Truck, tone: 'text-blue-600' },
  'incoming.docked': { icon: Package, tone: 'text-violet-600' },
  'incoming.unboxed': { icon: PackageOpen, tone: 'text-emerald-600' },
  // FBA wears the purple family (its mode tone is `text-purple-600`).
  'fba.ready': { icon: ListChecks, tone: 'text-violet-600' },
  'fba.plan': { icon: ClipboardList, tone: 'text-purple-500' },
  'fba.combine': { icon: Package, tone: 'text-purple-600' },
  'fba.shipped': { icon: PackageCheck, tone: 'text-purple-700' },
  'fba.catalog': { icon: Barcode, tone: 'text-violet-700' },
  // Labels & docs wears its lane row's teal.
  'label-intake.uploads': { icon: Upload, tone: 'text-teal-600' },
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
  // Products: one glyph per catalog job.
  'products.catalog': { icon: Layers, tone: 'text-blue-600' },
  'products.manuals': { icon: FileText, tone: 'text-sky-600' },
  'products.labels': { icon: Barcode, tone: 'text-teal-600' },
  'products.pairing': { icon: Link2, tone: 'text-indigo-600' },
  'products.qc': { icon: Check, tone: 'text-amber-600' },
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
  // Print station wears its row's sky; Reprinted is the damage history.
  'print-station.fnsku': { icon: ScanBarcode, tone: 'text-sky-600' },
  'print-station.fnsku-reprinted': { icon: History, tone: 'text-sky-700' },
  // Exceptions: every domain and kind is a worklist of problems (amber count
  // while > 0); a domain wears its lane's glyph, a kind the glyph of the
  // surface its source lives on.
  'exceptions.fulfillment': { icon: domainLane('fulfillment').icon, tone: 'text-blue-600', alertCount: true },
  'exceptions.inventory': { icon: domainLane('inventory').icon, tone: 'text-emerald-600', alertCount: true },
  'exceptions.receiving': { icon: domainLane('inbound').icon, tone: 'text-blue-600', alertCount: true },
  'exceptions.fbm': { icon: Truck, tone: 'text-blue-600', alertCount: true },
  'exceptions.labels': { icon: Printer, tone: 'text-teal-600', alertCount: true },
  'exceptions.paperwork': { icon: FileText, tone: 'text-teal-600', alertCount: true },
  'exceptions.pairs': { icon: Link2, tone: 'text-emerald-600', alertCount: true },
  'exceptions.bins': { icon: Warehouse, tone: 'text-emerald-700', alertCount: true },
  'exceptions.tracking': { icon: Barcode, tone: 'text-emerald-600', alertCount: true },
  'exceptions.claim': { icon: AlertCircle, tone: 'text-blue-600', alertCount: true },
  'exceptions.short': { icon: PackageOpen, tone: 'text-blue-600', alertCount: true },
  'exceptions.unfound': { icon: Search, tone: 'text-blue-600', alertCount: true },
};

/**
 * Glyphs of page verbs, keyed by action id: the verbs that lead a view-less
 * page panel (`NavPanelActions`) and the desk header's primary CTA
 * (`NavPageActions`, which falls back to ↻ Sync).
 */
export const NAV_ACTION_ICONS: Readonly<Record<string, NavViewIcon>> = {
  'chat.new': { icon: Plus, tone: 'text-text-muted' },
  'orders.add': { icon: Plus, tone: 'text-text-muted' },
  'labels-docs.print-labels': { icon: Printer, tone: 'text-text-muted' },
  'labels-docs.print-paperwork': { icon: Printer, tone: 'text-text-muted' },
  'labels-docs.print-all': { icon: Printer, tone: 'text-text-muted' },
  'labels-docs.upload': { icon: Upload, tone: 'text-text-muted' },
  'labels-docs.upload-slips': { icon: Upload, tone: 'text-text-muted' },
  'labels-docs.buy-label': { icon: Truck, tone: 'text-text-muted' },
  'sourcing.add-model': { icon: Plus, tone: 'text-text-muted' },
  'qc-labels.print': { icon: Printer, tone: 'text-text-muted' },
  'reports.refresh': { icon: RefreshCw, tone: 'text-text-muted' },
  'reports.export-packing': { icon: Download, tone: 'text-text-muted' },
  'reports.export-inbound': { icon: Download, tone: 'text-text-muted' },
  'reports.export-outbound': { icon: Download, tone: 'text-text-muted' },
};
