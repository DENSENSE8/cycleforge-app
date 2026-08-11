#!/usr/bin/env node
/**
 * Lighthouse audit runner — repeatable per-route audits against a local
 * production server (`pnpm build && pnpm start`).
 *
 * Usage:
 *   node scripts/lighthouse-audit.mjs                    # all Tier-1 routes, mobile, median of 3
 *   node scripts/lighthouse-audit.mjs --routes /signin,/dashboard
 *   node scripts/lighthouse-audit.mjs --tier 1 --runs 1  # quick single-run pass
 *   node scripts/lighthouse-audit.mjs --check            # compare medians against lighthouse-baseline.json (ratchet)
 *   node scripts/lighthouse-audit.mjs --update-baseline  # write medians into lighthouse-baseline.json
 *
 * Auth: authenticated routes need a session cookie. Mint one with
 *   node scripts/lighthouse-mint-session.mjs   (prints LH_COOKIE=...)
 * then run with LH_COOKIE set. Unauthenticated runs still work for /signin.
 *
 * Output: lighthouse/<slug>.json (full LHR, last run) + lighthouse/summary.md.
 * See docs/performance/LIGHTHOUSE.md for the runbook.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'lighthouse');
const baselinePath = path.join(repoRoot, 'lighthouse-baseline.json');

const BASE_URL = process.env.LH_BASE_URL || 'http://localhost:3000';

/** Route manifest — tiers per docs/performance/LIGHTHOUSE.md. */
export const ROUTES = [
  { path: '/signin', tier: 1, auth: false },
  { path: '/dashboard', tier: 1, auth: true },
  { path: '/receiving', tier: 1, auth: true },
  // Desktop `/unbox` is the operator's real Unbox surface (the seeded
  // `UnboxBrowseShell` first-paint path). It is pinned `formFactor: 'desktop'`
  // because on MOBILE the proxy rewrites `/unbox` → `/m/receiving` (the mobile
  // photo feed), so a mobile audit here would measure the wrong surface — the
  // exact gap that hid the `/unbox` LCP work from this tooling. `/receiving`
  // (legacy) and `/m/unbox` (tier 2) still cover the other two surfaces.
  { path: '/unbox', tier: 1, auth: true, formFactor: 'desktop' },
  { path: '/triage', tier: 1, auth: true },
  { path: '/packer', tier: 1, auth: true },
  { path: '/test', tier: 1, auth: true }, // testing station (the old /tech redirects here)
  { path: '/search', tier: 1, auth: true },
  { path: '/m/receive', tier: 1, auth: true },
  { path: '/m/scan', tier: 1, auth: true },
  { path: '/m/home', tier: 1, auth: true },
  { path: '/shipping', tier: 2, auth: true },
  { path: '/support', tier: 2, auth: true },
  { path: '/inventory', tier: 2, auth: true },
  { path: '/settings', tier: 2, auth: true },
  { path: '/incoming', tier: 2, auth: true },
  { path: '/m/pack', tier: 2, auth: true },
  { path: '/m/triage', tier: 2, auth: true },
  { path: '/m/unbox', tier: 2, auth: true },
];

const args = process.argv.slice(2);
const getFlag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : undefined;
};

const runsPerRoute = Number(getFlag('runs') || 3);
const formFactor = getFlag('desktop') ? 'desktop' : 'mobile';
const check = Boolean(getFlag('check'));
const updateBaseline = Boolean(getFlag('update-baseline'));

let routes = ROUTES;
const tierArg = getFlag('tier');
if (typeof tierArg === 'string') routes = routes.filter((r) => r.tier === Number(tierArg));
const routesArg = getFlag('routes');
if (typeof routesArg === 'string') {
  const wanted = routesArg.split(',').map((s) => s.trim());
  routes = wanted.map((p) => ROUTES.find((r) => r.path === p) ?? { path: p, tier: 0, auth: true });
}

const cookie = process.env.LH_COOKIE || '';

