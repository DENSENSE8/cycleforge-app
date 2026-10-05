/**
 * Contracts — the operator's rules as executable law (SpecRuleV1, Garisek-OS
 * src/lib/loops/spec/types.ts). The single place the loop learns a rule; the CycleForge spec pack
 * (tools/spec-loop/pack.mjs) hands this list to the spec kernel as its `rules`.
 *
 * First principles (read before adding one):
 *  1. A rule is not real until a probe can FAIL on it. Every contract has a deterministic probe:
 *     `static` (reads the judged checkout's own registries/source — runs in a sandbox copy) and/or
 *     `live` (Playwright at the dev origin :3050 — runs only against the served tree).
 *     Prefer a static twin: the fix loop can only verify what it can run in its sandbox.
 *     An active rule with a probe lists the `mutants` (tools/spec-loop/mutants.mjs) that prove it fires.
 *  2. The operator's words are kept verbatim (`ruling.words`) next to the loop's reading of them
 *     (`interpretation`). When the reading is wrong, fix the interpretation and the probe — never
 *     the words.
 *  3. `fix` is the ordered ladder of who may change the code: `revert` (undo the change that broke
 *     it), `autofix`, `worker` (a model worker in the sandbox, inside `lease`) or `ruling` (needs an
 *     operator decision first — the loop opens a gap, never guesses).
 *  4. `lease` is the only set of files a worker may touch for this contract. A diff outside it is
 *     reverted. Leases make fixes reviewable and stop "fix one thing, move three".
 *  5. Contracts with `enforcedBy` carry law another anchor already checks (comma list of anchor /
 *     unit-check ids); they exist so the worker and the verifier read the same sentence the operator said.
 *  6. A violation whose message carries volatile text (lists, colours, labels) sets `fingerprint`,
 *     so the finding keeps one identity while the text changes.
 *
 * Adding a rule: append an entry, plant a mutant that makes its probe fail, run
 * `pnpm spec:sweep --only contracts`, then `pnpm spec:loop --debt contract:<id>` hands it to the loop.
 *
 * Probe API — static: async ({ repo, load }) => Violation[]   (load(rel) imports a module of the judged checkout)
 *             live:   { viewport: 'desktop' | 'mobile', run: async ({ page, origin, load }) => Violation[] }
 *             Violation = { message: string, file?: string, fingerprint?: string, debt?: true }
 *             (`debt`: a hit a shrink-only baseline already holds — reported as advisory `<id>:debt`, never a fail)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ACCEPTED } from './accepted.mjs';

const PACK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The parser pi enforces `.omp/rules` with (Garisek kernel): one reading of a rule's frontmatter for omp, pi and these probes. */
const { parseGuardRule } = await import(
  pathToFileURL(path.join(process.env.GARISEK_OS_ROOT || path.join(os.homedir(), 'Projects/Garisek-OS'), 'scripts/spec-kernel/harness/pi-guards.ts')).href
);

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

// ── Interrupt-rule twins: an omp rule's own signatures, run over the whole tree ─────────────────
const SIDEBAR_RULE = '.omp/rules/sidebar-owns-table-controls.md';
const LAST8_RULE = '.omp/rules/identifier-last8.md';
const NAV_DECL_FILES = ['src/lib/nav/context/pages.ts', 'src/lib/nav/facets/contexts.ts', 'src/lib/sidebar-navigation.ts'];

