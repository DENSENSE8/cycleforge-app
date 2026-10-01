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
 *   node scripts/lighthouse-audit.mjs --update-baseline --allow-lower  # …and let a floor drop
 *   node scripts/lighthouse-audit.mjs --ignore-load      # measure on a busy host anyway
 *
 * Auth: authenticated routes need a session cookie. Mint one with
 *   node scripts/lighthouse-mint-session.mjs   (prints LH_COOKIE=...)
 * then run with LH_COOKIE set. Routes declared `auth: false` are ALWAYS audited
 * without one, whether or not LH_COOKIE is exported — see `cookieFor`.
 *
 * Output: lighthouse/<slug>.json (full LHR, last run) + lighthouse/summary.md.
 * See docs/performance/LIGHTHOUSE.md for the runbook.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'lighthouse');
const baselinePath = path.join(repoRoot, 'lighthouse-baseline.json');

const BASE_URL = process.env.LH_BASE_URL || 'http://localhost:3050';

/**
 * Point chrome-launcher at a browser, without anyone having to know the path.
 *
 * `chrome-launcher` finds a SYSTEM Chrome; this machine's browser is the one
 * Playwright downloaded, which it does not look for. So every runbook and
 * handoff carried a hand-copied
 * `~/.cache/ms-playwright/chromium-<build>/chrome-linux64/chrome` — and that
 * build number bumps on every `playwright install`. When it does, the old path
 * stops existing and the audit dies on route 1 with an error that names Chrome,
 * not the stale constant, so the reader goes looking for a broken browser.
 * (It had already gone stale: 1234 in the docs, 1223 on disk.)
 *
 * Resolve it here instead: honour an explicit `CHROME_PATH`, else take the
 * highest-numbered Playwright build present, else leave the variable unset and
 * let chrome-launcher try a system browser.
 */
