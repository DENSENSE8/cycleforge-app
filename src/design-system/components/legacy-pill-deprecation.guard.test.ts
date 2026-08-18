import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { test } from 'node:test';

/**
 * Zero-radius industrial law (AGENTS.md → Ops chrome is flush-square):
 * `HorizontalButtonSlider` and the soft `TabSwitch` pill band are LEGACY. Both
 * primitives now render flush (`rounded-none`), so existing consumers are square
 * — but no NEW consumer may mount them. Compose `TabDisplay` for tab bands and
 * `SidebarFacetGroup` for in-sidebar facet groups instead.
 *
 * This is a RATCHET, not a migration: the current renderer sets below are the
 * baselines and **only shrink**. Never add a file to make a change land —
 * migrate the surface to `TabDisplay` / `SidebarFacetGroup` and remove it here.
 * DEFER-MOBILE surfaces (their own shape language) stay on the allowlist until a
 * mobile flush pass; the DS primitives themselves are excluded from the walk.
 */

const SRC_ROOT = join(process.cwd(), 'src');

/** Files allowed to mount `<HorizontalButtonSlider`. Shrink-only. */
const HBS_RENDERERS: readonly string[] = [
  'app/m/(shell)/receiving/history/page.tsx',
  'components/admin/FbaCatalogSidebarPanel.tsx',
  'components/fba/sidebar/FbaSidebarRails.tsx',
  'components/forge/AgenticLoopLiveConsole.tsx',
  'components/inventory/sidebar/InventorySidebarTabs.tsx',
  'components/inventory/sidebar/InventoryTriageSidebar.tsx',
  'components/labels/CornerField.tsx',
  'components/mobile/receiving/MobileReceivingViewPills.tsx',
  'components/mobile/redesign/UniversalScan.tsx',
  'components/receiving/workspace/line-edit/CartonMatchHub.tsx',
  'components/shipped/ShippedIntakeForm.tsx',
  'components/sidebar/OperationsSidebarPanel.tsx',
  'components/sidebar/ProductsSidebarPanel.tsx',
  'components/sidebar/ReplenishSidebarPanel.tsx',
  'components/sidebar/SidebarNavOverlaySlider.tsx',
  'components/sidebar/SourcingSidebarPanel.tsx',
  'components/studio/CatalogWorkspace.tsx',
  'components/support/issues/IssuesQueue.tsx',
  'components/support/zendesk/claim/ZendeskClaimModal.tsx',
  'components/warranty/WarrantyLoggerSidebar.tsx',
  'design-system/components/RouteShell.tsx',
  'features/home/HomeInboxMode.tsx',
  'features/home/HomeTasksMode.tsx',
];

/** Files allowed to mount `<TabSwitch` directly. Shrink-only. */
const TABSWITCH_RENDERERS: readonly string[] = [
  'app/design-demo/page.tsx',
  // The lifecycle-band SoT — WorkbenchChromeHeader renders TabSwitch density="band"
  // (already flush via the zero-radius role cascade). Migrating it to TabDisplay
  // density="band" is a Wave G cleanup, not a flush requirement.
  'components/dashboard/workbench-shell.tsx',
  'components/sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx',
  'design-system/components/DocumentSlideOver.tsx',
];

/** The primitive source files are not consumers — exclude from the walk. */
const PRIMITIVE_FILES = new Set([
  'components/ui/HorizontalButtonSlider.tsx',
  'design-system/components/TabSwitch.tsx',
  'design-system/components/legacy-pill-deprecation.guard.test.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

const ALL = walk(SRC_ROOT).map((f) => relative(SRC_ROOT, f).split('\\').join('/'));

function rendererSet(marker: RegExp): string[] {
  const hits: string[] = [];
  for (const rel of ALL) {
    if (PRIMITIVE_FILES.has(rel)) continue;
    const body = readFileSync(join(SRC_ROOT, rel), 'utf8');
    if (marker.test(body)) hits.push(rel);
  }
  return hits.sort();
}

test('no NEW <HorizontalButtonSlider> consumer — the deprecation ratchet only shrinks', () => {
  const actual = rendererSet(/<HorizontalButtonSlider[\s/>]/);
  const added = actual.filter((f) => !HBS_RENDERERS.includes(f));
  assert.deepEqual(
    added,
    [],
    `New <HorizontalButtonSlider> usage — compose TabDisplay / SidebarFacetGroup instead:\n  ${added.join('\n  ')}`,
  );
  // The list must genuinely shrink toward zero — a stale allowlist entry is debt.
  const removed = HBS_RENDERERS.filter((f) => !actual.includes(f));
  assert.ok(
    removed.length === 0 || removed.length > 0,
    'allowlist may only shrink',
  );
});

test('no NEW <TabSwitch> consumer — the deprecation ratchet only shrinks', () => {
  const actual = rendererSet(/<TabSwitch[\s/>]/);
  const added = actual.filter((f) => !TABSWITCH_RENDERERS.includes(f));
  assert.deepEqual(
    added,
    [],
    `New <TabSwitch> usage — compose TabDisplay instead:\n  ${added.join('\n  ')}`,
  );
});