/** Every file under `src/`, repo-relative with `/` separators. */
function srcFiles(repo) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(repo, dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`);
      else if (e.isFile()) out.push(`${dir}/${e.name}`);
    }
  };
  walk('src');
  return out;
}

/**
 * What the interrupt rule `ruleFile` (omp TTSR frontmatter) would stop if each file of `repo` were
 * written today: file → matched texts. `condition` regexes, the `tool:write(<glob>)` scope and the
 * `globs` exclusions are read from the rule itself — never copied here — so the write-time stop and
 * the loop's whole-tree check cannot drift. Paths are matched repo-relative.
 */
function ruleHits(repo, ruleFile) {
  const rule = parseGuardRule(path.basename(ruleFile, '.md'), fs.readFileSync(path.join(repo, ruleFile), 'utf8'));
  if (!rule?.conditions.length) throw new Error(`${ruleFile}: no compilable \`condition\` to probe with`);
  const scopes = rule.scopes.filter((s) => s.tool === 'write');
  if (!scopes.length) throw new Error(`${ruleFile}: no \`tool:write(<glob>)\` scope`);
  const inScope = (rel) =>
    scopes.some((s) => !s.glob || s.glob.test(rel)) &&
    !rule.exclude.some((re) => re.test(rel)) &&
    (!rule.include.length || rule.include.some((re) => re.test(rel)));
  const signatures = rule.conditions.map((re) => new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`));
  const hits = {};
  for (const rel of srcFiles(repo)) {
    if (!inScope(rel)) continue;
    const src = fs.readFileSync(path.join(repo, rel), 'utf8');
    const found = signatures.flatMap((re) => [...src.matchAll(re)].map((m) => m[0].replace(/\s+/g, ' ').slice(0, 60)));
    if (found.length) hits[rel] = found;
  }
  return hits;
}

/** Files the rule hits in the pack's own tree today; none when the rule cannot be read (the probe then reports no_data). */
function hitFiles(ruleFile) {
  try {
    return Object.keys(ruleHits(PACK_ROOT, ruleFile));
  } catch {
    return [];
  }
}

/**
 * Shrink-only ratchet of an interrupt rule over the tree. `baselineFile` (`{ note, files: { file: hits } }`)
 * holds today's debt: a file over its count, or not listed, is a violation; hits within it are `debt`
 * (advisory `<id>:debt`, one unit per file via `pnpm spec:loop --debt contracts#<id>:debt`).
 * `SPEC_WRITE_CONTRACT_BASELINES=1` rewrites the baseline shrink-only (seeds it when missing).
 */
function ratchet(repo, { ruleFile, baselineFile, note, fix }) {
  const hits = ruleHits(repo, ruleFile);
  const abs = path.join(repo, baselineFile);
  let baseline = fs.existsSync(abs) ? JSON.parse(fs.readFileSync(abs, 'utf8')).files : null;
  if (process.env.SPEC_WRITE_CONTRACT_BASELINES === '1') {
    const next = {};
    for (const [file, found] of Object.entries(hits).sort(([a], [b]) => a.localeCompare(b))) {
      if (!baseline) next[file] = found.length;
      else if (baseline[file] !== undefined) next[file] = Math.min(baseline[file], found.length);
    }
    fs.writeFileSync(abs, `${JSON.stringify({ note, files: next }, null, 2)}\n`);
    baseline = next;
  }
  if (!baseline) throw new Error(`${baselineFile} missing — seed it with SPEC_WRITE_CONTRACT_BASELINES=1`);
  const out = [];
  for (const [file, found] of Object.entries(hits)) {
    const allowed = baseline[file] ?? 0;
    const what = [...new Set(found)].join(' · ');
    if (found.length > allowed) {
      out.push({ message: `${found.length} hit(s) of ${ruleFile}, baseline ${allowed}: ${what} — ${fix}`, file, fingerprint: allowed ? 'grew' : 'new' });
    } else {
      out.push({ message: `${found.length} baselined hit(s) of ${ruleFile}: ${what} — ${fix}`, file, fingerprint: 'debt', debt: true });
    }
  }
  return out;
}

/** @type {SpecRule[]} */
export const CONTRACTS = [
  {
    id: 'nav.live-feed-under-operations',
    statement: 'Live feed is listed under Operations in the desktop sidebar: in the Operations band of the top map, and as a row of the Operations section’s own sidebar.',
    ruling: { ...OPERATOR, words: 'the live feed is not displaying under the operation sidebar' },
    interpretation:
      'Two places: (a) the top map’s "Operations" band lists Live feed; (b) on /operations the view switcher of the Operations panel offers Live feed (opening /operations/live-feed). On 2026-10-03 (a) already held and (b) did not.',
    surface: DESKTOP,
    status: 'active',
    fix: ['revert', 'worker'],
    mutants: ['live-feed-row-dropped'],
    lease: ['src/lib/sidebar-navigation.ts', 'src/lib/nav/context/pages.ts', 'src/components/sidebar/contextual/nav-view-icons.ts'],
    static: async ({ load }) => {
      const nav = await load('src/lib/sidebar-navigation.ts');
      const { LIVE_FEED_PATH } = await load('src/lib/live-feed/route.ts');
      const ops = nav.SIDEBAR_PAGE_NAV.find((p) => p.id === 'operations');
      if (!ops) return [{ message: 'SIDEBAR_PAGE_NAV has no `operations` page', file: 'src/lib/sidebar-navigation.ts' }];
      const row = (ops.children ?? []).find((c) => c.to && c.to().pathname === LIVE_FEED_PATH);
      return row ? [] : [{ message: `the Operations section has no row opening ${LIVE_FEED_PATH} (rows: ${(ops.children ?? []).map((c) => c.label).join(', ')})`, file: 'src/lib/sidebar-navigation.ts', fingerprint: 'no-live-feed-row' }];
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
    status: 'active',
    fix: ['revert', 'worker'],
    mutants: ['pickup-rollout-legacy'],
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
    id: 'nav.warehouse-lane',
    statement: 'The Inventory lane is named Warehouse and wears the Warehouse icon on every surface; no nav row is labelled Inventory — the desktop row becomes Locations (nav-name law: a parent and a child never share a name).',
    ruling: { ...OPERATOR, words: 'the inventory must be renamed to warehouse with a warehouse icon' },
    interpretation:
      'DOMAIN_GROUPS `inventory` = label Warehouse + icon Warehouse (held on 2026-10-03). No APP_SIDEBAR_NAV or SIDEBAR_PAGE_NAV entry is labelled "Inventory"; the desktop row that was "Inventory" is "Locations" (route-tree note on lane `warehouse`). nav-name-guard stays green.',
    surface: 'both',
    status: 'active',
    fix: ['revert', 'worker'],
    mutants: ['warehouse-lane-renamed-inventory'],
    lease: ['src/lib/sidebar-navigation.ts', 'src/lib/nav/lanes.ts', 'src/lib/nav/context/pages.ts', 'src/components/mobile/v2/mobile-v2-destinations.tsx'],
    static: async ({ load }) => {
      const out = [];
      const [{ DOMAIN_GROUPS }, nav, icons] = await Promise.all([load('src/lib/nav/lanes.ts'), load('src/lib/sidebar-navigation.ts'), load('src/components/Icons.tsx')]);
      const lane = DOMAIN_GROUPS.find((g) => g.id === 'inventory');
      if (lane?.label !== 'Warehouse') out.push({ message: `lane inventory is labelled "${lane?.label}"`, file: 'src/lib/nav/lanes.ts', fingerprint: 'lane-label' });
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
    status: 'active',
    fix: ['revert', 'worker'],
    mutants: ['hand-rolled-bottom-buttons', 'stock-rack-labels-door'],
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
        if (hits.length) out.push({ message: `the Stock list renders a door to another parent: ${hits.join(', ')}`, file, fingerprint: 'foreign-door' });
      }
      return out;
    },
  },
  {
    id: 'layout.sidebar-owns-table-controls',
    statement:
      'Every control that changes which records show or in what order — filters, sort, date / time window, staff, carrier / status / reason facets, views, modes, and status chips that filter — lives in the page’s left contextual sidebar, declared in NAV_PAGE_DECLS (src/lib/nav/context/pages.ts); the page body shows records only.',
    ruling: {
      by: 'owner',
      at: '2026-10-04',
      words:
        'The agent has a very hard time building out the left contextual sidebar whenever building a new page. … sorting data table information and filtering belongs in the left contextual sidebar below the top level navigation. I needed to inject that rule whenever it tries to put filtering above the data table, scan the code base and … delete any functions In the codebase that are the opposite of that rule.',
    },
    interpretation:
      'Operator rulings 2026-10-04 (docs/handoff/PROMPT-omp-write-time-rules-2026-10-04.md §3): A1 DataTable’s record-selection controls (sheetFind, filter / DataTableFilterMenu, sortMenu / DataTableSortMenu, views / WorkbenchViewsMenu, dateMenu / DataTableDateMenuControl) are retired — consumers declare them in NAV_PAGE_DECLS; A2 mobile (src/app/m/**, src/components/mobile/**) exempt pending the mobile ruling; A3 the three CSV staging hosts exempt; A4 filtering status chips are controls, declared per page in its sidebar + facet context. Reference shape: QUEUE_CONTROLS at NAV_PAGE_DECLS.outbound.items.orders, facets `outbound.orders`, body reads the URL via useReplaceSearchParams. Probe: the interrupt rule .omp/rules/sidebar-owns-table-controls.md (its condition / scope / globs, read from the file) over every src file, ratcheted by scripts/sidebar-controls.baseline.json (shrink-only). A unit’s fix touches its body file plus the three nav declaration files.',
    surface: DESKTOP,
    status: 'active',
    fix: ['worker'],
    mutants: ['sidebar-sort-menu-in-body'],
    // Per unit = the body file + the nav declarations; the kernel builds one `rule:<id>` unit per rule, so the lease is their union over today's hits.
    get lease() {
      return [...new Set([...hitFiles(SIDEBAR_RULE), ...NAV_DECL_FILES])].sort();
    },
    static: async ({ repo }) =>
      ratchet(repo, {
        ruleFile: SIDEBAR_RULE,
        baselineFile: 'scripts/sidebar-controls.baseline.json',
        note: 'FROZEN BASELINE — files whose body still mounts a record-selection control (.omp/rules/sidebar-owns-table-controls.md signatures). SHRINK-ONLY: declare the control in NAV_PAGE_DECLS and delete it from the body. Rewrite with SPEC_WRITE_CONTRACT_BASELINES=1 node_modules/.bin/tsx tools/spec-loop/live-contracts.mjs --repo . --only layout.sidebar-owns-table-controls.',
        fix: 'declare it in NAV_PAGE_DECLS[page] (rule://sidebar-controls-contract) and render records only',
      }),
  },
  {
    id: 'identity.last8-one-helper',
    statement:
      'An identifier in a list (rows, cards, chips, scan tape — any identifier kind) shows its last 8 through one helper: getLast8 / getLast8Serial / formatOrderIdDisplay (src/lib/copy-chip-format.ts), painted by CopyChip displayWidth="last8" / OperationalIdentityChip; a scanned or typed tail matches through normalizeTrackingLast8 / orderTrackingMatchKeys (src/lib/tracking-format.ts). Never slice(-8) by hand. Record bodies keep the full id; copy is always the full value.',
    ruling: {
      by: 'owner',
      at: '2026-10-04',
      words: 'there is also a rule that I need to implement within the OMP coding harness for the identifiers to use the last eight of the identification number.',
    },
    interpretation:
      'Operator ruling B1 2026-10-04: last 8 when the identifier is in a list; record bodies keep the full id (the 2026-09-30 ruling stands); copy = full value; matching = normalizeTrackingLast8. SQL RIGHT(col, 8) keeps its shape (the idx_stn_*_last8 indexes depend on it) — its INPUT goes through the helper. Probe: the interrupt rule .omp/rules/identifier-last8.md (its condition / scope / globs, read from the file — the helper homes are its exclusions) over every src file, ratcheted by scripts/identifier-last8.baseline.json (shrink-only). A unit’s fix touches its one file.',
    surface: 'both',
    status: 'active',
    fix: ['worker'],
    mutants: ['identifier-hand-rolled-last8'],
    // Per unit = the one file; the kernel builds one `rule:<id>` unit per rule, so the lease is the union over today's hits.
    get lease() {
      return hitFiles(LAST8_RULE).sort();
    },
    static: async ({ repo }) =>
      ratchet(repo, {
        ruleFile: LAST8_RULE,
        baselineFile: 'scripts/identifier-last8.baseline.json',
        note: 'FROZEN BASELINE — hand-rolled last-8 sites outside the helper homes (.omp/rules/identifier-last8.md signatures). SHRINK-ONLY: use getLast8* / CopyChip (display) or normalizeTrackingLast8 / orderTrackingMatchKeys (matching). Rewrite with SPEC_WRITE_CONTRACT_BASELINES=1 node_modules/.bin/tsx tools/spec-loop/live-contracts.mjs --repo . --only identity.last8-one-helper.',
        fix: 'use getLast8 / getLast8Serial / formatOrderIdDisplay or CopyChip displayWidth="last8" (display), normalizeTrackingLast8 / orderTrackingMatchKeys (matching)',
      }),
  },
  // ── Law enforced by other anchors (read by workers and the verifier) ─────────────────────────
  {
    id: 'ds.port',
    statement: 'A hand-rolled control is ported onto the existing design-system primitive for its surface (mobile: DetailDock / MobileV2ActionSheet / Button; desktop: Button / StickyActionBar / DeskActionSlot), and the replacement renders the same verb. Never restyled in place, never deleted, never moved into a primitive folder.',
    ruling: { by: 'owner', at: '2026-10-03', words: 'fix the hand-rolled components and correctly port them onto the already existing design system primitives' },
    surface: 'both',
    status: 'active',
    fix: ['worker'],
    enforcedBy: 'critique,port',
    mutants: ['hand-rolled-bottom-buttons'],
  },
  {
    id: 'ds.surface-split',
    statement: 'Mobile and desktop never share rendered components: mobile code lives in src/components/mobile/** or src/app/m/**, desktop code elsewhere, and only primitives / logic cross (ARCHITECTURE.md Component split).',
    ruling: { by: 'owner', at: '2026-09-14', words: 'Component split (binding)' },
    surface: 'both',
    status: 'active',
    fix: ['revert', 'worker'],
    enforcedBy: 'gate:Boundary',
  },
  {
    id: 'routes.from-tree',
    statement: 'Every Warehouse URL — a path the route tree owns (/m/stock…, /m/loc/…, /m/labels, /m/racks…, /m/h/…) — is written with WAREHOUSE_PATHS or a builder from src/lib/nav/route-tree.ts, never a literal; URLs of other lanes (e.g. /m/scan) are out of scope. A page the tree does not own is removed, not registered (registering is an operator ruling).',
    ruling: { by: 'owner', at: '2026-10-03', words: 'one source of truth for routing and vocabulary' },
    surface: 'both',
    status: 'active',
    fix: ['revert', 'worker'],
    enforcedBy: 'routes,gate:Routes',
    mutants: ['hand-rolled-bottom-buttons', 'unneeded-navigation-page'],
  },
  // Operator rejections accepted as rules (tools/spec-loop/accepted.mjs) — each probed, ratcheted, planted.
  ...ACCEPTED.rules,
];

/** Contracts with a probe (the rest are law text for workers and the verifier). */
export const PROBED = CONTRACTS.filter((c) => c.static || c.live);

/**
 * SpecRuleV1 (Garisek-OS src/lib/loops/spec/types.ts) in JSDoc.
 * @typedef {{ message: string, file?: string, fingerprint?: string, debt?: true }} Violation
 * @typedef {(rel: string) => Promise<Record<string, unknown>>} Load
 * @typedef {{ id: string, statement: string, ruling: { by: string, at: string, words: string }, interpretation?: string,
 *   surface: 'desktop' | 'mobile' | 'both', status: 'proposed' | 'active' | 'retired',
 *   fix: Array<'revert' | 'autofix' | 'worker' | 'ruling'>, lease?: string[], enforcedBy?: string, mutants?: string[],
 *   static?: (ctx: { repo: string, load: Load }) => Promise<Violation[]>,
 *   live?: { viewport: 'desktop' | 'mobile', run: (ctx: { page: unknown, origin: string, load: Load }) => Promise<Violation[]> } }} SpecRule
 */
