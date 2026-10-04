/**
 * Contracts — the operator's rules as executable law. The single place the loop learns a rule.
 *
 * First principles (read before adding one):
 *  1. A rule is not real until a probe can FAIL on it. Every contract has a deterministic probe:
 *     `static` (reads the judged checkout's own registries/source — runs in a sandbox copy) and/or
 *     `live` (Playwright at the dev origin :3050 — runs only against the served tree).
 *     Prefer a static twin: the fix loop can only verify what it can run in its sandbox.
 *  2. The operator's words are kept verbatim (`ruling.words`) next to the loop's reading of them
 *     (`interpretation`). When the reading is wrong, fix the interpretation and the probe — never
 *     the words.
 *  3. `fix` says who may change the code: `worker` (an omp worker in the sandbox, inside `lease`)
 *     or `ruling` (needs an operator decision first — the loop opens a gap, never guesses).
 *  4. `lease` is the only set of files a worker may touch for this contract. A diff outside it is
 *     reverted. Leases make fixes reviewable and stop "fix one thing, move three".
 *  5. Contracts with `enforcedBy` carry law another anchor already checks (critique, routes); they
 *     exist so the worker and the verifier read the same sentence the operator said.
 *
 * Adding a rule: append an entry, run `node scripts/spec-sweep.mjs --only contracts`, and confirm
 * the probe fails on today's tree (or plant a mutant that makes it fail). Then
 * `node scripts/spec-loop.mjs --debt contract:<id>` hands it to the loop.
 *
 * Probe API — static: async ({ repo, load }) => Violation[]   (load(rel) imports a module of the judged checkout)
 *             live:   { viewport: 'desktop' | 'mobile', run: async ({ page }) => Violation[] }
 *             Violation = { message: string, file?: string }
 */

const DESKTOP = 'desktop';
const OPERATOR = { by: 'owner', at: '2026-10-03' };

/** Every URL the desktop page registry can open: each page's href plus each view's `to()`. */
async function registeredDeskUrls(load) {
  const nav = await load('src/lib/sidebar-navigation.ts');
  const urls = [];
  for (const page of nav.SIDEBAR_PAGE_NAV) {
    const u = new URL(page.href, 'http://nav.local');
    urls.push({ page: page.id, view: null, pathname: u.pathname, params: u.searchParams });
    for (const child of page.children ?? []) {
      if (!child.to) continue;
      const target = child.to();
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(target.params ?? {})) if (v != null) params.set(k, String(v));
      urls.push({ page: page.id, view: child.id, pathname: target.pathname, params });
    }
  }
  return urls;
}

/** A permission set that grants everything: contracts judge structure, not one staff's role. */
const ALL_PERMISSIONS = new Proxy(new Set(), { get: (t, k) => (k === 'has' ? () => true : Reflect.get(t, k)) });

