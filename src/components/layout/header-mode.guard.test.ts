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
 * The left cluster ORDER is pinned (toggle · Pins · Recents · page identity),
 * the page face is one `PAGE_FACE_CLASS` shared by the static
 * chip and the menu trigger, and every header dropdown composes
 * `HeaderChromeMenu` / `HeaderChromeMenuItem` — see
 * `.claude/rules/source-of-truth.md` → **GlobalHeader left cluster**.
 *
 * Pace-and-next (`HeaderGoalChip`) sits in `GlobalHeaderActions` between search
 * and inbox — never in the nav cluster.
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
const RECENT_PAGES = code(sourceOf('../sidebar/master-nav/useRecentPages.ts'));
const PINS = code(sourceOf('./HeaderPinsSwitcher.tsx'));
const CHROME_MENU = code(sourceOf('./header-chrome-menu.tsx'));
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

test('GlobalHeader always mounts Page + Recents + Pins', () => {
  assert.match(HEADER, /HeaderPageSwitcher/);
  assert.match(HEADER, /HeaderRecentsSwitcher/);
  assert.match(HEADER, /HeaderPinsSwitcher/);
  assert.doesNotMatch(HEADER, /isReceivingHeaderModeRoute/);
});

// SoT: source-of-truth.md → "GlobalHeader zones". Nav = saved → trail → where I am.
test('GlobalHeader left cluster keeps the pinned slot ORDER', () => {
  const CLUSTER_ORDER = [
    'SidebarCollapseControl',
    'HeaderPinsSwitcher',
    'HeaderRecentsSwitcher',
    'HeaderPageSwitcher',
  ] as const;
  assert.match(HEADER, /HEADER_ICON_CLUSTER/, 'left cluster uses the shared class');
  const positions = CLUSTER_ORDER.map((name) => {
    const at = HEADER.indexOf(`<${name}`);
    assert.ok(at > 0, `${name} must be mounted in the left cluster`);
    return { name, at };
  });
  for (let i = 1; i < positions.length; i += 1) {
    assert.ok(
      positions[i]!.at > positions[i - 1]!.at,
      `${positions[i]!.name} must render after ${positions[i - 1]!.name} `
        + '(see source-of-truth.md → GlobalHeader zones)',
    );
  }
  // Pace-and-next is an action, never a nav occupant.
  assert.doesNotMatch(
    HEADER,
    /HeaderGoalChip/,
    'HeaderGoalChip mounts in GlobalHeaderActions (search → goal → inbox), not nav',
  );
});

test('pace-and-next sits between search and inbox in GlobalHeaderActions', () => {
  // Search is a sibling outside the actions icon cluster; goal leads the cluster
  // so the ring sits between find and the inbox / assistant utilities.
  assert.match(HEADER_ACTIONS, /<GlobalHeaderSearch\s*\/>/);
  assert.match(HEADER_ACTIONS, /<HeaderGoalChip\s*\/>/);
  // Measure mount order in the desktop actions cluster — `ActivityInboxPopover`
  // also appears earlier as the iconCluster definition, so slice from the zone.
  const zoneAt = HEADER_ACTIONS.indexOf('data-header-zone="actions"');
  assert.ok(zoneAt >= 0, 'actions zone marker present');
  const zone = HEADER_ACTIONS.slice(zoneAt);
  const goalAt = zone.indexOf('<HeaderGoalChip');
  const inboxAt = zone.indexOf('iconCluster');
  const assistantAt = zone.lastIndexOf('GlobalHeaderAssistantButton');
  assert.ok(goalAt >= 0, 'HeaderGoalChip mounts in the actions zone');
  assert.ok(inboxAt > goalAt, 'inbox cluster after goal');
  assert.ok(assistantAt > inboxAt, 'assistant far-right after inbox');
  const searchAt = HEADER_ACTIONS.indexOf('<GlobalHeaderSearch');
  assert.ok(searchAt >= 0 && searchAt < zoneAt, 'search mounts before the actions cluster');
});