function resolveChromePath() {
  const explicit = process.env.CHROME_PATH;
  if (explicit) {
    if (fs.existsSync(explicit)) return explicit;
    console.warn(`CHROME_PATH=${explicit} does not exist — falling back to auto-detection.`);
  }
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(cache)) return null;
  const builds = fs
    .readdirSync(cache)
    .filter((d) => d.startsWith('chromium-'))
    .map((d) => ({ dir: d, n: Number(d.slice('chromium-'.length)) }))
    .filter((b) => Number.isFinite(b.n))
    .sort((a, b) => b.n - a.n);
  for (const b of builds) {
    const bin = path.join(cache, b.dir, 'chrome-linux64', 'chrome');
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

const chromePath = resolveChromePath();
if (chromePath) process.env.CHROME_PATH = chromePath;

/**
 * How busy the machine is, as 1-minute load average per core.
 *
 * `throttlingMethod: 'simulate'` runs the page at full speed and models the
 * slow device afterwards — so the trace it models is the trace this host
 * produced, and a host fighting other work produces a slower one. Nothing about
 * the output says so: the run completes, the JSON looks identical, the score is
 * just lower. On 2026-08-30 a Tier-1 sweep ran beside another session's `tsc`
 * (158% CPU) and eight other next-servers at load 11 on 16 cores, and reported
 * `/m/home` at 55 against a July floor of 71 — a "regression" that was mostly
 * the box.
 *
 * That is the same failure shape as everything else this harness now guards:
 * the number is wrong and nothing distinguishes it from a right one. So measure
 * it, print it, and record it beside the score.
 */
const LOAD_CEILING = Number(process.env.LH_LOAD_CEILING ?? 0.5);
const loadPressure = () => os.loadavg()[0] / (os.cpus().length || 1);

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
 *
 * ## Name the surface, never the alias (2026-08-30)
 *
 * A manifest row must be a path that renders itself. Legacy aliases —
 * `/dashboard`, `/receiving`, `/packer`, `/tech`, `/shipping` — all 308 in
 * `src/proxy.ts` to a surface that is (or should be) its own row, so an alias
 * row measures a page it does not name, plus one redirect hop, and pins a
 * SECOND floor on the same surface that can drift away from the first for pure
 * noise reasons. `/dashboard` is the case that proves the cost: it scored the
 * sign-in page for months under a name nobody double-checked.
 *
 * Removed on 2026-08-30 for that reason: `/dashboard` (→ `/shipping/orders`),
 * `/receiving` (→ `/unbox`), `/packer` (→ `/pack`, which now has its own row),
 * `/shipping` (→ `/shipping/labels`). The redirect itself is a proxy rule with
 * no render; it is not a surface and it does not need a Lighthouse floor.
 *
 * `landedAt` below enforces this: a row whose final URL is not its own path is
 * a failure, not a footnote.
 */
export const ROUTES = [
  { path: '/signin', tier: 1, auth: false, formFactor: 'mobile' },
  // Fulfillment To-ship desk — the canonical outbound queue, and tier 1 because
  // it is where the shipper spends the day. Bare `/dashboard` 308s HERE
  // (`resolveDashboardOutboundRedirect` in `src/proxy.ts`).
  { path: '/shipping/orders', tier: 1, auth: true, formFactor: 'desktop' },
  // Desktop `/unbox` is the operator's real Unbox surface (the seeded
  // `UnboxBrowseShell` first-paint path). It is pinned `formFactor: 'desktop'`
  // because on MOBILE the proxy rewrites `/unbox` → `/m/receiving` (the mobile
  // photo feed), so a mobile audit here would measure the wrong surface — the
  // exact gap that hid the `/unbox` LCP work from this tooling. `/m/unbox`
  // (tier 2) covers the handheld surface; legacy `/receiving` 308s here.
  { path: '/unbox', tier: 1, auth: true, formFactor: 'desktop' },
  { path: '/triage', tier: 1, auth: true, formFactor: 'desktop' },
  // Packing station. `/packer` is the LEGACY path and 308s here
  // (`resolvePackSurfaceRedirect`), so the manifest names the surface, not the
  // alias — see the alias note above `ROUTES`.
  { path: '/pack', tier: 1, auth: true, formFactor: 'desktop' },
  // Quality Control bench (the old `/tech` redirects here) and the Picker desk.
  // Pinned `formFactor: 'desktop'` for the same reason as `/unbox`: standing scan
  // benches on a warehouse monitor whose workbench sheets only exist on the
  // desktop tree. Neither has a mobile UA rewrite, so a mobile audit measured the
  // right TREE at the wrong form factor — throttled 3x-mobile CPU against a desk
  // surface no phone ever loads.
  { path: '/test', tier: 1, auth: true, formFactor: 'desktop' },
  { path: '/pick', tier: 1, auth: true, formFactor: 'desktop' },
  { path: '/search', tier: 1, auth: true, formFactor: 'desktop' },
  { path: '/m/scan', tier: 1, auth: true, formFactor: 'mobile' },
  { path: '/m/home', tier: 1, auth: true, formFactor: 'mobile' },
  // `/shipping` 308s to the labels desk (`resolveShippingSurfaceRedirect`);
  // name the surface, not the alias.
  { path: '/shipping/labels', tier: 2, auth: true, formFactor: 'desktop' },
  { path: '/fulfilled', tier: 2, auth: true, formFactor: 'desktop' },
  { path: '/support', tier: 2, auth: true, formFactor: 'desktop' },
  { path: '/inventory', tier: 2, auth: true, formFactor: 'desktop' },
  { path: '/settings', tier: 2, auth: true, formFactor: 'desktop' },
  { path: '/settings/integrations', tier: 2, auth: true, formFactor: 'desktop' },
  { path: '/incoming', tier: 2, auth: true, formFactor: 'desktop' },
  { path: '/m/pack', tier: 2, auth: true, formFactor: 'mobile' },
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
/** Explicit opt-in to move a floor DOWN — see `writeBaseline`. */
const allowLower = Boolean(getFlag('allow-lower'));
/** Measure anyway on a busy host — the numbers become diagnostic, not a floor. */
const ignoreLoad = Boolean(getFlag('ignore-load'));

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

/**
 * The cookie this route is measured with — `''` for public routes.
 *
 * `auth: false` in the manifest is a claim about WHO loads the page, and it has
 * to drive the cookie or the audit measures a scenario no user is in. `/signin`
 * is the case that proves it: `app/layout.tsx` gates public chrome on
 * `!initialUser`, so a session cookie makes the sign-in page render the entire
 * warehouse client — the LHR showed `/api/staff`, `/api/inbox/support`,
 * `/api/staff-preferences` and a live Ably connection on the public login page.
 *
 * Every `/signin` figure recorded before 2026-08-29 was that signed-in variant,
 * because this function returned the staff cookie for every non-kiosk route.
 * Measured both ways on one build: signed-in 72, signed-out 78 (SI 2931→1608ms,
 * TBT 425→297ms). A signed-in user on `/signin` is not a scenario worth a
 * Tier-1 floor; a signed-out visitor is the only one who ever sees it.
 *
 * Same rule as `formFactor`: change what a route is measured AS and its old
 * baseline is void, not comparable.
 */
/**
 * WHO the run models — recorded in the baseline and enforced by `--check`,
 * exactly like `formFactor`. Derived from the same `auth` flag `cookieFor`
 * reads, so the two can never disagree.
 */
function scenarioFor(route) {
  return route.auth === false ? 'signed-out' : 'authenticated';
}

function cookieFor(route) {
  if (route.auth === false) return '';
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
/**
 * Put the session in Chrome's COOKIE JAR, not just in an injected header.
 *
 * Lighthouse's `extraHeaders` become `Network.setExtraHTTPHeaders`, and that
 * `Cookie` is not re-applied when Chrome follows a cross-document redirect —
 * the browser recomputes `Cookie` from the jar, which was empty. So any route
 * that redirects arrived at its destination signed OUT.
 *
 * `/dashboard` is the case that exposed it, and it is not a niche one: the
 * proxy sends it to `/shipping/orders` (path-based — identical with and without
 * a cookie), and the second hop then bounced to
 * `/signin?next=%2Fshipping%2Forders`. The audit dutifully scored the sign-in
 * page as `/dashboard` — Perf 99, SEO 63 — and `--check` SKIPS routes flagged
 * redirected, so this Tier-1 entry silently gated nothing. `curl` with the same
 * cookie followed the identical chain to a 200, which is what made it look like
 * an expired mint rather than a harness bug.
 *
 * Seeding the jar fixes it at the source: the cookie is sent on every request
 * of every hop, exactly as a real browser would. Best-effort by design — on any
 * failure the caller keeps the old header injection, so a CDP hiccup degrades
 * to previous behaviour instead of failing the run.
 */
async function seedCookieJar(port, cookieHeader, baseUrl) {
  const cookies = cookieHeader
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq <= 0) return null;
      // `url` lets CDP derive domain/path/secure — correct for localhost AND
      // for an https preview, which a hardcoded domain would get wrong.
      return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), url: baseUrl };
    })
    .filter(Boolean);
  if (cookies.length === 0) return false;

  try {
    const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
    const wsUrl = version?.webSocketDebuggerUrl;
    if (!wsUrl) return false;
    return await new Promise((resolve) => {
      const ws = new WebSocket(wsUrl);
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* already closing */
        }
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), 5000);
      ws.onopen = () =>
        ws.send(JSON.stringify({ id: 1, method: 'Storage.setCookies', params: { cookies } }));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.id === 1) finish(!msg.error);
        } catch {
          /* not our frame */
        }
      };
      ws.onerror = () => finish(false);
    });
  } catch {
    return false;
  }
}

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
      // Jar first; fall back to header injection only if CDP seeding failed.
      // Passing the cookie BOTH ways would re-create the conflict documented
      // above `bypassSecret` — the jar wins, so the header is dead weight.
      const jarSeeded = cookie ? await seedCookieJar(chrome.port, cookie, BASE_URL) : false;
      const result = await lighthouse(
        url,
        lhOptions(chrome.port, route.formFactor, jarSeeded ? '' : cookie),
      );
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
  // WHERE the run actually ended up. `redirected` only ever caught the /signin
  // case, so a route that quietly 308'd to a DIFFERENT desk still produced a
  // clean-looking floor under the wrong name — `/dashboard` measured
  // `/shipping/orders`, `/packer` measured `/pack`, `/receiving` measured
  // `/unbox`. Compare the landed path to the requested one and every such row
  // announces itself.
  const landedPaths = runs.map((r) => {
    if (!r.finalUrl) return null;
    try {
      const u = new URL(r.finalUrl);
      // `about:blank` is a run that never loaded the page at all. It has a
      // `pathname` ("blank") like any URL, so treating every scheme alike
      // reports it as a surface — which is how the first version of this check
      // announced `/test` as "WRONG SURFACE→blank".
      return u.protocol === 'http:' || u.protocol === 'https:'
        ? u.pathname.replace(/(.)\/$/, '$1')
        : null;
    } catch {
      return null;
    }
  });
  // A run that never loaded still contributes a score to the median, so it
  // poisons the number rather than merely being absent.
  const blankRun = landedPaths.some((p) => p === null);
  // The last run that DID load — the same run whose LHR is written to disk.
  const landedAt = [...landedPaths].reverse().find((p) => p) ?? null;
  const moved = landedAt != null && landedAt !== route.path;
  if (lastLhr) {
    fs.writeFileSync(path.join(outDir, `${slug(route.path)}.json`), JSON.stringify(lastLhr));
  }
  return {
    route: route.path,
    tier: route.tier,
    formFactor: formFactorFor(route),
    scenario: scenarioFor(route),
    hostLoad: Number(loadPressure().toFixed(2)),
    runs,
    median: med,
    redirected,
    pairScreen,
    landedAt,
    moved,
    blankRun,
  };
}

