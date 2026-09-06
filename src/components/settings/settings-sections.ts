import type { ComponentType } from 'react';
import {
  Camera,
  FileText,
  Info,
  Link2,
  Lock,
  Monitor,
  PackageOpen,
  PaintBucket,
  Printer,
  Receipt,
  Settings,
  ShieldCheck,
  Smartphone,
  Tags,
  Type,
  User,
  Warehouse,
  Wrench,
  Zap,
} from '@/components/Icons';

export type SettingsSection =
  | 'hardware' | 'workstation' | 'quick-access' | 'appearance' | 'keyboard' | 'about'
  | 'security' | 'organization' | 'billing' | 'integrations' | 'team'
  | 'roles' | 'access' | 'sessions' | 'audit' | 'catalog' | 'legal' | 'receiving'
  | 'devices' | 'ai' | 'stations' | 'photos' | 'qa';

export type SettingsGroup = 'Personal' | 'Organization';

export interface SettingsSectionOption {
  id: SettingsSection;
  label: string;
  description: string;
  group?: SettingsGroup;
  requires?: string;
  /** Dedicated route when the section is not rendered inline on /settings. */
  href?: string;
  icon: ComponentType<{ className?: string }>;
}

export const SETTINGS_SECTION_OPTIONS: SettingsSectionOption[] = [
  { id: 'hardware',      label: 'Hardware',      description: 'Printer, scanner, scale',                          group: 'Personal', icon: Printer },
  { id: 'workstation',   label: 'Workstation',   description: 'Station, role, this device',                       group: 'Personal', icon: Monitor },
  { id: 'quick-access',  label: 'Quick Access',  description: 'Bottom-right shortcuts & pins',                    group: 'Personal', icon: Zap },
  { id: 'appearance',    label: 'Appearance',    description: 'Density, text size, pointer',                     group: 'Personal', icon: PaintBucket },
  { id: 'keyboard',      label: 'Keyboard',      description: 'Focus-scan hotkey & shortcut policy',              group: 'Personal', icon: Type },
  { id: 'receiving',     label: 'Receiving',     description: 'Unboxing scan, photos & org policy',               group: 'Personal', icon: PackageOpen },
  { id: 'security',      label: 'Security',      description: 'PIN and passkeys',                                 group: 'Personal', icon: Lock },
  { id: 'about',         label: 'About',         description: 'Version & diagnostics',                            group: 'Personal', icon: Info },
  { id: 'legal',         label: 'Legal & Policies', description: 'Terms, Privacy & DPA',                          group: 'Personal', icon: FileText },

  { id: 'organization',  label: 'Organization',  description: 'Timezone, locale, auth policies, warranty',        group: 'Organization', requires: 'admin.view', href: '/settings/organization', icon: Warehouse },
  { id: 'billing',       label: 'Billing',       description: 'Plan, entitlements & Stripe portal',               group: 'Organization', requires: 'admin.view', href: '/settings/billing', icon: Receipt },
  { id: 'integrations',  label: 'Apps & integrations', description: 'Connect inventory, sales channels, payments & more', group: 'Organization', requires: 'admin.view', href: '/apps', icon: Link2 },
  { id: 'catalog',       label: 'Platforms & Types', description: 'Sales channels & receiving flow types',          group: 'Organization', requires: 'admin.manage_features', icon: Tags },
  // Gate matches the door it uses — the nickname goes through
  // `PATCH /api/locations/[barcode]/properties`, which is `sku_stock.manage`.
  { id: 'stations',      label: 'Stations',      description: 'Name each packing & testing station',              group: 'Organization', requires: 'sku_stock.manage', icon: Settings },
  // Ex-Admin › Receiving Photos (W3, 2026-09-06): NAS endpoint, workflow
  // folders, station picker defaults, photos platform.
  { id: 'photos',        label: 'Photos & NAS',  description: 'NAS endpoint, storage folders & station defaults',  group: 'Organization', requires: 'admin.view', href: '/settings/photos', icon: Camera },
  { id: 'team',          label: 'Team',          description: 'Invite teammates, roles, deactivate access',       group: 'Organization', requires: 'admin.manage_staff', href: '/settings/staff', icon: User },
  { id: 'roles',         label: 'Roles',         description: 'Define what each role can do',                     group: 'Organization', requires: 'admin.manage_roles', href: '/settings/roles', icon: ShieldCheck },
  { id: 'access',        label: 'Access',        description: 'Per-staff role + page-access matrix',              group: 'Organization', href: '/settings/access', icon: Lock },
  { id: 'sessions',      label: 'Active sessions', description: 'See and revoke devices',                         group: 'Organization', requires: 'admin.view_sessions', icon: Smartphone },
  { id: 'devices',       label: 'Kiosk devices', description: 'Enroll & revoke customer intake tablets',          group: 'Organization', requires: 'walk_in.enroll_kiosk', icon: Smartphone },
  { id: 'audit',         label: 'Audit log',     description: 'Sign-ins, permission denials, role changes',       group: 'Organization', requires: 'admin.view_logs', href: '/settings/audit', icon: FileText },
  { id: 'qa',            label: 'Developer / QA', description: 'Sandbox scenarios, run ledger & fixture controls', group: 'Organization', requires: 'developer.qa_tools.view', href: '/settings/qa', icon: Wrench },
];

export function getActiveSettingsSection(raw: string | null | undefined): SettingsSection {
  const v = String(raw ?? '').toLowerCase();
  return SETTINGS_SECTION_OPTIONS.some((s) => s.id === v) ? (v as SettingsSection) : 'hardware';
}

export function resolveSettingsSectionFromPath(pathname: string | null | undefined): SettingsSection | null {
  if (!pathname) return null;
  if (pathname === '/settings/billing') return 'billing';
  if (pathname === '/apps') return 'integrations';
  if (pathname === '/settings/ai') return 'ai';
  if (pathname === '/settings/team' || pathname === '/settings/staff') return 'team';
  if (pathname === '/settings/roles') return 'roles';
  if (pathname === '/apps' || pathname === '/settings/integrations') return 'integrations';
  if (pathname === '/settings/audit') return 'audit';
  if (pathname === '/settings/organization') return 'organization';
  if (pathname === '/settings/qa') return 'qa';
  return null;
}