test('the page face is ONE shared chrome (static chip === menu trigger)', () => {
  assert.match(MODE, /PAGE_FACE_CLASS/);
  // Both branches wear it — a static span and a Button, pixel-matched.
  assert.ok(
    (MODE.match(/PAGE_FACE_CLASS/g) ?? []).length >= 3,
    'PAGE_FACE_CLASS must be declared once and applied to both faces',
  );
  assert.match(MODE, /HEADER_ICON_BTN_CLASS/);
  assert.match(MODE, /text-role-caption/);
  // Mute tone is HEADER_ICON_BTN_CLASS (`text-text-muted`) — same DS token as
  // Recents / Pins / WO. A local text-text-default on PAGE_FACE_CLASS forks
  // the page face black while every other left-cluster icon stays gray.
  assert.doesNotMatch(
    MODE,
    /PAGE_FACE_CLASS[\s\S]{0,280}text-text-default/,
    'page face mute comes from HEADER_ICON_BTN_CLASS, never a local text-text-default',
  );
  assert.doesNotMatch(
    MODE,
    /text-\[\d+px\]/,
    'page face type comes from text-role-*, never a raw px size',
  );
});

test('pin chord hints come from pin-hotkeys (never a hand-typed ⌘ label)', () => {
  assert.match(PINS, /pinHotkeyLabel/);
  assert.doesNotMatch(
    PINS,
    /['"`][^'"`]*(?:⌘|Ctrl\+)\s*\d/,
    'advertise the chord via pinHotkeyLabel so hint and listener cannot drift',
  );
});

test('HeaderPageSwitcher navigates via SIDEBAR_PAGE_NAV + useSidebarChildNav', () => {
  assert.match(MODE, /getSidebarPageNav/);
  assert.match(MODE, /useSidebarChildNav/);
  assert.match(MODE, /useActiveSidebarChild/);
  assert.match(MODE, /AnchoredLayer/);
});

test('HeaderPageSwitcher always shows page identity (station subgroup menu; other modeless static)', () => {
  // Must resolve APP_SIDEBAR_NAV-only rows (Search, Chat) and modeless stations
  // (Unbox / Arrival / …) — never early-return solely on missing children.
  assert.match(MODE, /APP_SIDEBAR_NAV/);
  assert.match(MODE, /switchable/);
  assert.doesNotMatch(
    MODE,
    /if\s*\(\s*!hasChildPages/,
    'modeless pages must keep the icon + display name face',
  );
  assert.match(
    MODE,
    /activeRow\?\.label\s*\?\?\s*page\.label/,
    'face label falls back to the page label when there is no active menu row',
  );
  // Receiving peers come from stationSubgroupMembers — never legacy family children.
  assert.match(MODE, /stationSubgroupMembers/);
  assert.match(MODE, /stationSubgroupOfPage/);
  assert.match(MODE, /getStationSubgroupDef/);
  assert.doesNotMatch(MODE, /RECEIVING_HEADER_FAMILY_IDS/);
  assert.doesNotMatch(
    MODE,
    /getSidebarPageNav\(\s*['"]receiving['"]\s*\)/,
    'header must not read legacy receiving.children for display',
  );
  assert.match(
    MODE,
    /menuNav:\s*['"]page['"]/,
    'Receiving peers navigate as first-class page ids',
  );
});

test('HeaderRecentsSwitcher reuses useRecentPages + useSidebarChildNav', () => {
  assert.match(RECENTS, /useRecentPages/);
  assert.match(RECENTS, /MAX_RECENT_PAGES/);
  assert.match(RECENTS, /More recent/);
  assert.match(RECENTS, /useSidebarChildNav/);
  assert.match(RECENTS, /AnchoredLayer/);
  assert.match(
    RECENT_PAGES,
    /export const MAX_RECENT_PAGES = 5/,
    'More recent menu shows up to 5 prior displays (excludes active)',
  );
});

test('Page · Recents · Pins share HeaderChromeMenu SoT (no local panel twin)', () => {
  assert.match(CHROME_MENU, /export function HeaderChromeMenu/);
  assert.match(CHROME_MENU, /export const HeaderChromeMenuItem/);
  assert.match(CHROME_MENU, /min-w-\[11rem\]/);
  // Industrial flush column — zero radius, zero outer pad, square row hover.
  assert.match(CHROME_MENU, /rounded-none/);
  assert.match(CHROME_MENU, /\bp-0\b/);
  assert.doesNotMatch(CHROME_MENU, /rounded-xl|rounded-lg|rounded-full/);
  for (const [name, src] of [
    ['HeaderPageSwitcher', MODE],
    ['HeaderRecentsSwitcher', RECENTS],
    ['HeaderPinsSwitcher', PINS],
  ] as const) {
    assert.match(src, /HeaderChromeMenu/, `${name} must import HeaderChromeMenu`);
    assert.match(src, /HeaderChromeMenuItem/, `${name} must import HeaderChromeMenuItem`);
    assert.doesNotMatch(
      src,
      /min-w-\[11rem\] overflow-hidden rounded-xl border border-border-soft bg-surface-card p-1/,
      `${name} must not fork the chrome menu panel classes`,
    );
  }
});

test('HEADER_ICON_BTN_CLASS is a square hover wash (never a circle)', () => {
  assert.match(HEADER_SHELL, /HEADER_ICON_BTN_CLASS/);
  assert.match(
    HEADER_SHELL,
    /h-full min-h-8 w-full rounded-none text-text-muted hover:bg-surface-sunken/,
  );
  assert.doesNotMatch(
    HEADER_SHELL,
    /HEADER_ICON_BTN_CLASS[\s\S]{0,120}rounded-full/,
    'header icon hover plates must be square',
  );
});

test('HEADER icon cells fill the chrome beam (no floated h-8 island)', () => {
  assert.match(HEADER_SHELL, /HEADER_ICON_WRAP = 'relative flex h-full min-h-0 w-8/);
  assert.match(HEADER_SHELL, /HEADER_ICON_CLUSTER = `flex h-full shrink-0 items-stretch/);
  assert.match(HEADER_SHELL, /TOP_CHROME_BAND_CLASS = `flex items-stretch/);
  assert.match(HEADER_SHELL, /HEADER_ICON_GAP = 'gap-0'/);
});

test('HeaderPinsSwitcher owns Quick Access pins (not the avatar popover)', () => {
  assert.match(PINS, /useQuickAccess/);
  assert.match(PINS, /MAX_PIN_HOTKEY_SLOTS/);
  assert.match(PINS, /verticalListSortingStrategy/);
  assert.match(PINS, /reorder/);
  assert.match(PINS, /pinSlotFromKeyboardEvent/);
  assert.doesNotMatch(PINS, /HEADER_CLUSTER_HAIRLINE/);
  assert.doesNotMatch(HEADER_SHELL, /HEADER_CLUSTER_HAIRLINE/);
  assert.match(
    PINS,
    /return\s*\(\s*<div ref=\{wrapRef\} className=\{HEADER_ICON_WRAP\}>/,
    'pin face sits directly in the parent cluster without a padded wrapper',
  );
  assert.doesNotMatch(PINS, /MAX_HEADER_PIN_ICONS/);
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
  // Find is a permanent chrome kind — sole find surface on every route,
  // including `/search` (no locked-width stage field).
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
  // Flush peer of HeaderChromeMenu — soft radius must not return on panel/actions.
  assert.match(SPINE, /SIDEBAR_SPINE_MENU_PANEL_CLASS[\s\S]*?rounded-none/);
  assert.match(SPINE, /SIDEBAR_SPINE_MENU_ACTION_CLASS[\s\S]*?rounded-none/);
  assert.doesNotMatch(
    SPINE.match(/SIDEBAR_SPINE_MENU_PANEL_CLASS[\s\S]*?;/)?.[0] ?? '',
    /rounded-lg|rounded-md|rounded-xl/,
  );
  assert.doesNotMatch(
    SPINE.match(/SIDEBAR_SPINE_MENU_ACTION_CLASS[\s\S]*?;/)?.[0] ?? '',
    /rounded-lg|rounded-md|rounded-xl/,
  );

  // Chevron is enough — no "Current" eyebrow label in the org menu.
  assert.match(STAFF_FOOTER, /SIDEBAR_SPINE_MENU_PANEL_CLASS/);
  assert.match(STAFF_FOOTER, /placement="top-stretch"/);
  assert.match(STAFF_FOOTER, /anchorRef=\{rowRef\}/);
  // Org name stays load-bearing in the staff menu header.
  assert.match(STAFF_FOOTER, /SIDEBAR_SPINE_MENU_ORG_CLASS/);
  assert.match(STAFF_FOOTER, /organizationName/);
  // Staff footer = full-width station floor band (h-8 · shared hairline).
  assert.match(STAFF_FOOTER, /STATION_COLUMN_FOOTER_BAND_FACE/);
  assert.doesNotMatch(STAFF_FOOTER, /\bh-9\b/, 'sign-in floor must share h-8 band, not h-9');
  assert.match(STAFF_FOOTER, /w-full shrink-0/);
  assert.match(STAFF_FOOTER, /space-y-0 p-0/);
  assert.doesNotMatch(STAFF_FOOTER, /rounded-md|rounded-lg/);

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
  // Face name = role-nav (matches spine ladder); ⋯ menu title/actions use the
  // spine caption tokens. A raw text-sm twin is how menus drifted chunkier.
  assert.match(STAFF_FOOTER, /text-role-nav font-medium/);
  assert.match(STAFF_FOOTER, /SIDEBAR_SPINE_MENU_TITLE_CLASS/);
  assert.doesNotMatch(STAFF_FOOTER, /\btext-sm\b/);
});

test('GlobalHeader and MasterNav spine share TOP_CHROME_BAND face (one hairline Y)', () => {
  assert.match(HEADER_SHELL, /TOP_CHROME_BAND_FACE/);
  assert.match(HEADER_SHELL, /TOP_CHROME_ROW_FACE = 'h-10 shrink-0'/);
  assert.match(
    HEADER_SHELL,
    /TOP_CHROME_BAND_FACE = `\$\{TOP_CHROME_ROW_FACE\} border-b border-border-soft`/,
  );
  // Station-column floor hairline — Context · utility · Displays · dock · sign-in.
  assert.match(HEADER_SHELL, /STATION_COLUMN_FOOTER_SEAM_CLASS = 'border-t border-border-hairline'/);
  assert.match(HEADER_SHELL, /STATION_COLUMN_FOOTER_BAND_FACE/);
  assert.match(HEADER, /TOP_CHROME_BAND_CLASS/);
  assert.match(MASTER_VIEW, /TOP_CHROME_BAND_FACE/);
  // Regression: outer border-b wrapping a separate 40px child → 41px step.
  assert.doesNotMatch(MASTER_VIEW, /border-b border-border-hairline/);
});

/**
 * GlobalHeader is edge-flush — no left/right inset. Icon cells own their geometry.
 */
test('GlobalHeader is edge-flush (no left/right inset)', () => {
  assert.match(HEADER_SHELL, /HEADER_INSET_X = 'px-0'/);
  assert.match(HEADER, /HEADER_INSET_X/);

  const COLLAPSE = code(sourceOf('./SidebarCollapseControl.tsx'));
  // Hit box may bleed (`-ml-px`); the old `-ml-1.5` was compensating for a
  // too-deep header pad and must not come back as the alignment lever.
  assert.doesNotMatch(COLLAPSE, /-ml-1\.5/);
  assert.match(COLLAPSE, /HEADER_ICON_WRAP/);
  // Collapsed-spine peek is a flush header extension — not a padded floating bubble.
  assert.match(COLLAPSE, /gap=\{0\}/);
  assert.match(COLLAPSE, /padded=\{false\}/);
  assert.match(COLLAPSE, /border-t-0 p-0/);
  assert.doesNotMatch(COLLAPSE, /\bp-1\b/);
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

// To-ship (`/shipping/orders`) is a desk — UnshippedSidebar filter map — never
// the Labels station scanner / "Labels printed" rail. Labels · Scan-out · FBA
// keep their station bodies behind explicit mode branches.
test('OutboundSidebarPanel: To-ship desk is UnshippedSidebar, not Labels station', () => {
  const panel = code(sourceOf('../sidebar/OutboundSidebarPanel.tsx'));
  assert.match(panel, /SHIPPING_ORDERS_PATH/);
  assert.match(panel, /UnshippedSidebar/);
  assert.match(panel, /LabelsModeBody/);
  assert.match(panel, /ScanOutModeBody/);
  assert.doesNotMatch(
    panel,
    /LabelsScanBand|LabelsRecentRail/,
    'Labels station chrome must not be inlined on the outbound panel — only via LabelsModeBody on /shipping/labels',
  );
});
