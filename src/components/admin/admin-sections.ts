import {
  LayoutDashboard,
  Link2,
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
 * LEGACY admin section registry — /admin is dissolved (2026-09-06, W0-W3);
 * `src/app/admin/page.tsx` owns the redirect table. This registry survives
 * ONLY to label stored deep links (quick-access pins / recents pointing at
 * /admin?section=*). Do not add sections here.
 *
 * W0+W1 (2026-09-06) moved eight sections to their one true home:
 * goals / quality / staff_schedule / system_sync / logs → Operations desk
 * modes; suppliers → Sourcing › Suppliers editor door; locations → Inventory
 * › Locations `manage` tab; fba → Shipping › FBA `catalog` mode.
 *
 * W2 (2026-09-06) moved the master data: po_mailbox → Inbound
 * (`/incoming?view=mailbox`); bose_models + compatibility → Sourcing modes;
 * reason_codes + favorites → Inventory sibling pages.
 *
 * W3 (2026-09-06) moved station_photos → Settings › Photos & NAS
 * (`/settings/photos`).
 *
 * What remains: connections (dies with per-app sync actions in the Apps
 * promotion) and repair_issues (parked — the repairs console is a
 * transaction feed, not a config face; needs a ruling). When the last tab
 * lands, /admin dies and this file with it.
 */
export type AdminSection =
  | 'overview'
  | 'repair_issues'
  | 'connections';

export type AdminGroup = 'System';

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
  { value: 'overview',     label: 'Overview',     description: 'System health & quick links',                     icon: LayoutDashboard },

  { value: 'repair_issues',label: 'Repair Issues',description: 'Global repair issue checklist templates',       group: 'System', icon: Wrench, requires: 'repair.intake' },

  { value: 'connections',  label: 'Sync tools',   description: 'Run marketplace syncs, inventory tools, and connection activity', group: 'System', icon: Link2 },
];

/** Legacy section slugs kept for redirects from bookmarks and deep links. */
export const ADMIN_SECTION_ALIASES: Record<string, AdminSection | 'settings'> = {
  integrations: 'settings',
  access: 'settings',
  roles: 'settings',
};

/**
 * Dissolved sections → their new home. `/admin` redirects these before
 * rendering; query params worth keeping ride along (`logs` keeps `?search=`
 * as `q`; `po_mailbox` keeps the Gmail OAuth flash params).
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
  po_mailbox: '/incoming?view=mailbox',
  station_photos: '/settings/photos',
  bose_models: '/sourcing?mode=models',
  compatibility: '/sourcing?mode=compatibility',
  reason_codes: '/inventory/reason-codes',
  favorites: '/inventory/favorites',
};

export function getAdminSection(raw: string | null | undefined): AdminSection {
  const v = String(raw || '').toLowerCase();
  const aliased = ADMIN_SECTION_ALIASES[v];
  if (aliased === 'settings') return 'overview';
  const resolved = (aliased ?? v) as AdminSection;
  return ADMIN_SECTION_OPTIONS.some((s) => s.value === resolved) ? resolved : 'overview';
}