function writeSummary(results) {
  const measuredFormFactors = [...new Set(results.map((result) => result.formFactor))];
  const summaryFormFactor = measuredFormFactors.length === 1 ? measuredFormFactors[0] : 'mixed profiles';
  const lines = [
    `# Lighthouse summary — ${summaryFormFactor}, ${runsPerRoute} run(s)/route, median reported`,
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
          : r.moved
            ? ` ⚠ measured ${r.landedAt}`
            : r.blankRun
              ? ' ⚠ a run never loaded (about:blank)'
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
    // A route the harness could not measure is a FAILURE, not a pass.
    //
    // This used to `continue`, and that one line is why `/dashboard` gated
    // nothing for months: the cookie was being dropped across the redirect, the
    // audit landed on `/signin`, the run was flagged `redirected` — and the
    // flag then EXCUSED the route from its own ratchet. The failure deleted its
    // own alarm. Skipping is only ever right for a signal you have somewhere
    // else; there is no somewhere else here.
    if (r.pairScreen) {
      console.error(
        `UNMEASURED ${r.route}: landed on the kiosk pair screen — mint a device cookie ` +
          `(scripts/lighthouse-mint-kiosk.mjs) and re-run.`,
      );
      failed = true;
      continue;
    }
    if (r.redirected) {
      console.error(
        `UNMEASURED ${r.route}: audit landed on /signin — the session cookie is missing or ` +
          `expired, so these numbers describe the sign-in page. Re-mint LH_COOKIE and re-run.`,
      );
      failed = true;
      continue;
    }
    if (r.moved) {
      console.error(
        `WRONG SURFACE ${r.route}: measured ${r.landedAt}. A manifest row must be a path that ` +
          `renders itself — point the row at ${r.landedAt} (see the alias note above ROUTES).`,
      );
      failed = true;
      continue;
    }
    if (r.blankRun) {
      console.error(
        `UNMEASURED ${r.route}: at least one run ended on about:blank — the page never loaded, ` +
          `and that run still contributed a score to the median. Re-run this route.`,
      );
      failed = true;
      continue;
    }
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
    // Same rule for WHO loaded the page. `/signin` measured with a session
    // cookie renders the whole warehouse client (public chrome is gated on
    // `!initialUser`), which is a different page than the one a visitor sees —
    // every `/signin` floor before 2026-08-29 was that wrong scenario.
    if ((b.scenario ?? 'authenticated') !== r.scenario) {
      console.error(
        `STALE BASELINE ${r.route}: floor was measured ${b.scenario ?? 'with an unrecorded scenario'}, ` +
          `this run is ${r.scenario}. Re-seed with --update-baseline.`,
      );
      failed = true;
      continue;
    }
    // SEO is a PUBLIC-route metric, per LIGHTHOUSE.md ("SEO >= 90 public
    // routes"). This app serves `robots.txt` as `Disallow: /` — it is a private
    // warehouse system and being uncrawlable is the intent, so `is-crawlable`
    // scores 0 on every signed-in surface and drags SEO to ~63.
    //
    // It read 91 before 2026-08-29 only because `robots.txt` itself sits behind
    // auth: the unauthenticated fetch Lighthouse made was redirected to
    // `/signin`, so it never saw the file. Seeding the cookie jar (see
    // `seedCookieJar`) made that fetch authenticated and surfaced the real
    // value. Enforcing it would demand indexability the app deliberately
    // refuses, so gate SEO where the policy actually applies.
    const keys =
      r.scenario === 'signed-out'
        ? ['performance', 'accessibility', 'bestPractices', 'seo']
        : ['performance', 'accessibility', 'bestPractices'];
    for (const key of keys) {
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
    // Same rule as `checkBaseline`: a run that measured another page must not
    // become this route's floor.
    if (r.redirected || r.moved || r.blankRun) {
      console.error(
        `SKIPPED baseline for ${r.route} — it measured ` +
          `${r.blankRun ? 'about:blank on at least one run' : (r.landedAt ?? '/signin')}, not itself.`,
      );
      continue;
    }
    const prior = existing.routes[r.route];
    // The profile decides whether the old floor means anything. A floor recorded
    // at another form factor or another scenario is not a lower bound on this
    // run — it is a measurement of a different thing — so those adopt the new
    // median outright. Everything else RATCHETS.
    const profileVoid =
      !prior ||
      prior.formFactor !== r.formFactor ||
      (prior.scenario ?? 'authenticated') !== r.scenario;
    const min = {};
    for (const key of ['performance', 'accessibility', 'bestPractices', 'seo']) {
      const measured = r.median[key];
      const priorMin = prior?.min?.[key];
      if (profileVoid || typeof priorMin !== 'number' || measured >= priorMin) {
        min[key] = measured;
        continue;
      }
      if (allowLower) {
        console.warn(`LOWERED ${r.route} ${key}: ${priorMin} → ${measured} (--allow-lower).`);
        min[key] = measured;
      } else {
        // Keep the floor. `--check` will now fail this route, which is the
        // point: a regression should stay visible instead of being re-seeded
        // away. Until this, `--update-baseline` overwrote `min` with whatever
        // was just measured — so the "ratchet" the runbook describes moved
        // floors DOWN as happily as up, and the only record of a lost win was
        // the git diff nobody reads a JSON blob in.
        console.error(
          `WOULD LOWER ${r.route} ${key}: measured ${measured} < floor ${priorMin}. Floor KEPT. ` +
            `Fix the regression, or re-run with --allow-lower and record why alongside it.`,
        );
        min[key] = priorMin;
      }
    }
    existing.routes[r.route] = {
      tier: r.tier,
      formFactor: r.formFactor,
      scenario: r.scenario,
      min,
      measured: r.median,
      // What the box was doing while this was measured. A floor pinned at 0.9
      // is not comparable to a check run at 0.1.
      hostLoad: r.hostLoad,
      updatedAt: new Date().toISOString(),
    };
  }
  // Drop floors for paths that are no longer in the manifest at all. A baseline
  // entry outlives its route silently — nothing measures it, nothing checks it,
  // and it reads as coverage. `/dashboard`, `/receiving` and `/packer` all left
  // one behind when they were recognised as aliases.
  const known = new Set(ROUTES.map((r) => r.path));
  for (const p of Object.keys(existing.routes ?? {})) {
    if (!known.has(p)) {
      delete existing.routes[p];
      console.log(`Pruned baseline for ${p} — no longer in the ROUTES manifest.`);
    }
  }
  fs.writeFileSync(baselinePath, JSON.stringify(existing, null, 2) + '\n');
  console.log(`Wrote ${baselinePath}`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const pressure = loadPressure();
  if (pressure > LOAD_CEILING) {
    const msg =
      `Host load is ${os.loadavg()[0].toFixed(1)} across ${os.cpus().length} cores ` +
      `(${Math.round(pressure * 100)}% — ceiling ${Math.round(LOAD_CEILING * 100)}%). ` +
      `Simulated throttling models THIS host's trace, so these scores will read low ` +
      `and nothing in the output would tell you.`;
    if (ignoreLoad) {
      console.warn(`⚠ ${msg}\n  Continuing anyway (--ignore-load). Treat the numbers as diagnostic.`);
    } else {
      console.error(`${msg}\n  Wait for the box to quiet down, or pass --ignore-load to measure anyway.`);
      process.exit(1);
    }
  }
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
          : r.moved
            ? ` ⚠ WRONG SURFACE→${r.landedAt}`
            : r.blankRun
              ? ' ⚠ BLANK RUN'
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
