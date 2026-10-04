import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Barcode,
  Check,
  Clipboard,
  ClipboardList,
  Clock,
  Cpu,
  Download,
  FileText,
  History,
  Images,
  Inbox,
  Layers,
  Link2,
  List,
  ListChecks,
  MessageSquare,
  Package,
  PackageCheck,
  PackageOpen,
  Phone,
  Plus,
  Printer,
  Radar,
  RefreshCw,
  ScanBarcode,
  SalesModeCounter,
  SalesPrice,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingCart,
  ShippingModeFba,
  Tags,
  Star,
  TicketHelp,
  TrendingUp,
  Truck,
  Upload,
  User,
  Voicemail,
  Warehouse,
  Zap,
} from '@/components/Icons';
import { domainLane } from '@/lib/nav/lanes';
import { TASK_BOARD_TYPE_FACE } from '@/lib/task-board/task-board-model';
import { TASK_STATUS_FACE } from '@/design-system/tokens/task-status';

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
 * Exceptions warns, Allocate is the carrier, Shipped is the closed box.
 *
 * COMPLETENESS LAW (owner 2026-09-29): every unparked child of every page
 * gets an entry in the same change that adds the view — the test beside this
 * file names any gap, so a view never ships glyphless. A page's views wear
 * its lane/mode ink with shade steps; a page with no ink of its own gives
 * each view a distinct tone so the switcher scans before its words.
 */
