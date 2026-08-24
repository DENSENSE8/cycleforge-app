'use client';

/**
 * PANEL_REGISTRY — the 19 left-column context panels as DATA.
 *
 * This was a 19-branch `if (routeKey === …) return <X/>` cascade sitting
 * directly under 19 `dynamic()` imports: already a one-to-one string → lazy
 * component map, written as control flow. As control flow only a route key
 * could reach it, so the window manager had no way to ask "what panels exist"
 * or "mount THIS one" without a pathname to hand it.
 *
 * The `dynamic()` calls are unchanged and still live at module top level —
 * per-route code splitting here was measured as the single largest bundle lever
 * (~1MB gz), and it is exactly where the chunk boundary belongs. SSR stays on
 * (the default), so the active route's panel is still server-rendered into the
 * first HTML.
 *
 * **No `permission` field.** Route access is gated by `withAuth` on the API
 * routes — the real boundary — and a per-descriptor permission would be a
 * second, weaker copy of that check.
 */

import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { APP_SIDEBAR_NAV, type SidebarIconComponent } from '@/lib/sidebar-navigation';
import { SIDEBAR_TITLES } from '@/lib/sidebar-titles';

// Every panel is code-split on its own chunk. Static imports here would drag
// every feature area's sidebar graph (orders, FBA, studio, support, …) into the
// shared shell bundle on every page.
const DashboardOrdersContextPanel = dynamic(() => import('@/components/sidebar/DashboardOrdersContextPanel').then((m) => m.DashboardOrdersContextPanel));
const AdminContextPanel = dynamic(() => import('@/components/sidebar/AdminContextPanel').then((m) => m.AdminContextPanel));
const OperationsSidebarPanel = dynamic(() => import('@/components/sidebar/OperationsSidebarPanel').then((m) => m.OperationsSidebarPanel));
const StudioSidebarPanel = dynamic(() => import('@/components/sidebar/StudioSidebarPanel').then((m) => m.StudioSidebarPanel));
const SupportSidebarPanel = dynamic(() => import('@/components/sidebar/SupportSidebarPanel').then((m) => m.SupportSidebarPanel));
const AiChatSidebarPanel = dynamic(() => import('@/components/sidebar/AiChatSidebarPanel').then((m) => m.AiChatSidebarPanel));
const SettingsSidebar = dynamic(() => import('@/components/sidebar/SettingsSidebarPanel').then((m) => m.SettingsSidebar));
const AuditLogSidebarPanel = dynamic(() => import('@/components/sidebar/AuditLogSidebarPanel').then((m) => m.AuditLogSidebarPanel));
const ReceivingSidebarPanel = dynamic(() => import('@/components/sidebar/ReceivingSidebarPanel').then((m) => m.ReceivingSidebarPanel));
const FbaSidebarPanel = dynamic(() => import('@/components/fba/sidebar').then((m) => m.FbaSidebarPanel));
const InventorySidebarPanel = dynamic(() => import('@/components/sidebar/InventorySidebarPanel').then((m) => m.InventorySidebarPanel));
const SourcingSidebarPanel = dynamic(() => import('@/components/sidebar/SourcingSidebarPanel').then((m) => m.SourcingSidebarPanel));
const ProductsSidebarPanel = dynamic(() => import('@/components/sidebar/ProductsSidebarPanel').then((m) => m.ProductsSidebarPanel));
const WalkInSidebarPanel = dynamic(() => import('@/components/sidebar/WalkInSidebarPanel').then((m) => m.WalkInSidebarPanel));
const TechSidebarPanel = dynamic(() => import('@/components/sidebar/TechSidebarPanel').then((m) => m.TechSidebarPanel));
const PackerSidebarPanel = dynamic(() => import('@/components/sidebar/PackerSidebarPanel').then((m) => m.PackerSidebarPanel));
const OutboundSidebarPanel = dynamic(() => import('@/components/sidebar/OutboundSidebarPanel').then((m) => m.OutboundSidebarPanel));
const SearchSidebarPanel = dynamic(() => import('@/components/sidebar/search/SearchSidebarPanel').then((m) => m.SearchSidebarPanel));

/**
 * The props every panel is mounted with. Most panels ignore all of them — the
 * host passes context, and a panel takes what it needs.
 */
export interface SidebarPanelProps {
  /** Opens the main app page list in the spine (the desktop chevron). */
  onBackToAppNav?: () => void;
  /** Verified staff id from the session cookie — never from a param. */
  staffId?: string;
  /** Label beside the chevron, e.g. "Testing". */
  contextNavTitle?: string;
}

export type PanelId =
  | 'dashboard'
  | 'admin'
  | 'operations'
  | 'studio'
  | 'support'
  | 'ai-chat'
  | 'settings'
  | 'audit-log'
  | 'receiving'
  | 'fba'
  | 'inventory'
  | 'sourcing'
  | 'products'
  | 'walk-in'
  | 'tech'
  | 'packer'
  | 'outbound'
  | 'search';

