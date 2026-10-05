import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions-shared';
import { parityGaps } from '@/lib/nav/context/parity';
import { NavContextQuerySchema, NavContextSchema } from '@/lib/nav/context/schema';
import { SIDEBAR_PAGE_NAV, getSidebarNavPageId } from '@/lib/sidebar-navigation';
import { getNavContextForStaff, type NavContextDeps } from '@/lib/nav/context/service';
import { GET } from './route';

const ORG = '00000000-0000-0000-0000-00000000000a';
const ALL = new Set<string>(ALL_PERMISSIONS);

interface Captured {
  loads: Array<{ orgId: string }>;
}

function fakes(opts: { navConfig?: unknown } = {}) {
  const cap: Captured = { loads: [] };
  const deps: NavContextDeps = {
    loadInputs: async (orgId) => {
      cap.loads.push({ orgId });
      return { navConfig: opts.navConfig ?? null };
    },
  };
  return { deps, cap };
}

const request = (path: string) => ({ path, orgId: ORG, staffId: 7, permissions: ALL });

test('GET refuses a caller with no session', async () => {
  const res = await GET(new NextRequest('http://localhost:3050/api/nav/context?path=/unbox'), {
    params: Promise.resolve({}),
  });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'UNAUTHENTICATED' });
});

test('the query takes an in-app path only', () => {
  assert.equal(NavContextQuerySchema.safeParse({ path: '/shipping/orders?stage=picked' }).success, true);
  assert.equal(NavContextQuerySchema.safeParse({ path: '/unbox', view: 'top' }).success, true);
  for (const path of ['//evil.test/x', 'https://evil.test/', '/\\evil.test', '']) {
    assert.equal(NavContextQuerySchema.safeParse({ path }).success, false, path);
  }
  assert.equal(NavContextQuerySchema.safeParse({ path: '/unbox', view: 'peek' }).success, false);
});

test('the body is a valid NavContext, loaded for the session org', async () => {
  const { deps, cap } = fakes();
  const nav = await getNavContextForStaff(request('/shipping/orders?stage=picked'), deps);
  assert.deepEqual(NavContextSchema.parse(JSON.parse(JSON.stringify(nav))), nav);
  assert.deepEqual(cap.loads, [{ orgId: ORG }]);
  assert.equal(nav.rollout, 'contextual');
  assert.equal(nav.scope, 'section');
});

test('Warehouse Stock has one runtime sidebar rollout', async () => {
  const nav = await getNavContextForStaff(request('/inventory/stock'), fakes().deps);
  assert.equal(nav.page.id, 'stock');
  assert.equal(nav.rollout, 'contextual');
  assert.equal(nav.scope, 'section');
});

test('a page with parity gaps remains legacy', async (t) => {
  const gapped = SIDEBAR_PAGE_NAV.find((page) => {
    const url = new URL(page.href, 'http://t');
    return getSidebarNavPageId(url.pathname, url.searchParams) === page.id && parityGaps(page.id).length > 0;
  });
  if (!gapped) return t.skip('every page covers its PARITY rows');
  const nav = await getNavContextForStaff(request(gapped.href), fakes().deps);
  assert.equal(nav.page.id, gapped.id);
  assert.equal(nav.rollout, 'legacy');
});

test('the org nav override stored in nav_definitions reaches the section', async () => {
  const navConfig = { entries: [{ id: 'outbound', children: [{ id: 'shipped', hidden: true }] }] };
  const nav = await getNavContextForStaff(request('/shipping/orders'), fakes({ navConfig }).deps);
  // The lane's modes (`<page>.<lane>.modes`) lead the panel; the views follow.
  const views = nav.sections.filter((section) => !section.id.endsWith('.modes'));
  const ids = views.flatMap((section) => section.items.map((item) => item.id));
  assert.deepEqual(ids, ['triage', 'exceptions']);
});
