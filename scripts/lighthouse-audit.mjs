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

/**
 * Route manifest (tiers per docs/performance/LIGHTHOUSE.md).
 * `formFactor` is the device the surface actually ships on —
 * it drives viewport AND throttling (see THROTTLING below), so it is a claim
 * about deployment, not a rendering preference.
 *
 * Policy (2026-08-22): this is a warehouse management system, so the profile
 * follows the hardware. Desk workbenches — the dense sheet/grid surfaces an
 * operator works from a workstation on the warehouse LAN — are `desktop`.
 * `/m/*` is the handheld/phone tree and stays `mobile`. `/kiosk*` is a mounted
 * landscape tablet. `/signin` stays `mobile` deliberately: it is the one public
 * route, it is reached from every device including handhelds, and it is the
 * cheapest page in the app, so it is the honest worst-case canary.
 *
 * Before this, every desk workbench was scored as a budget phone on simulated
 * slow-4G — a scenario none of them ever run in.
 */
export const ROUTES = [
  { path: '/signin', tier: 1, auth: false, formFactor: 'mobile' },
  { path: '/dashboard', tier: 1, auth: true, formFactor: 'desktop' },
  // Fulfillment To-ship desk — the canonical outbound queue, and tier 1 because
  // it is where the shipper spends the day. Bare `/dashboard` 308s HERE
  // (`resolveDashboardOutboundRedirect` in `src/proxy.ts`), so the row above has
  // been measuring this surface plus a redirect hop under the wrong name; this
  // entry measures it directly.
  { path: '/shipping/orders', tier: 1, auth: true, formFactor: 'desktop' },
  { path: '/receiving', tier: 1, auth: true, formFactor: 'desktop' },
  // Desktop `/unbox` is the operator's real Unbox surface (the seeded
  // `UnboxBrowseShell` first-paint path). It is pinned `formFactor: 'desktop'`
  // because on MOBILE the proxy rewrites `/unbox` → `/m/receiving` (the mobile
  // photo feed), so a mobile audit here would measure the wrong surface — the
  // exact gap that hid the `/unbox` LCP work from this tooling. `/receiving`
  // (legacy) and `/m/unbox` (tier 2) still cover the other two surfaces.
  { path: '/unbox', tier: 1, auth: true, formFactor: 'desktop' },
  { path: '/triage', tier: 1, auth: true, formFactor: 'desktop' },
  { path: '/packer', tier: 1, auth: true, formFactor: 'desktop' },
  // Testing station (the old `/tech` redirects here). Pinned `formFactor:
  // 'desktop'` for the same reason as `/unbox`: this is a standing scan bench on
  // a warehouse monitor, and its default landing (Ready to Pack) is a workbench
  // sheet that only exists on the desktop tree. `/test` has NO mobile UA rewrite,
  // so a mobile audit measured the right TREE at the wrong form factor —
  // throttled 3x-mobile CPU against a desk surface no phone ever loads.
  { path: '/test', tier: 1, auth: true, formFactor: 'desktop' },
  { path: '/search', tier: 1, auth: true, formFactor: 'desktop' },
  { path: '/m/receive', tier: 1, auth: true, formFactor: 'mobile' },
  { path: '/m/scan', tier: 1, auth: true, formFactor: 'mobile' },
  { path: '/m/home', tier: 1, auth: true, formFactor: 'mobile' },
  { path: '/shipping', tier: 2, auth: true, formFactor: 'desktop' },
  { path: '/support', tier: 2, auth: true, formFactor: 'desktop' },
  { path: '/inventory', tier: 2, auth: true, formFactor: 'desktop' },
  { path: '/settings', tier: 2, auth: true, formFactor: 'desktop' },
  { path: '/incoming', tier: 2, auth: true, formFactor: 'desktop' },
  { path: '/m/pack', tier: 2, auth: true, formFactor: 'mobile' },
  { path: '/m/triage', tier: 2, auth: true, formFactor: 'mobile' },
  { path: '/m/unbox', tier: 2, auth: true, formFactor: 'mobile' },
  // Tablet POS is landscape — desktop form factor, same reason as /unbox.
  // Auth is the device principal (`cf_kiosk`), not staff `cf_sid`. Mint with
  // `scripts/lighthouse-mint-kiosk.mjs`. A pair-screen landing is discarded.
  { path: '/kiosk', tier: 2, auth: true, formFactor: 'desktop' },
  { path: '/kiosk/v2', tier: 2, auth: true, formFactor: 'desktop' },
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

/**
 * Vercel Deployment Protection bypass, for auditing a PREVIEW deployment.
 *
 * A preview URL behind Vercel Authentication answers every request with a 302 to
 * the SSO gate, so Lighthouse measures the redirect and every route reports the
 * same meaningless numbers. Project Settings → Deployment Protection →
 * "Protection Bypass for Automation" issues a secret; sending it as this header
 * lets automation through while the preview stays closed to everyone else.
 *
 * Deliberately WITHOUT `x-vercel-set-bypass-cookie`. That header asks Vercel to
 * set a bypass cookie on the first response — and the moment Chrome's cookie jar
 * has an entry for the origin, the jar wins over the `Cookie` we inject through
 * `extraHeaders`, so the minted `cf_sid` stopped being sent and every
 * authenticated route landed on `/signin` while curl with the same cookie
 * returned 200. The header below is applied by Chrome to EVERY request
 * (subresources included), so the cookie buys nothing and costs the session.
 */
const bypassSecret = process.env.LH_BYPASS_SECRET || '';
const bypassHeaders = bypassSecret
  ? { 'x-vercel-protection-bypass': bypassSecret }
  : {};

const staffCookie = process.env.LH_COOKIE || '';
/** Device-principal cookie for `/kiosk*`. Staff `cf_sid` lands on the pair screen. */
const kioskCookie =
  process.env.LH_KIOSK_COOKIE || (staffCookie.startsWith('cf_kiosk=') ? staffCookie : '');

function cookieFor(route) {
  if (String(route.path).startsWith('/kiosk')) return kioskCookie || staffCookie;
  return staffCookie;
}

const slug = (p) => (p === '/' ? 'root' : p.replace(/^\//, '').replace(/\//g, '-'));
const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * Network + CPU throttling, matched to the form factor.
 *
 * Lighthouse only derives `screenEmulation` from `formFactor` — throttling has
 * its own default, and that default is `mobileSlow4G` (1.6 Mbps, 150 ms RTT,
 * 4x CPU slowdown) REGARDLESS of form factor. Until 2026-08-22 this file set
 * `formFactor: 'desktop'` on `/unbox`, `/test` and `/kiosk*` without touching
 * throttling, so those surfaces were measured at desktop viewport on a budget
 * phone's cellular link — a device combination that does not exist. Their
 * scores were not comparable to anything.
 *
 * `desktopDense4G` is Lighthouse's own desktop preset (10 Mbps, 40 ms RTT, no
 * CPU slowdown) and models a workstation on the warehouse LAN.
 */
const THROTTLING = {
  desktop: { rttMs: 40, throughputKbps: 10 * 1024, cpuSlowdownMultiplier: 1 },
  mobile: { rttMs: 150, throughputKbps: 1.6 * 1024, cpuSlowdownMultiplier: 4 },
};

/**
 * Lighthouse config. A route may pin its own `formFactor` — that override wins
 * over the run-wide default so a mixed run measures each surface on the device
 * its operator actually uses, at that device's network and CPU.
 */
function lhOptions(port, routeFormFactor, cookie) {
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
    throttling: THROTTLING[ff],
    extraHeaders: cookie || bypassSecret
      ? { ...(cookie ? { Cookie: cookie } : {}), ...bypassHeaders }
      : undefined,
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  };
}

/** The form factor a route is actually measured at (route pin wins). */
const formFactorFor = (route) => route.formFactor ?? formFactor;

/** Kiosk pair screen (no `cf_kiosk`) is the same class of miss as /signin. */
async function isKioskPairScreen(route, cookie) {
  if (!String(route.path).startsWith('/kiosk')) return false;
  try {
    const r = await fetch(`${BASE_URL}/api/kiosk/settings`, {
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...bypassHeaders },
    });
    return r.status === 401;
  } catch {
    return true;
  }
}