export interface PanelDescriptor {
  /**
   * The code-split panel. `dynamic()` already holds the `() => import(…)`
   * factory, so rendering this IS the load — nothing here is mounted until a
   * host asks for it.
   */
  load: ComponentType<SidebarPanelProps>;
  title: string;
  /**
   * Spine glyph, resolved from the one nav icon SoT. `null` for panels with no
   * spine row of their own (the dashboard feed, Audit Log under Admin › Logs,
   * FBA, Sales history) — a tab strip falls back to a generic glyph
   * rather than borrowing a neighbouring row's identity.
   */
  icon: SidebarIconComponent | null;
}

/** Every live panel has a `SIDEBAR_TITLES` row; `review` was the one exception
 *  and its route was deleted 2026-08-21. Kept as the seam for the next one. */
const EXTRA_TITLES: Partial<Record<PanelId, string>> = {};

function navIcon(navPageId: string | null): SidebarIconComponent | null {
  if (!navPageId) return null;
  return APP_SIDEBAR_NAV.find((item) => item.id === navPageId)?.icon ?? null;
}

function panel(
  id: PanelId,
  load: ComponentType<SidebarPanelProps>,
  navPageId: string | null,
): PanelDescriptor {
  return { load, title: SIDEBAR_TITLES[id] ?? EXTRA_TITLES[id] ?? id, icon: navIcon(navPageId) };
}

/** Testing is the one panel that needs the operator's identity to render. */
const TechPanel = (props: SidebarPanelProps) => (
  <TechSidebarPanel
    techId={props.staffId ?? '0'}
    onBackToAppNav={props.onBackToAppNav}
    contextNavTitle={props.contextNavTitle}
  />
);

/** Sales history mounts embedded (the spine owns the section header). */
const WalkInPanel = () => <WalkInSidebarPanel embedded hideSectionHeader />;

/**
 * The map. A `Record<PanelId, …>` on purpose: adding a `PanelId` makes the
 * compiler name the entry that is missing.
 *
 * Panels deliberately absent, each rail-less by ruling rather than by omission:
 * `home` (Today, Pattern E), `ops-photos` (Media library), `warehouse` (folded
 * under Inventory), `repair` (a Receiving MODE — it resolves to the `receiving`
 * key, so a branch here could never be reached).
 */
export const PANEL_REGISTRY: Record<PanelId, PanelDescriptor> = {
  dashboard: panel('dashboard', DashboardOrdersContextPanel, null),
  admin: panel('admin', AdminContextPanel, 'admin'),
  operations: panel('operations', OperationsSidebarPanel, 'operations'),
  studio: panel('studio', StudioSidebarPanel, 'studio'),
  support: panel('support', SupportSidebarPanel, 'support'),
  'ai-chat': panel('ai-chat', AiChatSidebarPanel, 'ai-chat'),
  settings: panel('settings', SettingsSidebar, 'settings'),
  'audit-log': panel('audit-log', AuditLogSidebarPanel, null),
  receiving: panel('receiving', ReceivingSidebarPanel, 'receive'),
  fba: panel('fba', FbaSidebarPanel, null),
  // /inventory's main shell owns its own header search + filter chips; this
  // panel carries the section toggle (Inventory ↔ Replenish) plus the tabbed
  // inventory / replenish sidebars. Locations desk folds in under it.
  inventory: panel('inventory', InventorySidebarPanel, 'inventory'),
  sourcing: panel('sourcing', SourcingSidebarPanel, 'sourcing'),
  products: panel('products', ProductsSidebarPanel, 'products'),
  'walk-in': panel('walk-in', WalkInPanel, null),
  tech: panel('tech', TechPanel, 'tech'),
  packer: panel('packer', PackerSidebarPanel, 'packer'),
  outbound: panel('outbound', OutboundSidebarPanel, 'outbound'),
  // `/search` — persistent find bar over recent finds (Zone 1 of the Search &
  // Details station layout), the documented exception to "find lives only in
  // GlobalHeaderSearch".
  search: panel('search', SearchSidebarPanel, 'search'),
};

const PANEL_IDS = new Set<string>(Object.keys(PANEL_REGISTRY));

export function isPanelId(value: string): value is PanelId {
  return PANEL_IDS.has(value);
}

/**
 * The route-key seam: a pathname's route key IS a panel id where a panel
 * exists, and nothing where it does not. Keeps the pathname path working while
 * the window manager addresses the same panels by id.
 */
export function resolvePanel(routeKey: string): PanelDescriptor | null {
  return isPanelId(routeKey) ? PANEL_REGISTRY[routeKey] : null;
}
