import {
  Camera,
  Cpu,
  Layers,
  LayoutDashboard,
  Link2,
  Mail,
  Star,
  Tags,
  Wrench,
} from '@/components/Icons';

/**
 * The nav's icon contract, restated structurally rather than imported:
 * `sidebar-navigation.ts` derives Admin's spine children from
 * {@link ADMIN_SECTION_OPTIONS}, so importing `SidebarIconComponent` from
 * there would close an import cycle. Every house icon is a function
 * component, so this is the accurate type — `ComponentType` also admitted
 * class components, which made the derived array unassignable to
 * `SidebarChildPage[]`.
 */
type AdminSectionIcon = (props: { className?: string }) => JSX.Element;

/**
 * Residue console — what is left of /admin after the dissolution waves.
 *
 * W0+W1 (2026-09-06) moved eight sections to their one true home:
 * goals / quality / staff_schedule / system_sync / logs → Operations desk
 * modes; suppliers → Sourcing › Suppliers editor door; locations → Inventory
 * › Locations `manage` tab; fba → Shipping › FBA `catalog` mode. Those slugs
 * now REDIRECT in `src/app/admin/page.tsx` — they are not coming back here.
 *
 * What remains here is awaiting W2/W3: master data (reason_codes, favorites,
 * bose_models, compatibility, repair_issues) and the operations/system strays
 * (po_mailbox, station_photos, connections). When the last tab lands, /admin
 * dies and this file with it.
 */
export type AdminSection =
  | 'overview'
  | 'reason_codes' | 'favorites'
  | 'bose_models' | 'compatibility'
  | 'repair_issues'
  | 'po_mailbox' | 'station_photos'
  | 'connections';

export type AdminGroup = 'Operations' | 'Data & catalogs' | 'System';

export interface AdminSectionOption {
  value: AdminSection;
  label: string;
  description: string;
  /** Group heading shown above the first row of this group. Overview is ungrouped. */
  group?: AdminGroup;
  /** Permission required to see the row. Omitted = visible to anyone with admin.view. */
  requires?: string;
  icon: AdminSectionIcon;
}

export const ADMIN_SECTION_OPTIONS: AdminSectionOption[] = [
  { value: 'overview',     label: 'Overview',     description: 'System health & quick links',                                                       icon: LayoutDashboard },

  { value: 'po_mailbox',   label: 'PO Mailbox',   description: 'Triage emailed POs not in inventory, unmatched cartons, and exceptions', group: 'Operations', icon: Mail, requires: 'receiving.view' },
  { value: 'station_photos',label: 'Receiving Photos', description: 'Per-station NAS folder the photo picker opens to',          group: 'Operations', icon: Camera },

  { value: 'repair_issues',label: 'Repair Issues',description: 'Global repair issue checklist templates',                       group: 'Data & catalogs', icon: Wrench,       requires: 'repair.intake' },
  { value: 'favorites',    label: 'Favorites',    description: 'Quick-pick SKU shortcuts per workspace',                       group: 'Data & catalogs', icon: Star,         requires: 'sku_stock.manage' },
  { value: 'bose_models',  label: 'Bose Models',  description: 'Model catalog + the parts compatible with each model',          group: 'Data & catalogs', icon: Cpu,          requires: 'sourcing.view' },
  { value: 'compatibility',label: 'Compatibility',description: 'Audit the model ↔ part compatibility edge table',               group: 'Data & catalogs', icon: Layers,       requires: 'sourcing.view' },
  { value: 'reason_codes', label: 'Reason Codes', description: 'Movement, adjustment & shrinkage reason-code catalog',          group: 'Data & catalogs', icon: Tags,         requires: 'sku_stock.manage' },

  { value: 'connections',  label: 'Sync tools',   description: 'Run marketplace syncs, inventory tools, and connection activity', group: 'System',      icon: Link2 },
];
/** Legacy section slugs kept for redirects from bookmarks and deep links. */
export const ADMIN_SECTION_ALIASES: Record<string, AdminSection | 'settings'> = {
  integrations: 'settings',
  access: 'settings',
  roles: 'settings',
};

/**
 * Dissolved sections → their new home (W0+W1, 2026-09-06). `/admin` redirects
 * these before rendering; the query params worth keeping ride along. `staff`
 * is the legacy spelling of the staff schedule.
 */
export const ADMIN_SECTION_REDIRECTS: Record<string, string> = {
  goals: '/operations?mode=goals',
  quality: '/operations?mode=quality',
  staff_schedule: '/operations?mode=staff',
  staff: '/operations?mode=staff',
  system_sync: '/operations?mode=sync',
  logs: '/operations?mode=logs',
  suppliers: '/sourcing?mode=suppliers',
  locations: '/inventory/locations?tab=manage',
  fba: '/shipping/fba?fbaMode=catalog',
};

export function getAdminSection(raw: string | null | undefined): AdminSection {
  const v = String(raw || '').toLowerCase();
  const aliased = ADMIN_SECTION_ALIASES[v];
  if (aliased === 'settings') return 'overview';
  const resolved = (aliased ?? v) as AdminSection;
  return ADMIN_SECTION_OPTIONS.some((s) => s.value === resolved) ? resolved : 'overview';
}