/** @type {Contract[]} */
export const CONTRACTS = [
  {
    id: 'nav.live-feed-under-operations',
    statement: 'Live feed is listed under Operations in the desktop sidebar: in the Operations band of the top map, and as a row of the Operations section’s own sidebar.',
    ruling: { ...OPERATOR, words: 'the live feed is not displaying under the operation sidebar' },
    interpretation:
      'Two places: (a) the top map’s "Operations" band lists Live feed; (b) on /operations the view switcher of the Operations panel offers Live feed (opening /operations/live-feed). On 2026-10-03 (a) already held and (b) did not.',
    surface: DESKTOP,
    fix: 'worker',
    lease: ['src/lib/sidebar-navigation.ts', 'src/lib/nav/context/pages.ts', 'src/components/sidebar/contextual/nav-view-icons.ts'],
    static: async ({ load }) => {
      const nav = await load('src/lib/sidebar-navigation.ts');
      const { LIVE_FEED_PATH } = await load('src/lib/live-feed/route.ts');
      const ops = nav.SIDEBAR_PAGE_NAV.find((p) => p.id === 'operations');
      if (!ops) return [{ message: 'SIDEBAR_PAGE_NAV has no `operations` page', file: 'src/lib/sidebar-navigation.ts' }];
      const row = (ops.children ?? []).find((c) => c.to && c.to().pathname === LIVE_FEED_PATH);
      return row ? [] : [{ message: `the Operations section has no row opening ${LIVE_FEED_PATH} (rows: ${(ops.children ?? []).map((c) => c.label).join(', ')})`, file: 'src/lib/sidebar-navigation.ts' }];
    },
    live: {
      viewport: DESKTOP,
      run: async ({ page }) => {
        const out = [];
        await page.goto('/operations', { waitUntil: 'domcontentloaded' });
        await page.locator('[data-nav-back="true"]').first().click({ timeout: 20_000 });
        const band = page.locator('aside [data-sidebar="group"][aria-label="Operations"]');
        await band.first().waitFor({ timeout: 20_000 }).catch(() => {});
        if (!(await band.filter({ hasText: 'Live feed' }).count())) out.push({ message: 'top map: the Operations band does not list Live feed' });
        await page.goto('/operations', { waitUntil: 'domcontentloaded' });
        await page.locator('[data-nav-switcher="view"]').first().click({ timeout: 20_000 });
        const option = page.getByRole('menuitem', { name: /Live feed/ }).or(page.getByRole('option', { name: /Live feed/ })).or(page.locator('[role=menu], [role=listbox], [data-nav-switcher-host]').getByText('Live feed'));
        if (!(await option.count())) out.push({ message: '/operations: the Operations view switcher does not offer Live feed' });
        return out;
      },
    },
  },
  {
    id: 'nav.every-page-contextual-sidebar',
    statement: 'Every desktop page opens with its own left contextual sidebar — a section panel with a back chevron and the page’s views — never the bare top map.',
    ruling: { ...OPERATOR, words: 'all of the pages must have a left contextual sidebar for them, for example sales does not' },
    interpretation:
      'For every URL the page registry can open (each SIDEBAR_PAGE_NAV href and each view’s target), resolveNavContext answers scope "section" with rollout "contextual" — the same answer the shell paints. Live: the sidebar shows [data-nav-back]. On 2026-10-03 /pickup (Sales › Local Pickup) fell back to the top map.',
    surface: DESKTOP,
    fix: 'worker',
    lease: ['src/lib/nav/context/pages.ts', 'src/lib/nav/context/parity.ts', 'src/lib/nav/context/rollout.ts', 'src/lib/sidebar-navigation.ts', 'src/components/sidebar/contextual/nav-view-icons.ts'],
    static: async ({ load }) => {
      const { resolveNavContext } = await load('src/lib/nav/context/resolve.ts');
      const out = [];
      for (const u of await registeredDeskUrls(load)) {
        const ctx = resolveNavContext({ pathname: u.pathname, params: u.params, permissions: ALL_PERMISSIONS, orgNav: null });
        if (ctx.scope !== 'section' || ctx.rollout !== 'contextual') {
          const q = u.params.toString();
          out.push({ message: `${u.pathname}${q ? `?${q}` : ''} (${u.page}${u.view ? ` › ${u.view}` : ''}) resolves scope=${ctx.scope} rollout=${ctx.rollout}`, file: 'src/lib/nav/context/pages.ts' });
        }
      }
      return out;
    },
    live: {
      viewport: DESKTOP,
      // Not a crawl: a dev server compiles every route it is sent to, and a 145-URL walk OOM-killed
      // the lane on 2026-10-03. The static twin covers every registered URL; live confirms the
      // operator's example (Sales) plus whatever the static twin flags.
      run: async ({ page, load }) => {
        const out = [];
        const sample = new Set(['/counter', '/customers', '/pickup', '/dashboard?mode=repairs']);
        const { resolveNavContext } = await load('src/lib/nav/context/resolve.ts');
        for (const u of await registeredDeskUrls(load)) {
          const ctx = resolveNavContext({ pathname: u.pathname, params: u.params, permissions: ALL_PERMISSIONS, orgNav: null });
          const q = u.params.toString();
          if (ctx.scope !== 'section' || ctx.rollout !== 'contextual') sample.add(`${u.pathname}${q ? `?${q}` : ''}`);
        }
        for (const url of sample) {
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          const back = await page.locator('aside [data-nav-back="true"]').first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
          if (!back) out.push({ message: `${url}: no contextual sidebar (the top map is showing)` });
        }
        return out;
      },
    },
  },
  {
    id: 'livefeed.distinct-tones',
    statement: 'On the Live feed page every direction tab wears its own colour — in the sidebar view switcher and in the "G then" key pills of the desk header — and selection controls never reuse the page’s orange: not everything the same orange.',
    ruling: { ...OPERATOR, words: 'the live feed page must have different colors for its tab switching, g then selection type, not all the same orange color' },
    interpretation:
      'Static: the live-feed view tones in nav-view-icons are pairwise distinct. Live: (a) the sidebar direction switcher’s options and (b) the header key pills shown after pressing G ("G then O Outbound · I Inbound") paint pairwise-distinct icon colours; (c) no checked selection control in the sidebar paints the page orange. On 2026-10-03 all three held (Outbound orange, Inbound blue, selections ink) — the contract guards it; correct the interpretation if the operator meant another surface.',
    surface: DESKTOP,
    fix: 'worker',
    lease: ['src/components/sidebar/contextual/nav-view-icons.ts', 'src/components/sidebar/contextual/NavViewSwitcher.tsx', 'src/components/sidebar/contextual/NavKeyStrip.tsx', 'src/lib/sidebar-navigation.ts'],
    static: async ({ load }) => {
      const icons = await load('src/components/sidebar/contextual/nav-view-icons.ts');
      const table = Object.values(icons).find((v) => v && typeof v === 'object' && 'live-feed.outbound' in v);
      if (!table) return [{ message: 'nav-view-icons exports no table with live-feed.* views', file: 'src/components/sidebar/contextual/nav-view-icons.ts' }];
      const views = Object.entries(table).filter(([k]) => k.startsWith('live-feed.'));
      const tones = views.map(([, v]) => v.tone);
      return new Set(tones).size === tones.length ? [] : [{ message: `live-feed views share a tone: ${views.map(([k, v]) => `${k}=${v.tone}`).join(', ')}`, file: 'src/components/sidebar/contextual/nav-view-icons.ts' }];
    },
    live: {
      viewport: DESKTOP,
      run: async ({ page }) => {
        const out = [];
        await page.goto('/operations/live-feed', { waitUntil: 'domcontentloaded' });
        await page.locator('[data-nav-switcher="view"]').first().click({ timeout: 20_000 });
        const colours = await page
          .locator('[data-nav-switcher-host] svg, [role=menu] svg')
          .evaluateAll((svgs) => svgs.map((s) => getComputedStyle(s).color));
        if (colours.length >= 2 && new Set(colours).size < colours.length) out.push({ message: `direction tabs share an icon colour: ${colours.join(', ')}` });
        await page.keyboard.press('Escape');
        // (b) The "G then" key pills: press G over the desk, read the header pills' icon colours.
        await page.locator('main').first().click({ position: { x: 900, y: 600 } }).catch(() => {});
        await page.keyboard.press('g');
        const pills = page.locator('main button, main a').filter({ hasText: /^\s*\S\s*(Outbound|Inbound)\s*$/ });
        await pills.first().waitFor({ timeout: 5_000 }).catch(() => {});
        const pillColours = await pills.locator('svg').evaluateAll((svgs) => svgs.map((s) => getComputedStyle(s).color));
        if (pillColours.length >= 2 && new Set(pillColours).size < pillColours.length) out.push({ message: `"G then" key pills share an icon colour: ${pillColours.join(', ')}` });
        await page.keyboard.press('Escape');
        const orange = await page
          .locator('aside [aria-checked="true"], aside [data-state="checked"], aside [aria-pressed="true"]')
          .evaluateAll((els) => els.filter((e) => /rgb\(234, 88, 12\)|rgb\(249, 115, 22\)/.test(getComputedStyle(e).color + getComputedStyle(e).backgroundColor)).length);
        if (orange) out.push({ message: `${orange} selected control(s) paint the page orange` });
        return out;
      },
    },
  },
  {
    id: 'nav.warehouse-lane',
    statement: 'The Inventory lane is named Warehouse and wears the Warehouse icon on every surface; no nav row is labelled Inventory — the desktop row becomes Locations (nav-name law: a parent and a child never share a name).',
    ruling: { ...OPERATOR, words: 'the inventory must be renamed to warehouse with a warehouse icon' },
    interpretation:
      'DOMAIN_GROUPS `inventory` = label Warehouse + icon Warehouse (held on 2026-10-03). No APP_SIDEBAR_NAV or SIDEBAR_PAGE_NAV entry is labelled "Inventory"; the desktop row that was "Inventory" is "Locations" (route-tree note on lane `warehouse`). nav-name-guard stays green.',
    surface: 'both',
    fix: 'worker',
    lease: ['src/lib/sidebar-navigation.ts', 'src/lib/nav/lanes.ts', 'src/lib/nav/context/pages.ts', 'src/components/mobile/v2/mobile-v2-destinations.tsx'],
    static: async ({ load }) => {
      const out = [];
      const [{ DOMAIN_GROUPS }, nav, icons] = await Promise.all([load('src/lib/nav/lanes.ts'), load('src/lib/sidebar-navigation.ts'), load('src/components/Icons.tsx')]);
      const lane = DOMAIN_GROUPS.find((g) => g.id === 'inventory');
      if (lane?.label !== 'Warehouse') out.push({ message: `lane inventory is labelled "${lane?.label}"`, file: 'src/lib/nav/lanes.ts' });
      if (lane && lane.icon !== icons.Warehouse) out.push({ message: 'lane inventory does not wear the Warehouse icon', file: 'src/lib/nav/lanes.ts' });
      for (const [name, list] of [['APP_SIDEBAR_NAV', nav.APP_SIDEBAR_NAV], ['SIDEBAR_PAGE_NAV', nav.SIDEBAR_PAGE_NAV]]) {
        for (const item of list) if (/^inventory$/i.test(item.label)) out.push({ message: `${name} row "${item.id}" is labelled "${item.label}" (must be Locations)`, file: 'src/lib/sidebar-navigation.ts' });
      }
      return out;
    },
    live: {
      viewport: DESKTOP,
      run: async ({ page }) => {
        const out = [];
        await page.goto('/operations', { waitUntil: 'domcontentloaded' });
        await page.locator('[data-nav-back="true"]').first().click({ timeout: 20_000 });
        const aside = page.locator('aside').first();
        await aside.getByText('Warehouse', { exact: true }).first().waitFor({ timeout: 20_000 }).catch(() => out.push({ message: 'top map: no Warehouse lane' }));
        const text = await aside.innerText();
        if (/\bInventory\b/.test(text)) out.push({ message: 'top map paints "Inventory"' });
        return out;
      },
    },
  },
  {
    id: 'stock.no-foreign-doors',
    statement: 'The Stock list shows records only: no doors to Labels, Racks or Manage — those live in the menu, under their own parent.',
    ruling: { ...OPERATOR, words: 'labels "Racks" and "Manage" should not even be displayed within the stock page, they should be displayed within other parents' },
    interpretation:
      'Static twin of the live smoke’s foreign-door check, so the sandboxed fix loop can see it: no file the Stock page renders (its page plus the mobile components it imports, three levels deep) references a route-tree node of Location labels, Rack labels, Racks, New rack or Manage locations — by WAREHOUSE_PATHS key, builder, or literal path. Added 2026-10-04 after a worker kept Labels/Racks verbs on the stock list and only the live smoke (which does not run in the sandbox) would have caught it.',
    surface: 'mobile',
    fix: 'worker',
    static: async ({ repo, load }) => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const tree = await load('src/lib/nav/route-tree.ts');
      const FOREIGN = ['location-labels', 'rack-labels', 'racks', 'rack-new', 'location-cleanup'];
      const KEY_NODE = { stock: 'stock', stockDetail: 'stock-detail', locationCleanup: 'location-cleanup', locationLabels: 'location-labels', rackLabels: 'rack-labels', racks: 'racks', newRack: 'rack-new' };
      const BUILDER_NODE = { locationLabelsHref: 'location-labels', rackLabelsHref: 'rack-labels' };
      const literals = FOREIGN.map((id) => tree.routeNode(id)?.path).filter(Boolean);
      const stock = tree.routeNode('stock');
      if (!stock?.page) return [{ message: 'route tree has no live Stock page', file: 'src/lib/nav/route-tree.ts' }];
      const resolve = (from, spec) => {
        const base = spec.startsWith('@/') ? path.join(repo, 'src', spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(path.join(repo, from)), spec) : null;
        if (!base) return null;
        for (const cand of [base, `${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
          if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return path.relative(repo, cand);
        }
        return null;
      };
      const seen = new Set();
      let frontier = [stock.page];
      for (let depth = 0; depth <= 3 && frontier.length; depth++) {
        const next = [];
        for (const file of frontier) {
          if (seen.has(file)) continue;
          seen.add(file);
          const src = fs.readFileSync(path.join(repo, file), 'utf8');
          for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
            const dep = resolve(file, m[1]);
            if (dep && /^src\/(components\/mobile|app\/m)\//.test(dep)) next.push(dep);
          }
        }
        frontier = next;
      }
      const out = [];
      for (const file of seen) {
        const src = fs.readFileSync(path.join(repo, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
        const hits = [
          ...Object.entries(KEY_NODE).filter(([k, id]) => FOREIGN.includes(id) && new RegExp(`WAREHOUSE_PATHS\\.${k}\\b`).test(src)).map(([k]) => `WAREHOUSE_PATHS.${k}`),
          ...Object.keys(BUILDER_NODE).filter((b) => new RegExp(`\\b${b}\\s*\\(`).test(src)).map((b) => `${b}()`),
          ...literals.filter((p) => new RegExp(`['"\`]${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=['"\`?/])`).test(src)),
        ];
        if (hits.length) out.push({ message: `the Stock list renders a door to another parent: ${hits.join(', ')}`, file });
      }
      return out;
    },
  },
  // ── Law enforced by other anchors (read by workers and the verifier) ─────────────────────────
  {
    id: 'ds.port',
    statement: 'A hand-rolled control is ported onto the existing design-system primitive for its surface (mobile: DetailDock / MobileV2ActionSheet / Button; desktop: Button / StickyActionBar / DeskActionSlot), and the replacement renders the same verb. Never restyled in place, never deleted, never moved into a primitive folder.',
    ruling: { by: 'owner', at: '2026-10-03', words: 'fix the hand-rolled components and correctly port them onto the already existing design system primitives' },
    surface: 'both',
    enforcedBy: 'critique + port contract (scripts/spec-loop.mjs)',
  },
  {
    id: 'ds.surface-split',
    statement: 'Mobile and desktop never share rendered components: mobile code lives in src/components/mobile/** or src/app/m/**, desktop code elsewhere, and only primitives / logic cross (ARCHITECTURE.md Component split).',
    ruling: { by: 'owner', at: '2026-09-14', words: 'Component split (binding)' },
    surface: 'both',
    enforcedBy: 'gate:Boundary',
  },
  {
    id: 'routes.from-tree',
    statement: 'Every Warehouse URL — a path the route tree owns (/m/stock…, /m/loc/…, /m/labels, /m/racks…, /m/h/…) — is written with WAREHOUSE_PATHS or a builder from src/lib/nav/route-tree.ts, never a literal; URLs of other lanes (e.g. /m/scan) are out of scope. A page the tree does not own is removed, not registered (registering is an operator ruling).',
    ruling: { by: 'owner', at: '2026-10-03', words: 'one source of truth for routing and vocabulary' },
    surface: 'both',
    enforcedBy: 'routes',
  },
];

/** Contracts with a probe (the rest are law text for workers and the verifier). */
export const PROBED = CONTRACTS.filter((c) => c.static || c.live);

/** The law lines that apply to a set of findings: contract ids, plus the enforcing law for anchors. */
export function lawFor(findings) {
  const ids = new Set();
  for (const f of findings) {
    if (f.anchor === 'contracts') ids.add(f.rule);
    if (f.anchor === 'critique' || f.anchor === 'port') ids.add('ds.port').add('ds.surface-split');
    if (f.anchor === 'routes' || f.anchor === 'gate:Routes') ids.add('routes.from-tree');
    if (f.anchor === 'gate:Boundary') ids.add('ds.surface-split');
  }
  return CONTRACTS.filter((c) => ids.has(c.id));
}

/**
 * @typedef {{ message: string, file?: string }} Violation
 * @typedef {{ id: string, statement: string, ruling: { by: string, at: string, words: string }, interpretation?: string,
 *   surface: 'desktop' | 'mobile' | 'both', fix?: 'worker' | 'ruling', lease?: string[], enforcedBy?: string,
 *   static?: (ctx: { repo: string, load: (rel: string) => Promise<any> }) => Promise<Violation[]>,
 *   live?: { viewport: 'desktop' | 'mobile', run: (ctx: { page: any, load: (rel: string) => Promise<any> }) => Promise<Violation[]> } }} Contract
 */
