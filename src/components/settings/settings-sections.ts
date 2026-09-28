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
  Sparkles,
  Tags,
  Type,
  User,
  Warehouse,
  Zap,
  Wrench,
} from '@/components/Icons';

export type SettingsSection =
  | 'hardware' | 'workstation' | 'quick-access' | 'appearance' | 'keyboard' | 'about'
  | 'security' | 'organization' | 'billing' | 'integrations' | 'team'
  | 'roles' | 'access' | 'sessions' | 'audit' | 'catalog' | 'legal' | 'receiving'
  | 'devices' | 'ai' | 'stations'
  // Absorbed from /admin on dissolution: org config and process master data
  // that no desk owns.
  | 'photos' | 'repair-issues'
  // SIMPLE-FIRST: what the org has switched on + its build history.
  | 'capabilities';

export type SettingsGroup = 'Personal' | 'Organization';

/**
 * Landing categories (2026-09-06 rail removal): the org sections group into
 * card clusters on `/settings`; the Personal sections collapse into the one
 * "Your setup" scroll page (`/settings/me`).
 */
export type SettingsCategory =
  | 'workspace' | 'apps' | 'people' | 'data' | 'devices' | 'developer';

export const SETTINGS_CATEGORY_LABELS: Record<SettingsCategory, string> = {
  workspace: 'Workspace',
  apps: 'Apps',
  people: 'Access & people',
  data: 'Data & catalogs',
  devices: 'Devices',
  developer: 'Developer',
};

/** Semantic well/ink for landing tiles — theme tokens, never raw hues. */
export type SettingsChromeTone =
  | 'accent'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'fulfillment';

const SETTINGS_TONE_WELL: Record<SettingsChromeTone, string> = {
  accent: 'bg-surface-accent text-accent-text',
  info: 'bg-fill-info/15 text-text-info',
  success: 'bg-surface-success text-text-success',
  warning: 'bg-surface-warning text-text-warning',
  danger: 'bg-surface-danger text-text-danger',
  fulfillment: 'bg-fill-fulfillment/15 text-text-fulfillment',
};

export const SETTINGS_TONE_INK: Record<SettingsChromeTone, string> = {
  accent: 'text-accent-text',
  info: 'text-text-info',
  success: 'text-text-success',
  warning: 'text-text-warning',
  danger: 'text-text-danger',
  fulfillment: 'text-text-fulfillment',
};

/**
 * Settings family ground — accent surface (ops wash), not gray canvas.
 * White cards sit a step below. Billing’s success tone is the Receipt
 * icon only — not a green card wash.
 */
export const SETTINGS_FLOOR_CLASS = 'bg-surface-accent';

const SETTINGS_CATEGORY_TONE: Record<SettingsCategory, SettingsChromeTone> = {
  workspace: 'info',
  apps: 'fulfillment',
  people: 'success',
  data: 'warning',
  devices: 'accent',
  developer: 'danger',
};

/** Org-section → landing category. Personal sections are not listed — they
 * live on /settings/me. */
export const SETTINGS_SECTION_CATEGORY: Partial<Record<SettingsSection, SettingsCategory>> = {
  organization: 'workspace',
  billing: 'workspace',
  ai: 'workspace',
  capabilities: 'workspace',
  integrations: 'apps',
  team: 'people',
  roles: 'people',
  access: 'people',
  sessions: 'people',
  catalog: 'data',
  stations: 'data',
  receiving: 'data',
  photos: 'data',
  'repair-issues': 'data',
  devices: 'devices',
  audit: 'developer',
};

export interface SettingsSectionOption {
  id: SettingsSection;
  label: string;
  description: string;
  group?: SettingsGroup;
  requires?: string;
  /** Dedicated route when the section is not rendered inline on /settings. */
  href?: string;
  icon: ComponentType<{ className?: string }>;
  tone: SettingsChromeTone;
}

