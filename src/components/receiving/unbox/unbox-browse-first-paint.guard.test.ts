/**
 * Unbox station-first SSR paint stand-in — MRU carton identity or empty scan copy.
 *
 * Cold `/unbox` must not paint Queue table rows / pulse bars as LCP. Desk tables
 * mount only after `?unboxdesk=1` (Back to list).
 *
 * Run: `npx tsx --test src/components/receiving/unbox/unbox-browse-first-paint.guard.test.ts`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

/**
 * Source with comments stripped.
 *
 * Every ban below is about what the file RENDERS, so it has to be asserted
 * against code only — a docblock explaining why `animate-pulse` is banned is
 * itself a match for /animate-pulse/, and the guard would fail the very comment
 * that documents it.
 */
const readCode = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('UnboxStationFirstPaint SSR stand-in (station-first)', () => {
  it('is RSC-safe (no use client) and owns unbox:primary paint surface', () => {
    const src = read('src/components/receiving/unbox/UnboxStationFirstPaint.tsx');
    assert.doesNotMatch(src, /^['"]use client['"]/m);
    assert.match(src, /data-paint-surface=["']unbox:primary["']/);
  });

  // Ruled 2026-08-12 (operator call), reversing "the MRU carton IS the stand-in":
  // painting the carton's identity + line titles before the workspace existed
  // read at the bench as a broken, half-rendered station — a lone "Return
  // carton" heading with a tracking number and nothing operable. The middle
  // must say "loading" (skeleton), never assert a carton it cannot yet work.
  it('middle stand-in is a SKELETON — never carton identity or line titles', () => {
    const src = readCode('src/components/receiving/unbox/UnboxStationFirstPaint.tsx');
    // Static bars only: a pulsing skeleton on a scan floor reads as a fault light.
    assert.doesNotMatch(src, /['"`][^'"`]*animate-pulse/);
    assert.doesNotMatch(src, /Browse lists/);
    assert.match(src, /data-testid=["']unbox-station-first-paint["']/);
    assert.match(src, /SKELETON_LINE_ROWS/);
    // It must not be able to render carton data at all — no data props.
    assert.doesNotMatch(
      src,
      /\bmru\b/,
      'skeleton must not take carton data — that is the half-rendered component',
    );
    assert.doesNotMatch(src, /catalog_product_title|tracking_number|zoho_purchaseorder/);
  });

  it('shell covers only the middle and hands off via onPrimaryPainted', () => {
    const shell = readCode('src/components/receiving/unbox/UnboxBrowseShell.tsx');
    assert.match(shell, /['"]use client['"]/);
    assert.match(shell, /opacity-0/);
    assert.match(shell, /onPrimaryPainted/);
    assert.match(shell, /UnboxStationFirstPaint/);
    // The rail must never be behind the middle's skeleton gate.
    assert.doesNotMatch(shell, /firstPaintMru|firstPaintLines/);
  });

  it('page mounts the shell ONCE — seed lives in the root layout, no sr-only duplicate', () => {
    const page = readCode('src/app/unbox/page.tsx');
    assert.match(page, /UnboxBrowseShell/);
    // The rail is a sibling of the page (ResponsiveLayout → ContextPanelLayout),
    // so a page-level HydrationBoundary can never reach it. Seed + dehydrate
    // sit above the shell (`maybeSeedUnboxShell` in the root layout).
    assert.doesNotMatch(page, /seedUnboxStation|seedUnboxQueue|HydrationBoundary/);
    assert.doesNotMatch(
      page,
      /sr-only/,
      'the stand-in is server-rendered by the shell — a second copy is dead weight',
    );

    const layout = readCode('src/app/layout.tsx');
    assert.match(layout, /maybeSeedUnboxShell/);
    assert.match(layout, /ShellQuerySeed/);

    const shellSeed = read('src/lib/queries/unbox-shell-seed.server.ts');
    assert.match(shellSeed, /seedUnboxStation/);
  });

  it('the app shell is NOT client-gated — SSR content must reach the HTML', () => {
    const layout = readCode('src/components/layout/ResponsiveLayout.tsx');
    // The blank gate returned <div aria-hidden/> for every mobile-allowed path
    // until `mounted` flipped, which blanked the entire SSR tree on /unbox.
    assert.doesNotMatch(
      layout,
      /!mounted\s*&&\s*!onMobileRoute\s*&&\s*isMobileAllowedPath/,
      'pre-hydration blank gate is what cost every station its server paint',
    );
    // Branch on the ROUTE, never on viewport width.
    assert.doesNotMatch(
      layout,
      /if\s*\(\s*!isMobile\s*&&\s*!onMobileRoute\s*\)/,
      'mobile is /m/* routing, not a width flip — the flip forces the blank gate back',
    );
  });

  it('the rail seed is pre-limited — never the unrestricted 50-row list', () => {
    const seed = read('src/lib/queries/unbox-spine-seed.server.ts');
    assert.match(seed, /rankUnboxMruReceivingIds/);
    assert.match(seed, /receiving_id_in/);
    // Rank + hydrate must run before/around the carton fetch in parallel.
    assert.match(seed, /Promise\.all\(/);
  });

  it('stand-in stays through restore — only empty bench or mounted carton releases LCP', () => {
    const lineWs = read('src/components/receiving/unbox/UnboxLineWorkspace.tsx');
    const cartonWs = read('src/components/receiving/workspace/ReceivingLineWorkspace.tsx');
    assert.match(lineWs, /!desk && !showOverlay && !showRestoreSkeleton/);
    assert.doesNotMatch(
      lineWs,
      /showOverlay \|\| showRestoreSkeleton/,
      'must not release stand-in onto restore skeleton / pulse bars',
    );
    assert.match(cartonWs, /onPrimaryPainted/);
    assert.match(cartonWs, /useUnboxPrimaryPaintOptional/);
  });

  it('UnboxLineWorkspace lazy-loads desk UnboxWorkspaceView — never static on station path', () => {
    const src = read('src/components/receiving/unbox/UnboxLineWorkspace.tsx');
    assert.doesNotMatch(
      src,
      /import\s*\{[^}]*UnboxWorkspaceView[^}]*\}\s*from/,
      'desk sheet must be dynamic, not a static import on the station path',
    );
    assert.match(
      src,
      /import\(\s*['"]@\/components\/receiving\/unbox\/UnboxWorkspaceView['"]\s*\)/,
    );
    assert.match(src, /isUnboxDesk/);
    assert.match(src, /UnboxStationEmptyShell/);
  });

  it('UnboxWorkspaceView statically imports ReceivingLinesTable (desk sheet — no dynamic flash)', () => {
    const view = read('src/components/receiving/unbox/UnboxWorkspaceView.tsx');
    assert.match(
      view,
      /import ReceivingLinesTable from ['"]@\/components\/station\/ReceivingLinesTable['"]/,
    );
    assert.doesNotMatch(
      view,
      /dynamic\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]@\/components\/station\/ReceivingLinesTable['"]/,
    );
  });

  it('UnboxWorkbenchSkeleton is flush — no soft-radius chip classes', () => {
    const src = read('src/components/receiving/unbox/UnboxWorkbenchSkeleton.tsx');
    assert.doesNotMatch(src, /rounded-lg/);
    assert.doesNotMatch(src, /rounded-full/);
    assert.doesNotMatch(src, /shadow-sm/);
    assert.match(src, /cornerClass\(['"]flush['"]\)/);
  });

  it('empty station shell has no Browse lists CTA — desk is Back to list only', () => {
    const empty = read('src/components/receiving/unbox/UnboxStationEmptyShell.tsx');
    assert.doesNotMatch(empty, /Browse lists/);
    assert.doesNotMatch(empty, /applyUnboxDeskParam/);
    assert.match(empty, /receiving-focus-scan/);
  });

  it('MRU auto-open shares the Unboxed rail query key (staff-aware)', () => {
    const pane = read('src/components/receiving/useReceivingWorkspacePane.ts');
    assert.match(pane, /wantMruAutoOpen/);
    assert.match(pane, /unboxRailQueryKey/);
    assert.match(pane, /parseStaffParam/);
    assert.match(pane, /RECEIVING_RAIL_FEEDS\.unboxRecent/);
    assert.match(pane, /rows\?\.\[0\]/);
  });
});