async function auditRoute(route) {
  const url = `${BASE_URL}${route.path}`;
  const cookie = cookieFor(route);
  const pairScreen = await isKioskPairScreen(route, cookie);
  const runs = [];
  let lastLhr = null;
  for (let i = 0; i < runsPerRoute; i++) {
    const chrome = await launch({ chromeFlags: ['--headless=new', '--no-first-run', '--disable-gpu'] });
    try {
      const result = await lighthouse(url, lhOptions(chrome.port, route.formFactor, cookie));
      lastLhr = result.lhr;
      runs.push({
        performance: Math.round((result.lhr.categories.performance?.score ?? 0) * 100),
        accessibility: Math.round((result.lhr.categories.accessibility?.score ?? 0) * 100),
        bestPractices: Math.round((result.lhr.categories['best-practices']?.score ?? 0) * 100),
        seo: Math.round((result.lhr.categories.seo?.score ?? 0) * 100),
        lcpMs: Math.round(result.lhr.audits['largest-contentful-paint']?.numericValue ?? 0),
        siMs: Math.round(result.lhr.audits['speed-index']?.numericValue ?? 0),
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
    siMs: median(runs.map((r) => r.siMs)),
    tbtMs: median(runs.map((r) => r.tbtMs)),
    cls: median(runs.map((r) => r.cls)),
  };
  // Auth sanity: if an authenticated route ended up on /signin, the cookie is
  // missing/expired and the numbers are for the wrong page. Kiosk pair-screen
  // landings are the same miss — discard them.
  const redirected =
    pairScreen || (route.auth && runs.some((r) => r.finalUrl?.includes('/signin')));
  if (lastLhr) {
    fs.writeFileSync(path.join(outDir, `${slug(route.path)}.json`), JSON.stringify(lastLhr));
  }
  return {
    route: route.path,
    tier: route.tier,
    formFactor: formFactorFor(route),
    runs,
    median: med,
    redirected,
    pairScreen,
  };
}

function writeSummary(results) {
  const lines = [
    `# Lighthouse summary — ${formFactor}, ${runsPerRoute} run(s)/route, median reported`,
    '',
    `Generated: ${new Date().toISOString()} · base: ${BASE_URL}`,
    '',
    '| Route | Tier | Perf | A11y | BP | SEO | SI (ms) | LCP (ms) | TBT (ms) | CLS |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...results.map((r) => {
      const m = r.median;
      const flag = r.pairScreen
        ? ' ⚠ redirected — pair screen'
        : r.redirected
          ? ' ⚠ redirected to /signin'
          : '';
      return `| ${r.route}${flag} | ${r.tier} | ${m.performance} | ${m.accessibility} | ${m.bestPractices} | ${m.seo} | ${m.siMs} | ${m.lcpMs} | ${m.tbtMs} | ${m.cls} |`;
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
    if (r.redirected) continue;
    // An unpinned route is a coverage hole, not a pass. Silently skipping it is
    // how a new surface ships with no floor at all.
    if (!b) {
      console.error(`NO BASELINE ${r.route} — run --update-baseline to pin a floor.`);
      failed = true;
      continue;
    }
    // Scores are only comparable within one device profile. A floor recorded on
    // mobile slow-4G says nothing about a desktop-LAN run (and vice versa), so a
    // profile change must force a reseed rather than quietly pass every route.
    if (b.formFactor !== r.formFactor) {
      console.error(
        `STALE BASELINE ${r.route}: floor was measured at ${b.formFactor ?? 'an unrecorded form factor'}, ` +
          `this run is ${r.formFactor}. Re-seed with --update-baseline.`,
      );
      failed = true;
      continue;
    }
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
      formFactor: r.formFactor,
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
    process.stdout.write(`Auditing ${route.path} (${runsPerRoute}x ${formFactorFor(route)})… `);
    try {
      const r = await auditRoute(route);
      results.push(r);
      const m = r.median;
      const miss = r.pairScreen
        ? ' ⚠ REDIRECTED→pair'
        : r.redirected
          ? ' ⚠ REDIRECTED→/signin'
          : '';
      console.log(
        `perf=${m.performance} a11y=${m.accessibility} bp=${m.bestPractices} seo=${m.seo} si=${m.siMs}ms lcp=${m.lcpMs}ms tbt=${m.tbtMs}ms cls=${m.cls}${miss}`,
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

// `ROUTES` is exported, so this file is importable — run the audit only when it
// is the entry point. Without this, merely reading the manifest launches Chrome
// and audits all 22 routes.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