const slug = (p) => (p === '/' ? 'root' : p.replace(/^\//, '').replace(/\//g, '-'));
const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * Lighthouse config: simulated slow-4G mobile (LH defaults) or desktop preset.
 * A route may pin its own `formFactor` (e.g. desktop `/unbox`) — that override
 * wins over the run-wide default so a mixed run still measures each surface on
 * the device its operator actually uses.
 */
function lhOptions(port, routeFormFactor) {
  const ff = routeFormFactor ?? formFactor;
  return {
    port,
    output: 'json',
    logLevel: 'error',
    formFactor: ff,
    screenEmulation:
      ff === 'desktop'
        ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
        : { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
    throttlingMethod: 'simulate',
    extraHeaders: cookie ? { Cookie: cookie } : undefined,
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  };
}

async function auditRoute(route) {
  const url = `${BASE_URL}${route.path}`;
  const runs = [];
  let lastLhr = null;
  for (let i = 0; i < runsPerRoute; i++) {
    const chrome = await launch({ chromeFlags: ['--headless=new', '--no-first-run', '--disable-gpu'] });
    try {
      const result = await lighthouse(url, lhOptions(chrome.port, route.formFactor));
      lastLhr = result.lhr;
      runs.push({
        performance: Math.round((result.lhr.categories.performance?.score ?? 0) * 100),
        accessibility: Math.round((result.lhr.categories.accessibility?.score ?? 0) * 100),
        bestPractices: Math.round((result.lhr.categories['best-practices']?.score ?? 0) * 100),
        seo: Math.round((result.lhr.categories.seo?.score ?? 0) * 100),
        lcpMs: Math.round(result.lhr.audits['largest-contentful-paint']?.numericValue ?? 0),
        tbtMs: Math.round(result.lhr.audits['total-blocking-time']?.numericValue ?? 0),
        cls: Number((result.lhr.audits['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)),
        finalUrl: result.lhr.finalDisplayedUrl,
      });
    } finally {
      chrome.kill();
    }
  }
  const med = {
    performance: median(runs.map((r) => r.performance)),
    accessibility: median(runs.map((r) => r.accessibility)),
    bestPractices: median(runs.map((r) => r.bestPractices)),
    seo: median(runs.map((r) => r.seo)),
    lcpMs: median(runs.map((r) => r.lcpMs)),
    tbtMs: median(runs.map((r) => r.tbtMs)),
    cls: median(runs.map((r) => r.cls)),
  };
  // Auth sanity: if an authenticated route ended up on /signin, the cookie is
  // missing/expired and the numbers are for the wrong page.
  const redirected = route.auth && runs.some((r) => r.finalUrl?.includes('/signin'));
  if (lastLhr) {
    fs.writeFileSync(path.join(outDir, `${slug(route.path)}.json`), JSON.stringify(lastLhr));
  }
  return { route: route.path, tier: route.tier, runs, median: med, redirected };
}

function writeSummary(results) {
  const lines = [
    `# Lighthouse summary — ${formFactor}, ${runsPerRoute} run(s)/route, median reported`,
    '',
    `Generated: ${new Date().toISOString()} · base: ${BASE_URL}`,
    '',
    '| Route | Tier | Perf | A11y | BP | SEO | LCP (ms) | TBT (ms) | CLS |',
    '|---|---|---|---|---|---|---|---|---|',
    ...results.map((r) => {
      const m = r.median;
      const flag = r.redirected ? ' ⚠ redirected to /signin' : '';
      return `| ${r.route}${flag} | ${r.tier} | ${m.performance} | ${m.accessibility} | ${m.bestPractices} | ${m.seo} | ${m.lcpMs} | ${m.tbtMs} | ${m.cls} |`;
    }),
  ];
  fs.writeFileSync(path.join(outDir, 'summary.md'), lines.join('\n') + '\n');
}

function checkBaseline(results) {
  if (!fs.existsSync(baselinePath)) {
    console.error('No lighthouse-baseline.json — run with --update-baseline first.');
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  let failed = false;
  for (const r of results) {
    const b = baseline.routes?.[r.route];
    if (!b || r.redirected) continue;
    for (const key of ['performance', 'accessibility', 'bestPractices', 'seo']) {
      const min = b.min?.[key];
      if (typeof min === 'number' && r.median[key] < min - (baseline.tolerance ?? 3)) {
        console.error(`RATCHET FAIL ${r.route} ${key}: ${r.median[key]} < min ${min}`);
        failed = true;
      }
    }
  }
  if (failed) process.exit(1);
  console.log('Baseline ratchet OK.');
}

function writeBaseline(results) {
  const existing = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : { tolerance: 3, routes: {} };
  for (const r of results) {
    if (r.redirected) continue;
    existing.routes[r.route] = {
      tier: r.tier,
      min: {
        performance: r.median.performance,
        accessibility: r.median.accessibility,
        bestPractices: r.median.bestPractices,
        seo: r.median.seo,
      },
      measured: r.median,
      updatedAt: new Date().toISOString(),
    };
  }
  fs.writeFileSync(baselinePath, JSON.stringify(existing, null, 2) + '\n');
  console.log(`Wrote ${baselinePath}`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const route of routes) {
    process.stdout.write(`Auditing ${route.path} (${runsPerRoute}x ${formFactor})… `);
    try {
      const r = await auditRoute(route);
      results.push(r);
      const m = r.median;
      console.log(
        `perf=${m.performance} a11y=${m.accessibility} bp=${m.bestPractices} seo=${m.seo} lcp=${m.lcpMs}ms tbt=${m.tbtMs}ms cls=${m.cls}${r.redirected ? ' ⚠ REDIRECTED→/signin' : ''}`,
      );
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({ route: route.path, tier: route.tier, runs: [], median: {}, error: String(err.message) });
    }
  }
  writeSummary(results.filter((r) => !r.error));
  if (updateBaseline) writeBaseline(results.filter((r) => !r.error));
  if (check) checkBaseline(results.filter((r) => !r.error));
}

main();