export const SETTINGS_SECTION_OPTIONS: SettingsSectionOption[] = [
  { id: 'hardware',      label: 'Hardware',      description: 'Printer, scanner, scan feedback, scale',           group: 'Personal', icon: Printer, tone: 'info' },
  { id: 'workstation',   label: 'Workstation',   description: 'Station, role, this device',                       group: 'Personal', icon: Monitor, tone: 'fulfillment' },
  { id: 'quick-access',  label: 'Quick access',  description: 'Bottom-right shortcuts & pins',                    group: 'Personal', icon: Zap, tone: 'warning' },
  { id: 'appearance',    label: 'Appearance',    description: 'Density, text size, pointer',                     group: 'Personal', icon: PaintBucket, tone: 'accent' },
  { id: 'keyboard',      label: 'Keyboard',      description: 'Focus-scan hotkey & shortcut policy',              group: 'Personal', icon: Type, tone: 'success' },
  // Receiving is ORG policy through and through (every registry def is
  // scope: 'org') — it moved off the personal page to Data & catalogs
  // (Impeccable design review, 2026-09-07).
  { id: 'receiving',     label: 'Receiving policy', description: 'Unboxing photo & procedure policy for everyone',   group: 'Organization', requires: 'admin.view', href: '/settings/receiving', icon: PackageOpen, tone: 'warning' },
  { id: 'security',      label: 'Security',      description: 'PIN and passkeys',                                 group: 'Personal', icon: Lock, tone: 'danger' },
  { id: 'about',         label: 'About',         description: 'Version & diagnostics',                            group: 'Personal', icon: Info, tone: 'info' },
  { id: 'legal',         label: 'Legal & policies', description: 'Terms, Privacy & DPA',                          group: 'Personal', icon: FileText, tone: 'fulfillment' },

  { id: 'organization',  label: 'Organization',  description: 'Timezone, locale, auth policies, warranty',        group: 'Organization', requires: 'admin.view', href: '/settings/organization', icon: Warehouse, tone: 'info' },
  { id: 'billing',       label: 'Billing',       description: 'Plan, entitlements & Stripe portal',               group: 'Organization', requires: 'admin.view', href: '/settings/billing', icon: Receipt, tone: 'success' },
  { id: 'ai',            label: 'AI & search',   description: 'AI provider, search usage & pricing',              group: 'Organization', requires: 'admin.view', href: '/settings/ai', icon: Sparkles, tone: 'accent' },
  { id: 'capabilities',  label: 'Capabilities & history', description: 'What your workspace has switched on, and when', group: 'Organization', requires: 'admin.view', href: '/settings/capabilities', icon: Sparkles, tone: 'accent' },
  // This tree keeps integrations at /settings/integrations (no /apps marketplace yet).
  { id: 'integrations',  label: 'Apps & integrations', description: 'Connect inventory, sales channels, payments & more', group: 'Organization', requires: 'admin.view', href: '/settings/integrations', icon: Link2, tone: 'fulfillment' },
  { id: 'catalog',       label: 'Platforms & types', description: 'Sales channels & receiving flow types',          group: 'Organization', requires: 'admin.manage_features', icon: Tags, tone: 'warning' },
  // Gate matches the door it uses — the nickname goes through
  // `PATCH /api/locations/[barcode]/properties`, which is `sku_stock.manage`.
  { id: 'stations',      label: 'Stations',      description: 'Name each packing & testing station',              group: 'Organization', requires: 'sku_stock.manage', icon: Settings, tone: 'success' },
  // Ex-Admin › Receiving Photos: NAS endpoint, workflow folders, station
  // picker defaults, photos platform.
  { id: 'photos',        label: 'Photos & NAS',  description: 'NAS endpoint, storage folders & station defaults',  group: 'Organization', requires: 'admin.view', href: '/settings/photos', icon: Camera, tone: 'warning' },
  // Ex-Admin › Repair Issues: process master data, the Platforms & types
  // family — flow vocabulary the repair bench consumes but no desk owns.
  { id: 'repair-issues', label: 'Repair issues', description: 'Global repair issue checklist templates',           group: 'Organization', requires: 'repair.intake', href: '/settings/repair-issues', icon: Wrench, tone: 'warning' },
  { id: 'team',          label: 'Team',          description: 'Invite teammates, roles, deactivate access',       group: 'Organization', requires: 'admin.manage_staff', href: '/settings/staff', icon: User, tone: 'success' },
  { id: 'roles',         label: 'Roles',         description: 'Define what each role can do',                     group: 'Organization', requires: 'admin.manage_roles', href: '/settings/roles', icon: ShieldCheck, tone: 'info' },
  { id: 'access',        label: 'Access',        description: 'Per-staff role + page-access matrix',              group: 'Organization', href: '/settings/access', icon: Lock, tone: 'danger' },
  { id: 'sessions',      label: 'Active sessions', description: 'See and revoke devices',                         group: 'Organization', requires: 'admin.view_sessions', icon: Smartphone, tone: 'fulfillment' },
  { id: 'devices',       label: 'Kiosk devices', description: 'Enroll & revoke customer intake tablets',          group: 'Organization', requires: 'walk_in.enroll_kiosk', icon: Smartphone, tone: 'accent' },
  { id: 'audit',         label: 'Audit log',     description: 'Sign-ins, permission denials, role changes',       group: 'Organization', requires: 'admin.view_logs', href: '/settings/audit', icon: FileText, tone: 'danger' },
];

export function getActiveSettingsSection(raw: string | null | undefined): SettingsSection {
  const v = String(raw ?? '').toLowerCase();
  return SETTINGS_SECTION_OPTIONS.some((s) => s.id === v) ? (v as SettingsSection) : 'hardware';
}

/** Canonical route for a section: its `href` when set, else `/settings/<id>`. */
export function settingsSectionRoute(id: SettingsSection): string {
  const def = SETTINGS_SECTION_OPTIONS.find((s) => s.id === id);
  return def?.href ?? `/settings/${id}`;
}

/** Phone settings list: personal rows land on the me scroll; org rows keep their route. */
export function settingsSectionHref(id: SettingsSection): string {
  const def = SETTINGS_SECTION_OPTIONS.find((s) => s.id === id);
  if (!def) return '/settings';
  if (def.group === 'Personal') return `/settings/me#${def.id}`;
  return settingsSectionRoute(def.id);
}

export function resolveSettingsSectionFromPath(pathname: string | null | undefined): SettingsSection | null {
  if (!pathname) return null;
  // `/settings/<segment>` resolves by section id (hardware, quick-access,
  // devices, …), then by the alias spellings that predate the unification.
  const m = pathname.match(/^\/settings\/([a-z-]+)(?:\/|$)/);
  if (m) {
    const seg = m[1];
    if (seg === 'me') return null;
    if (SETTINGS_SECTION_OPTIONS.some((s) => s.id === seg)) return seg as SettingsSection;
    if (seg === 'team' || seg === 'staff') return 'team';
    if (seg === 'integrations') return 'integrations';
  }
  return null;
}
