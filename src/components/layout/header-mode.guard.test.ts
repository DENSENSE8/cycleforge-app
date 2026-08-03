/**
 * Source guard: L2 Mode + Recents + Pins live in GlobalHeader for every modeful page.
 * Pins the XOR — header mounts Mode/Recents/Pins; sidebar panels must not remount a
 * page-L2 mode rail twin. Nested facet sliders are OK. Avatar Quick Access must not
 * remount a pin list (pins = HeaderPinsSwitcher / useQuickAccess).
 *
 * Spine top = org/workspace ({@link OrgWorkspaceControl}); staff footer =
 * {@link StaffAccountFooter}. Desktop GlobalHeader has no staff avatar. Both
 * ends wear the SAME circular mark (`IdentityMark` / `StaffAvatar`), and the
 * org control is always a dropdown trigger — single-org accounts included.
 * Identity menus (org + staff ⋯) are a **child of the trigger** via
 * `SIDEBAR_SPINE_MENU_PANEL_CLASS` + `*-stretch` — never a wider magic width /
 * bare `text-sm`. Menu type = caption/micro (trigger org name stays body).
 *
 * SoT: SIDEBAR_PAGE_NAV + useSidebarChildNav · HeaderPageSwitcher · HeaderRecentsSwitcher
 *      · HeaderPinsSwitcher / useQuickAccess · OrgWorkspaceControl · StaffAccountFooter
 *      · IdentityMark / StaffAvatar · sidebar-spine.ts
 * Display law: .claude/rules/display/workbench.md (L2 in GlobalHeader)
 *
 * Run: node --test --import tsx \
 *        src/components/layout/header-mode.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getSidebarPageNav, SIDEBAR_PAGE_NAV } from '@/lib/sidebar-navigation';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const HEADER = code(sourceOf('./GlobalHeader.tsx'));
const HEADER_ACTIONS = code(sourceOf('./GlobalHeaderActions.tsx'));
const MODE = code(sourceOf('./HeaderPageSwitcher.tsx'));
const RECENTS = code(sourceOf('./HeaderRecentsSwitcher.tsx'));
const PINS = code(sourceOf('./HeaderPinsSwitcher.tsx'));
const HEADER_SHELL = code(sourceOf('./header-shell.ts'));
const QUICK_ACCESS_POPOVER = code(sourceOf('../quick-access/QuickAccessPopover.tsx'));
const ORG_CONTROL = code(sourceOf('../sidebar/master-nav/OrgWorkspaceControl.tsx'));
const STAFF_FOOTER = code(sourceOf('../sidebar/master-nav/StaffAccountFooter.tsx'));
const IDENTITY_MARK = code(sourceOf('../identity/IdentityMark.tsx'));
const NAV_LIST = code(sourceOf('../sidebar/master-nav/SidebarNavList.tsx'));
const MASTER_NAV = code(sourceOf('../sidebar/master-nav/MasterNav.tsx'));
const MASTER_VIEW = code(sourceOf('../sidebar/master-nav/MasterNavView.tsx'));

const PANEL_SOURCES = [
  '../sidebar/ReceivingSidebarPanel.tsx',
  '../sidebar/OutboundSidebarPanel.tsx',
  '../sidebar/ProductsSidebarPanel.tsx',
  '../sidebar/TechSidebarPanel.tsx',
  '../sidebar/PackerSidebarPanel.tsx',
  '../sidebar/InventorySidebarPanel.tsx',
  '../sidebar/SourcingSidebarPanel.tsx',
  '../sidebar/WarehouseSidebarPanel.tsx',
  '../sidebar/SupportSidebarPanel.tsx',
  '../sidebar/OperationsSidebarPanel.tsx',
] as const;

test('SIDEBAR_PAGE_NAV has multiple modeful pages for the header Mode control', () => {
  const modeful = SIDEBAR_PAGE_NAV.filter((p) => (p.children?.length ?? 0) > 1);
  assert.ok(modeful.length >= 8, `expected ≥8 modeful pages, got ${modeful.length}`);
  // Receiving family L1 pages are modeless; legacy `receiving` keeps mode
  // resolution for deep-links. Shipping stays modeful in the header.
  assert.equal(getSidebarPageNav('receive')?.children, undefined);
  assert.ok(getSidebarPageNav('receiving')?.children?.some((m) => m.id === 'receive'));
  assert.ok(getSidebarPageNav('outbound')?.children?.some((m) => m.id === 'labels'));
  assert.equal(
    getSidebarPageNav('outbound')?.children?.some((m) => m.id === 'scan-out'),
    false,
  );
  assert.equal(getSidebarPageNav('packer')?.children, undefined);
  assert.equal(getSidebarPageNav('scan-out')?.children, undefined);
});

test('GlobalHeader always mounts Mode + Recents + Pins (Mode nulls itself when modeless)', () => {
  assert.match(HEADER, /HeaderPageSwitcher/);
  assert.match(HEADER, /HeaderRecentsSwitcher/);
  assert.match(HEADER, /HeaderPinsSwitcher/);
  assert.doesNotMatch(HEADER, /isReceivingHeaderModeRoute/);
});

test('HeaderPageSwitcher navigates via SIDEBAR_PAGE_NAV + useSidebarChildNav', () => {
  assert.match(MODE, /getSidebarPageNav/);
  assert.match(MODE, /useSidebarChildNav/);
  assert.match(MODE, /useActiveSidebarChild/);
  assert.match(MODE, /AnchoredLayer/);
});

test('HeaderRecentsSwitcher reuses useRecentPages + useSidebarChildNav', () => {
  assert.match(RECENTS, /useRecentPages/);
  assert.match(RECENTS, /useSidebarChildNav/);
  assert.match(RECENTS, /AnchoredLayer/);
});

test('HeaderPinsSwitcher owns Quick Access pins (not the avatar popover)', () => {
  assert.match(PINS, /useQuickAccess/);
  assert.match(PINS, /HEADER_CLUSTER_HAIRLINE/);
  assert.match(PINS, /MAX_HEADER_PIN_ICONS/);
  assert.match(PINS, /reorder/);
  assert.match(HEADER_SHELL, /HEADER_CLUSTER_HAIRLINE/);
  assert.doesNotMatch(QUICK_ACCESS_POPOVER, /PinnedSection/);
  assert.doesNotMatch(QUICK_ACCESS_POPOVER, /PinThisPageButton/);
  assert.doesNotMatch(QUICK_ACCESS_POPOVER, /RecentSection/);
});

test('desktop GlobalHeaderActions has no staff avatar (spine owns identity)', () => {
  // Mobile still mounts the account avatar; desktop must not.
  assert.match(HEADER_ACTIONS, /isMobile/);
  assert.match(HEADER_ACTIONS, /QuickAccessPopover/);
  // Desktop path returns the icon cluster without an account avatar trigger
  // outside the isMobile branch — StaffAccountFooter is the desktop home.
  assert.match(STAFF_FOOTER, /data-staff-account-footer/);
  assert.match(NAV_LIST, /StaffAccountFooter/);
});

test('assistant Sparkles sits far-right in GlobalHeaderActions (opens right rail)', () => {
  // Spatial map: MasterNav collapse is far-left; AI opens the right edge, so it
  // is last in the desktop actions cluster — after search + utility popovers.
  assert.match(HEADER_ACTIONS, /GlobalHeaderAssistantButton/);
  assert.doesNotMatch(
    code(sourceOf('./GlobalHeaderSearch.tsx')),
    /Sparkles/,
    'Sparkles must not live beside Search — far-right only',
  );
  const assistantIdx = HEADER_ACTIONS.lastIndexOf('GlobalHeaderAssistantButton');
  const inboxIdx = HEADER_ACTIONS.indexOf('ActivityInboxPopover');
  assert.ok(inboxIdx >= 0 && assistantIdx > inboxIdx, 'AI must render after the inbox utility cluster');
});

test('OrgWorkspaceControl is the spine top band (not name-of-now page label)', () => {
  assert.match(MASTER_VIEW, /OrgWorkspaceControl/);
  assert.doesNotMatch(MASTER_VIEW, /MasterNavHeader/);
  assert.doesNotMatch(MASTER_VIEW, /headerLabel|leadingIcon=\{headerIcon\}/);
  assert.doesNotMatch(MASTER_NAV, /useRecentPages/);
  assert.doesNotMatch(MASTER_NAV, /recentModes/);
  assert.match(ORG_CONTROL, /data-master-nav-org/);
  assert.match(ORG_CONTROL, /text-role-body font-semibold leading-tight/);
  assert.match(ORG_CONTROL, /organizationName/);
  assert.match(ORG_CONTROL, /useSwitchOrg/);
});

test('spine identity marks are ONE circular primitive (org + staff)', () => {
  // The org mark shipped as a `rounded-md` square beside the footer's
  // `rounded-full` staff mark, with nothing in code tying them together.
  // Both ends of the spine now compose the same primitive at the same density.
  assert.match(ORG_CONTROL, /IdentityMark/);
  assert.match(STAFF_FOOTER, /StaffAvatarEditor/);
  assert.match(IDENTITY_MARK, /rounded-full/);
  // Neither end may hand-roll a mark box or its own initials again.
  assert.doesNotMatch(ORG_CONTROL, /rounded-md bg-surface-inverse|h-6 w-6 shrink-0 items-center/);
  assert.doesNotMatch(STAFF_FOOTER, /function initials/);
  assert.doesNotMatch(STAFF_FOOTER, /rounded-full text-role-micro/);
});

test('OrgWorkspaceControl is ALWAYS a dropdown trigger, single-org included', () => {
  // A control that is a button for some accounts and inert text for others
  // teaches two affordances for one slot. The single-org menu still names the
  // workspace and routes to Settings → Organization.
  assert.match(ORG_CONTROL, /aria-haspopup="listbox"/);
  assert.match(ORG_CONTROL, /aria-expanded=\{open\}/);
  // No `canSwitch ?` gate around the trigger or the layer — only around the
  // list of OTHER workspaces inside the open menu.
  assert.doesNotMatch(ORG_CONTROL, /\{canSwitch \? \(\s*<button/);
  assert.doesNotMatch(ORG_CONTROL, /\{canSwitch \? \(\s*<AnchoredLayer/);
  // Chevron is unconditional (it advertises the menu on every account).
  assert.doesNotMatch(ORG_CONTROL, /canSwitch \? \(\s*<ChevronDown/);
});

test('OrgWorkspaceControl left-justifies org label; multi-org may expand a menu', () => {
  assert.doesNotMatch(ORG_CONTROL, /absolute inset-0.*justify-center|justify-center.*absolute inset-0/);
  assert.match(ORG_CONTROL, /flex min-w-0 flex-1 items-center/);
  // Column open lives on SidebarNavColumn, not the org band.
  assert.doesNotMatch(ORG_CONTROL, /showNavToggle/);
  assert.doesNotMatch(MASTER_VIEW, /showNavToggle/);
  assert.doesNotMatch(MASTER_VIEW, /onOpen/);
  assert.doesNotMatch(MASTER_NAV, /onOpenNav/);
});

test('spine identity menus are a child of the trigger (SoT — never a wider magic w-[Npx])', () => {
  // Org switch + staff ⋯ menus used to ship w-[260px] / w-[280px] — wider than
  // the 240px spine. Width now comes from AnchoredLayer *-stretch against the
  // trigger/row (inset by band pad) + SIDEBAR_SPINE_MENU_* chrome — a denser
  // child of the control, not a full-column twin.
  const SPINE = code(sourceOf('../sidebar/sidebar-spine.ts'));
  assert.match(SPINE, /SIDEBAR_SPINE_MENU_PANEL_CLASS/);
  assert.match(SPINE, /SIDEBAR_SPINE_MENU_HEADER_CLASS/);
  assert.match(SPINE, /SIDEBAR_SPINE_MENU_ACTION_CLASS/);
  assert.match(SPINE, /SIDEBAR_SPINE_MENU_ORG_CLASS/);
  assert.match(SPINE, /SIDEBAR_SPINE_WIDTH_PX = 240/);

  assert.match(ORG_CONTROL, /SIDEBAR_SPINE_MENU_PANEL_CLASS/);
  assert.match(ORG_CONTROL, /placement="bottom-stretch"/);
  assert.match(ORG_CONTROL, /anchorRef=\{triggerRef\}/);
  // Chevron is enough — no "Current" eyebrow label in the org menu.
  assert.doesNotMatch(ORG_CONTROL, /\bCurrent\b/);
  assert.match(STAFF_FOOTER, /SIDEBAR_SPINE_MENU_PANEL_CLASS/);
  assert.match(STAFF_FOOTER, /placement="top-stretch"/);
  assert.match(STAFF_FOOTER, /anchorRef=\{rowRef\}/);
  // Org name stays load-bearing in the staff menu header.
  assert.match(STAFF_FOOTER, /SIDEBAR_SPINE_MENU_ORG_CLASS/);
  assert.match(STAFF_FOOTER, /organizationName/);

  // No second geometry — magic widths on these two files are a regression.
  assert.doesNotMatch(ORG_CONTROL, /w-\[\d+px\]/);
  assert.doesNotMatch(STAFF_FOOTER, /w-\[\d+px\]/);
});

test('spine staff avatar opens colour+photo editor (not Settings)', () => {
  assert.match(STAFF_FOOTER, /StaffAvatarEditor/);
  assert.doesNotMatch(STAFF_FOOTER, /<StaffAvatar\b/);
  const EDITOR = code(sourceOf('../identity/StaffAvatarEditor.tsx'));
  assert.match(EDITOR, /\/api\/staff\/\$\{staffId\}\/avatar/);
  assert.match(EDITOR, /\/api\/staff\/\$\{staffId\}\/color/);
  assert.match(EDITOR, /RoleColorPicker/);
  assert.match(EDITOR, /setStaffColorHex/);
  assert.match(EDITOR, /setStaffAvatarPhotoId/);
});

test('spine identity menus use dense caption type (no bare text-sm; org trigger stays body)', () => {
  // Trigger org name = text-role-body; menu names/actions = text-role-caption
  // (+ micro meta). Staff footer + ⋯ menu stay caption. A raw text-sm twin is
  // how menus drifted chunkier than the spine.
  assert.match(ORG_CONTROL, /data-master-nav-org[\s\S]*?text-role-body font-semibold/);
  assert.match(ORG_CONTROL, /SIDEBAR_SPINE_MENU_TITLE_CLASS/);
  assert.doesNotMatch(ORG_CONTROL, /\btext-sm\b/);
  assert.match(STAFF_FOOTER, /text-role-caption font-semibold leading-tight/);
  assert.doesNotMatch(STAFF_FOOTER, /\btext-sm\b/);
});

test('GlobalHeader and MasterNav spine share TOP_CHROME_BAND face (one hairline Y)', () => {
  assert.match(HEADER_SHELL, /TOP_CHROME_BAND_FACE/);
  assert.match(HEADER_SHELL, /h-\[40px\].*border-b border-border-soft|border-b border-border-soft.*h-\[40px\]/);
  assert.match(HEADER, /TOP_CHROME_BAND_CLASS/);
  assert.match(MASTER_VIEW, /TOP_CHROME_BAND_FACE/);
  // Regression: outer border-b wrapping a separate 40px child → 41px step.
  assert.doesNotMatch(MASTER_VIEW, /border-b border-border-hairline/);
  assert.doesNotMatch(ORG_CONTROL, /h-\[40px\]/);
});

test('modeful sidebar panels do not mount an L2 mode rail twin', () => {
  for (const rel of PANEL_SOURCES) {
    const src = code(sourceOf(rel));
    assert.doesNotMatch(
      src,
      /aria-label="(Receiving|Shipping|Products|Tech sidebar|Pack|Inventory section|Sourcing|Warehouse section|Support|Operations) mode"/,
      `${rel} still mounts a page-L2 mode rail`,
    );
  }
});