export const NAV_VIEW_ICONS: Readonly<Record<string, NavViewIcon>> = {
  'outbound.exceptions': { icon: AlertTriangle, tone: 'text-amber-600', alertCount: true },
  'outbound.triage': { icon: Truck, tone: 'text-blue-600' },
  'outbound.shipped': { icon: PackageCheck, tone: 'text-emerald-600' },
  // Fulfilled saved views — same glyphs the lane row's children wear.
  'fulfilled.all': { icon: List, tone: 'text-emerald-600' },
  'fulfilled.online': { icon: ShoppingCart, tone: 'text-emerald-700' },
  'fulfilled.fba': { icon: ShippingModeFba, tone: 'text-purple-600' },
  'fulfilled.sku': { icon: Tags, tone: 'text-teal-600' },
  'fulfilled.delivered': { icon: Check, tone: 'text-emerald-500' },
  // Deliveries lifecycle: three distinct inks make the switcher scannable
  // before its label — inbound transit, docked package, opened carton.
  'incoming.pipeline': { icon: Truck, tone: 'text-blue-600' },
  'incoming.docked': { icon: Package, tone: 'text-violet-600' },
  'incoming.unboxed': { icon: PackageOpen, tone: 'text-emerald-600' },
  // Repair service splits by how the device arrived: both stacked (All), the
  // carrier, the counter.
  'repair.all': { icon: Layers, tone: 'text-violet-600' },
  'repair.shipped-in': { icon: Truck, tone: 'text-blue-600' },
  'repair.dropped-off': { icon: SalesModeCounter, tone: 'text-amber-600' },
  'sales.repairs-all': { icon: Layers, tone: 'text-violet-600' },
  'sales.repairs-shipped-in': { icon: Truck, tone: 'text-blue-600' },
  'sales.repairs-dropped-off': { icon: SalesModeCounter, tone: 'text-amber-600' },
  // The Sales trio (owner 2026-09-29): the board charts, the counter closes,
  // the pickup waits — three jobs, three glyphs, three inks.
  'sales.sales': { icon: BarChart3, tone: 'text-sky-600' },
  'sales.counter': { icon: SalesPrice, tone: 'text-emerald-600' },
  'sales.pickup': { icon: ShoppingCart, tone: 'text-indigo-600' },
  // Reports: one glyph per report job — who worked, what packed, how full the
  // bins, how fast stock moves, what stopped moving, work tracked, time spent.
  'reports.staff-day': { icon: ClipboardList, tone: 'text-sky-600' },
  'reports.packer-day': { icon: Package, tone: 'text-violet-600' },
  'reports.utilization': { icon: BarChart3, tone: 'text-emerald-600' },
  'reports.velocity': { icon: TrendingUp, tone: 'text-cyan-600' },
  'reports.dead-stock': { icon: FileText, tone: 'text-amber-700' },
  'reports.tasks': { icon: ListChecks, tone: 'text-indigo-600' },
  'reports.activity': { icon: Clock, tone: 'text-blue-600' },
  // Automations: the canvas, the trigger, the parts shelf.
  'studio.graph': { icon: Share2, tone: 'text-indigo-600' },
  'studio.rules': { icon: Zap, tone: 'text-amber-600' },
  'studio.catalog': { icon: Layers, tone: 'text-violet-600' },
  // Operations (Monitor): the pulse, the rounds, the past, the alarms, the
  // links, the targets, the bar, the people, the plumbing, the paper trail.
  'operations.live': { icon: Activity, tone: 'text-emerald-600' },
  'operations.live-feed': { icon: Radar, tone: 'text-orange-600' },
  'operations.checks': { icon: ClipboardList, tone: 'text-blue-600' },
  'operations.packing-review': { icon: Clipboard, tone: 'text-amber-600' },
  'operations.history': { icon: History, tone: 'text-indigo-600' },
  'operations.signals': { icon: Zap, tone: 'text-orange-600' },
  'operations.reconciliation': { icon: Link2, tone: 'text-teal-600' },
  'operations.goals': { icon: BarChart3, tone: 'text-sky-600' },
  'operations.quality': { icon: ShieldCheck, tone: 'text-emerald-700' },
  'operations.staff': { icon: User, tone: 'text-blue-700' },
  'operations.sync': { icon: RefreshCw, tone: 'text-cyan-600' },
  'operations.logs': { icon: FileText, tone: 'text-slate-600' },
  // Imports: the runs, then one row per order each run touched.
  'imports.runs': { icon: History, tone: 'text-blue-600' },
  'imports.rows': { icon: List, tone: 'text-sky-700' },
  // Support: the queue, the recordings, the line, the claims, the escalations.
  'support.tickets': { icon: Inbox, tone: 'text-blue-600' },
  'support.voicemail': { icon: Voicemail, tone: 'text-violet-600' },
  'support.calls': { icon: Phone, tone: 'text-emerald-600' },
  'support.warranty': { icon: ShieldCheck, tone: 'text-amber-600' },
  'support.issues': { icon: MessageSquare, tone: 'text-rose-600' },
  // Media Library scopes: every source surface an image comes in on.
  'ops-photos.all': { icon: Images, tone: 'text-sky-600' },
  'ops-photos.unboxing': { icon: PackageOpen, tone: 'text-blue-600' },
  'ops-photos.local_pickup': { icon: SalesModeCounter, tone: 'text-amber-600' },
  'ops-photos.packing': { icon: Package, tone: 'text-violet-600' },
  'ops-photos.repair': { icon: Settings, tone: 'text-orange-600' },
  'ops-photos.claims': { icon: TicketHelp, tone: 'text-rose-600' },
  'ops-photos.outbound': { icon: Share2, tone: 'text-emerald-600' },
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
  'exceptions.unmatched': { icon: ScanBarcode, tone: 'text-teal-600', alertCount: true },
  'exceptions.pairs': { icon: Link2, tone: 'text-emerald-600', alertCount: true },
  'exceptions.bins': { icon: Warehouse, tone: 'text-emerald-700', alertCount: true },
  'exceptions.tracking': { icon: Barcode, tone: 'text-emerald-600', alertCount: true },
  'exceptions.claim': { icon: AlertCircle, tone: 'text-blue-600', alertCount: true },
  'exceptions.short': { icon: PackageOpen, tone: 'text-blue-600', alertCount: true },
  'exceptions.unfound': { icon: Search, tone: 'text-blue-600', alertCount: true },
  // Live feed: each direction view wears its lane's glyph, outbound in orange (the row's ink), inbound in blue
  // (Deliveries'). The lanes are the board's columns, never views.
  'live-feed.outbound': { icon: Truck, tone: 'text-orange-600' },
  'live-feed.inbound': { icon: domainLane('inbound').icon, tone: 'text-blue-600' },
  // Tasks (owner 2026-09-29): each PARENT wears its row-type glyph and hue
  // (`TASK_BOARD_TYPE_FACE`, the same mark every board row leads with; All
  // tasks the stack); the views under it say state, never the parent's glyph
  // again — open work is the clock, finished work the check.
  'home.tasks': { icon: Layers, tone: 'text-sky-600' },
  'home.support': { icon: TASK_BOARD_TYPE_FACE.ticket.icon, tone: TASK_BOARD_TYPE_FACE.ticket.ink },
  'home.daily': { icon: TASK_BOARD_TYPE_FACE.checklist.icon, tone: TASK_BOARD_TYPE_FACE.checklist.ink },
  'home.projects': { icon: TASK_BOARD_TYPE_FACE.project.icon, tone: TASK_BOARD_TYPE_FACE.project.ink },
  'home.all': { icon: Clock, tone: 'text-sky-700' },
  'home.task': { icon: TASK_BOARD_TYPE_FACE.task.icon, tone: TASK_BOARD_TYPE_FACE.task.ink },
  'home.ticket': { icon: Clock, tone: 'text-orange-700' },
  'home.checklist': { icon: Clock, tone: 'text-emerald-700' },
  'home.project': { icon: Clock, tone: 'text-indigo-700' },
  'home.all-done': { icon: Check, tone: 'text-emerald-700' },
  // Held work (Pending · Follow-up · Blocked) wears the Pending face (`TASK_STATUS_FACE`).
  'home.all-waiting': { icon: TASK_STATUS_FACE.PENDING.icon, tone: TASK_STATUS_FACE.PENDING.ink },
  'home.ticket-done': { icon: Check, tone: 'text-emerald-700' },
  'home.checklist-done': { icon: Check, tone: 'text-emerald-700' },
  'home.project-done': { icon: Check, tone: 'text-emerald-700' },
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
  'catalog.add-product': { icon: Plus, tone: 'text-text-muted' },
  'catalog.import-csv': { icon: Upload, tone: 'text-text-muted' },
  'qc-labels.print': { icon: Printer, tone: 'text-text-muted' },
  'reports.refresh': { icon: RefreshCw, tone: 'text-text-muted' },
  'reports.export-packing': { icon: Download, tone: 'text-text-muted' },
  'reports.export-inbound': { icon: Download, tone: 'text-text-muted' },
  'reports.export-outbound': { icon: Download, tone: 'text-text-muted' },
  'studio.library': { icon: Layers, tone: 'text-text-muted' },
};
