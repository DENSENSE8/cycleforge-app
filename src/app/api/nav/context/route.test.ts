import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions-shared';
import { entitlementsForPlan } from '@/lib/billing/plans';
import { parityGaps } from '@/lib/nav/context/parity';
import { NavContextQuerySchema, NavContextSchema } from '@/lib/nav/context/schema';
import { SIDEBAR_PAGE_NAV, getSidebarNavPageId } from '@/lib/sidebar-navigation';
import { getNavContextForStaff, type NavContextDeps } from '@/lib/nav/context/service';
import { GET } from './route';

const ORG = '00000000-0000-0000-0000-00000000000a';
const ALL = new Set<string>(ALL_PERMISSIONS);

interface Captured {
  loads: Array<{ orgId: string; staffId: number; settingKey: string }>;
  orgs: string[];
}

function fakes(opts: { navConfig?: unknown; staffSetting?: unknown; orgSettings?: Record<string, unknown> } = {}) {
  const cap: Captured = { loads: [], orgs: [] };
  const deps: NavContextDeps = {
    loadInputs: async (orgId, staffId, settingKey) => {
      cap.loads.push({ orgId, staffId, settingKey });
      return { navConfig: opts.navConfig ?? null, staffSetting: opts.staffSetting ?? null };
    },
    loadOrg: async (orgId) => {
      cap.orgs.push(orgId);
      return { settings: opts.orgSettings ?? {}, features: entitlementsForPlan('trial').features };
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
  assert.equal(NavContextQuerySchema.safeParse({ path: '/shipping/orders?queue=pick' }).success, true);
  assert.equal(NavContextQuerySchema.safeParse({ path: '/unbox', view: 'top' }).success, true);
  for (const path of ['//evil.test/x', 'https://evil.test/', '/\\evil.test', '']) {
    assert.equal(NavContextQuerySchema.safeParse({ path }).success, false, path);
  }
  assert.equal(NavContextQuerySchema.safeParse({ path: '/unbox', view: 'peek' }).success, false);
});

test('the body is a valid NavContext, loaded for the session org, staffer and page switch', async () => {
  const { deps, cap } = fakes();
  const nav = await getNavContextForStaff(request('/shipping/orders?queue=pick'), deps);
  assert.deepEqual(NavContextSchema.parse(JSON.parse(JSON.stringify(nav))), nav);
  assert.deepEqual(cap.loads, [{ orgId: ORG, staffId: 7, settingKey: 'nav.contextual.outbound' }]);
  assert.deepEqual(cap.orgs, [ORG]);
  assert.equal(nav.rollout, 'legacy');
  assert.equal(nav.scope, 'section');
});

test('the switch: staff pick beats the org, staff inherit defers to it, bad values fall to the map', async () => {
  const key = 'nav.contextual.outbound';
  const orgContextual = { orgSettings: { [key]: 'contextual' } };
  assert.equal((await getNavContextForStaff(request('/shipping/orders'), fakes(orgContextual).deps)).rollout, 'contextual');
  assert.equal(
    (await getNavContextForStaff(request('/shipping/orders'), fakes({ ...orgContextual, staffSetting: 'legacy' }).deps)).rollout,
    'legacy',
  );
  assert.equal(
    (await getNavContextForStaff(request('/shipping/orders'), fakes({ ...orgContextual, staffSetting: 'inherit' }).deps)).rollout,
    'contextual',
  );
  assert.equal(
    (await getNavContextForStaff(request('/shipping/orders'), fakes({ orgSettings: { [key]: 'bogus' } }).deps)).rollout,
    'legacy',
  );
  // Another page's switch does not leak onto this one; Unbox keeps its own
  // contextual rollout from the page map.
  assert.equal(
    (await getNavContextForStaff(request('/unbox'), fakes({ orgSettings: { [key]: 'contextual' } }).deps)).rollout,
    'contextual',
  );
});

test('an org or staff contextual override on a page with parity gaps still resolves legacy', async (t) => {
  const gapped = SIDEBAR_PAGE_NAV.find((page) => {
    const url = new URL(page.href, 'http://t');
    return getSidebarNavPageId(url.pathname, url.searchParams) === page.id && parityGaps(page.id).length > 0;
  });
  if (!gapped) return t.skip('every page covers its PARITY rows');
  const key = `nav.contextual.${gapped.id}`;
  const byOrg = await getNavContextForStaff(request(gapped.href), fakes({ orgSettings: { [key]: 'contextual' } }).deps);
  const byStaff = await getNavContextForStaff(request(gapped.href), fakes({ staffSetting: 'contextual' }).deps);
  assert.equal(byOrg.page.id, gapped.id);
  assert.equal(byOrg.rollout, 'legacy');
  assert.equal(byStaff.rollout, 'legacy');
});

test('the org nav override stored in nav_definitions reaches the section', async () => {
  const navConfig = { entries: [{ id: 'outbound', children: [{ id: 'shipped', hidden: true }] }] };
  const nav = await getNavContextForStaff(request('/shipping/orders'), fakes({ navConfig }).deps);
  // The lane's modes (`<page>.<lane>.modes`) lead the panel; the views follow.
  const views = nav.sections.filter((section) => !section.id.endsWith('.modes'));
  const ids = views.flatMap((section) => section.items.map((item) => item.id));
  assert.deepEqual(ids, ['exceptions', 'po', 'pick', 'triage']);
});
