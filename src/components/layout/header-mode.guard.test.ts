/**
 * Source guard: L2 Mode + Recents + Pins live in GlobalHeader for every modeful page.
 * Pins the XOR — header mounts Mode/Recents/Pins; sidebar panels must not remount a
 * page-L2 mode rail twin. Nested facet sliders are OK. Avatar Quick Access must not
 * remount a pin list (pins = HeaderPinsSwitcher / useQuickAccess).
 *
 * The spine has NO org band (deleted 2026-08-03 — single-org is the norm for
 * small business; identity lives in the StaffAccountFooter ⋯ menu header and
 * switching in Settings → Organization). Staff footer = {@link StaffAccountFooter};
 * desktop GlobalHeader has no staff avatar. The staff mark is `IdentityMark` /
 * `StaffAvatar`. The staff ⋯ menu is a **child of the trigger** via
 * `SIDEBAR_SPINE_MENU_PANEL_CLASS` + `*-stretch` — never a wider magic width /
 * bare `text-sm`. Menu type = caption/micro (trigger org name stays body).
 *
 * SoT: SIDEBAR_PAGE_NAV + useSidebarChildNav · HeaderPageSwitcher · HeaderRecentsSwitcher
 *      · HeaderPinsSwitcher / useQuickAccess · StaffAccountFooter · SidebarCollapseControl
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
const STAFF_FOOTER = code(sourceOf('../sidebar/master-nav/StaffAccountFooter.tsx'));
const IDENTITY_MARK = code(sourceOf('../identity/IdentityMark.tsx'));
const NAV_LIST = code(sourceOf('../sidebar/master-nav/SidebarNavList.tsx'));
const MASTER_NAV = code(sourceOf('../sidebar/master-nav/MasterNav.tsx'));
const MASTER_VIEW = code(sourceOf('../sidebar/master-nav/MasterNavView.tsx'));
const WORKSPACE_SWITCHER = code(sourceOf('../settings/sections/WorkspaceSwitcher.tsx'));

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
  assert.match(STAFF_FOOTER, /Power/);
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

test('GlobalHeaderSearch is always mounted (never gated off /search or carton detail)', () => {
  // Find is a permanent chrome kind — rail entry on `/search` is additive.
  assert.match(HEADER_ACTIONS, /<GlobalHeaderSearch\s*\/>/);
  assert.doesNotMatch(HEADER_ACTIONS, /onSearchPage/);
  assert.doesNotMatch(
    HEADER_ACTIONS,
    /!onSearchPage\s*\?\s*<GlobalHeaderSearch/,
  );
});

test('the spine has NO org/workspace band — identity and switching moved', () => {
  // Deleted 2026-08-03. This is small-business software: an operator belongs to
  // one org, so a permanent 40px row naming it spent the spine's most valuable
  // space restating something that never changes.
  //
  // Nothing was LOST, and that is the precondition for deleting it rather than
  // hiding it: org IDENTITY still renders in the StaffAccountFooter ⋯ menu
  // header, and org SWITCHING still lives in Settings → Organization
  // (`WorkspaceSwitcher`) — the honest home for a rare, deliberate act.
  assert.doesNotMatch(MASTER_VIEW, /OrgWorkspaceControl/);
  assert.doesNotMatch(MASTER_VIEW, /MasterNavHeader/);
  assert.doesNotMatch(MASTER_VIEW, /headerLabel|leadingIcon=\{headerIcon\}/);
  assert.doesNotMatch(MASTER_NAV, /useRecentPages/);
  // Both survivors are load-bearing: lose either and org identity, or the
  // ability to reach a second tenant at all, leaves the product.
  assert.match(STAFF_FOOTER, /organizationName/);
  assert.match(WORKSPACE_SWITCHER, /requestSwitchOrg|useSwitchOrg/);
});

test('the spine staff mark is the ONE circular identity primitive', () => {
  // The org mark shipped as a `rounded-md` square beside the footer's
  // `rounded-full` staff mark, with nothing in code tying them together.
  // Both ends of the spine now compose the same primitive at the same density.
  assert.match(STAFF_FOOTER, /StaffAvatarEditor/);
  assert.match(IDENTITY_MARK, /rounded-full/);
  // Neither end may hand-roll a mark box or its own initials again.
  assert.doesNotMatch(STAFF_FOOTER, /function initials/);
  assert.doesNotMatch(STAFF_FOOTER, /rounded-full text-role-micro/);
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

  // Chevron is enough — no "Current" eyebrow label in the org menu.
  assert.match(STAFF_FOOTER, /SIDEBAR_SPINE_MENU_PANEL_CLASS/);
  assert.match(STAFF_FOOTER, /placement="top-stretch"/);
  assert.match(STAFF_FOOTER, /anchorRef=\{rowRef\}/);
  // Org name stays load-bearing in the staff menu header.
  assert.match(STAFF_FOOTER, /SIDEBAR_SPINE_MENU_ORG_CLASS/);
  assert.match(STAFF_FOOTER, /organizationName/);

  // No second geometry — magic widths on these two files are a regression.
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
});

/**
 * Sidebar toggle MARK ↔ context-rail scan icon share one left column.
 * Left pad is the rail gutter; do not re-symmetricize HEADER_INSET_X.
 */
test('GlobalHeader left inset matches rail gutter; sidebar toggle is not over-pulled', () => {
  assert.match(HEADER_SHELL, /HEADER_INSET_X\s*=\s*cn\(SIDEBAR_RAIL_INSET_LEFT/);
  assert.match(HEADER_SHELL, /pr-3 sm:pr-4/);
  assert.doesNotMatch(HEADER_SHELL, /HEADER_INSET_X\s*=\s*['"]px-3 sm:px-4['"]/);
  assert.match(HEADER, /HEADER_INSET_X/);

  const COLLAPSE = code(sourceOf('./SidebarCollapseControl.tsx'));
  // Hit box may bleed (`-ml-px`); the old `-ml-1.5` was compensating for a
  // too-deep header pad and must not come back as the alignment lever.
  assert.doesNotMatch(COLLAPSE, /-ml-1\.5/);
  assert.match(COLLAPSE, /HEADER_ICON_WRAP/);
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
