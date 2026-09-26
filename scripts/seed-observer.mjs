#!/usr/bin/env node
/**
 * Seed observer — proves a server-side seed actually reached the first HTML.
 *
 * ## Why this exists
 *
 * The whole ≥92 Lighthouse strategy rests on RSC seeds: the page dehydrates the
 * first screen's rows into the server payload so LCP does not wait on a
 * post-hydration round trip. Every one of those seeds is written to SOFT-FAIL —
 * `catch → return null → "the client will fetch"` — which is correct for
 * availability and catastrophic for observability. When a seed breaks, the page
 * still renders. There is no error, no 500, no failing test. It silently
 * degrades to exactly the pre-optimization behaviour, and the only symptom is a
 * score that drifts back down months later.
 *
 * Two things already happened to prove that is not hypothetical:
 *
 *   - `/triage`'s seed was DELETED (2026-08-27) once someone measured it: it
 *     blocked TTFB to warm a table Arrival never paints. A net negative that
 *     nothing would have caught.
 *   - `/search`'s seed earned +12 points and was confirmed by hand exactly
 *     once, with a `curl … | grep -o receiving_id | wc -l`. This file is that
 *     check, automated and ratcheted.
 *
 * A key mismatch is the nastiest variant, because the seed looks like it worked:
 * the rows ARE dehydrated, they are just filed under a key the client never
 * reads, so the client refetches and the seed paid TTFB for nothing. That is why
 * this asserts on the QUERY KEY and not merely on row-shaped bytes being
 * present.
 *
 * ## How it reads the page
 *
 * Not a substring grep. Next streams the RSC payload as a series of
 * `self.__next_f.push([1, "<chunk>"])` calls, and a chunk boundary can land
 * anywhere — including the middle of a JSON string — so grepping the raw HTML
 * for a key is a coin flip on payload size. `flightPayload` reconstructs the
 * stream by JSON-parsing each pushed string literal and concatenating, then
 * `dehydratedQueries` does one string-aware pass to pull out every balanced
 * object that owns a `queryKey`. What comes back is the real dehydrated cache.
 *
 * ## Usage
 *
 *   NEXT_DIST_DIR=.next-perf npm run build
 *   AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf npx next start -p 3100
 *   npm run perf:seeds                       # check against seed-budget.json
 *   npm run perf:seeds -- --report           # print, never fail
 *   npm run perf:seeds:update                # re-seed the floors
 *
 * Env: `SEED_BASE_URL` (default http://localhost:3100), `LH_COOKIE` (minted via
 * `scripts/lighthouse-mint-session.mjs` if unset).
 *
 * Measure against a PRODUCTION build. A dev server renders a different payload.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const budgetPath = path.join(repoRoot, 'seed-budget.json');

const args = process.argv.slice(2);
/** Accepts both `--route=/search` and `--route /search`. */
const flag = (name) => {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : undefined;
};
const update = Boolean(flag('update'));
const report = Boolean(flag('report'));
const only = typeof flag('route') === 'string' ? String(flag('route')) : null;
const BASE = String(flag('base') || process.env.SEED_BASE_URL || 'http://localhost:3100');

/**
 * Every route that ships a server seed, and the cache keys that seed must land.
 *
 * `keyPrefix` is matched element-wise against the head of the dehydrated
 * `queryKey`, deliberately SHORTER than the full key: the trailing elements are
 * scope/filter/staff slots that legitimately move (`receivingRailQueryKey`'s
 * segment follows whichever feed is default), and pinning them here would turn
 * an intentional product change into a red gate. The full key that was actually
 * observed is recorded in `seed-budget.json` beside the floor, so a drift the
 * prefix tolerates is still visible in a checked-in diff.
 *
 * `minRows: 0` means "this key must be present with non-null data" — the right
 * assertion for a counts/placement payload, which is an object, not a list.
 *
 * A recorded `observedKey` containing `"$undefined"` is not drift. React's flight
 * format encodes an `undefined` property that way, so an options object like
 * `{ packedBy: undefined }` round-trips through the payload as
 * `{ packedBy: "$undefined" }` and hydrate restores it. Matching on a prefix
 * rather than the whole key is also what keeps that encoding out of the
 * assertion.
 */
const SEEDED_ROUTES = [
  {
    route: '/search',
    module: 'src/lib/queries/search-recent-shell-seed.server.ts',
    seeds: [
      {
        label: 'Recently-searched rail',
        // `seedSearchRecentRail` — the rail owns the LCP element and is a
        // SIBLING of the page, so only a shell-level seed can reach it.
        keyPrefix: ['receiving-lines-table', 'rail', 'search-recent'],
      },
    ],
  },
  {
    route: '/unbox',
    module: 'src/lib/queries/unbox-spine-seed.server.ts',
    seeds: [
      { label: 'Unbox recents rail', keyPrefix: ['receiving-lines-table', 'rail'] },
      // The selected carton's lines. An object payload, so presence is the test.
      { label: 'Selected carton lines', keyPrefix: ['receiving-siblings'] },
    ],
  },
  {
    route: '/test',
    module: 'src/lib/queries/ready-to-pack-shell-seed.server.ts',
    seeds: [
      { label: 'Ready-to-pack queue', keyPrefix: ['dashboard-table', 'unshipped'] },
      { label: 'Queue counts', keyPrefix: ['dashboard-table', 'unshipped-counts'] },
      { label: 'Pack placement (orders)', keyPrefix: ['orders', 'pack-placement'] },
    ],
  },
  {
    route: '/shipping/orders',
    module: 'src/lib/queries/unshipped-queue-seed.server.ts',
    seeds: [
      { label: 'To-ship unshipped queue', keyPrefix: ['dashboard-table', 'unshipped'] },
      { label: 'Queue counts', keyPrefix: ['dashboard-table', 'unshipped-counts'] },
    ],
  },
  {
    route: '/pack',
    module: 'src/components/packer/PackerSurfacePage.tsx',
    seeds: [
      // NOT a `*-seed.server.ts` module — an inline `prefetchQuery` in the
      // surface component, which is why the seed inventory missed it. Scoped to
      // THIS packer's current week, so an empty week is a legitimate 0 rows and
      // the assertion here is presence of the key, not a row floor.
      { label: 'Packer week logs', keyPrefix: ['packer-logs'] },
    ],
  },
  {
    route: '/m/home',
    module: 'src/lib/queries/mobile-feed-seed.server.ts',
    seeds: [
      { label: 'Mobile Unbox feed', keyPrefix: ['receiving-lines-table', 'rail', 'unbox-opened'] },
    ],
  },
  {
    route: '/m/scan',
    module: 'src/lib/queries/mobile-feed-seed.server.ts',
    seeds: [
      { label: 'Mobile Arrival feed', keyPrefix: ['receiving-lines-table', 'rail', 'scanned'] },
    ],
  },
];

/** The session cookie. Minted with the existing script rather than re-implemented. */
function sessionCookie() {
  if (process.env.LH_COOKIE) return process.env.LH_COOKIE;
  return execFileSync(process.execPath, [path.join(__dirname, 'lighthouse-mint-session.mjs')], {
    env: { ...process.env, LH_BASE_URL: BASE },
    encoding: 'utf8',
  }).trim();
}

/**
 * Reconstruct the RSC flight stream from the `self.__next_f.push` calls.
 *
 * Each push carries a JS string literal; `JSON.parse` on the literal is what
 * un-escapes it correctly (`\"`, `\\`, `\u….`). Concatenating the parsed chunks
 * gives back the byte stream React wrote, which is where the dehydrated cache
 * lives as ordinary JSON.
 */
export function flightPayload(html) {
  const chunks = [];
  const re = /self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      chunks.push(JSON.parse(m[1]));
    } catch {
      // A chunk we cannot parse is not a seed we can judge — skip it rather
      // than abort, so one odd frame does not hide every real result.
    }
  }
  return chunks.join('');
}

/**
 * Every balanced `{…}` in `text` that directly owns a `queryKey` property.
 *
 * One forward pass, string-aware: `{`/`}` inside a JSON string never move the
 * depth, which is what makes this safe against product titles containing
 * braces. `stack` holds the start index of each open object, so when a
 * `"queryKey":` is seen the enclosing object is `stack[stack.length - 1]` — and
 * when THAT object closes, the slice between the two is valid JSON.
 */
export function dehydratedQueries(text) {
  const found = [];
  const stack = [];
  const interesting = new Set();
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      if (stack.length && text.startsWith('"queryKey":', i)) interesting.add(stack[stack.length - 1]);
      inStr = true;
      continue;
    }
    if (c === '{') stack.push(i);
    else if (c === '}') {
      const start = stack.pop();
      if (interesting.delete(start)) {
        try {
          found.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          // Not a dehydrated query after all (or split across a boundary we
          // could not rejoin) — a missing entry fails loudly downstream.
        }
      }
    }
  }
  return found;
}

const keyMatches = (key, prefix) =>
  Array.isArray(key) &&
  key.length >= prefix.length &&
  prefix.every((part, i) => JSON.stringify(key[i]) === JSON.stringify(part));

/** Rows a dehydrated payload carries: a list's length, else presence as 1/0. */
function rowCount(data) {
  if (Array.isArray(data)) return data.length;
  if (data == null) return 0;
  if (typeof data === 'object') {
    // A wrapper the seed filled — count the first array field it holds so a
    // `{ lines: [...] }` envelope reports rows instead of a flat 1.
    for (const v of Object.values(data)) if (Array.isArray(v)) return v.length;
    return 1;
  }
  return 1;
}

async function observeRoute(entry, cookie) {
  const res = await fetch(`${BASE}${entry.route}`, {
    headers: { Cookie: cookie },
    redirect: 'follow',
  });
  const html = await res.text();
  const landedAt = new URL(res.url).pathname;
  const queries = dehydratedQueries(flightPayload(html));
  const seeds = entry.seeds.map((seed) => {
    const hit = queries.find((q) => keyMatches(q.queryKey, seed.keyPrefix));
    return {
      label: seed.label,
      keyPrefix: seed.keyPrefix,
      found: Boolean(hit),
      observedKey: hit?.queryKey ?? null,
      rows: hit ? rowCount(hit.state?.data) : 0,
    };
  });
  return {
    route: entry.route,
    module: entry.module,
    status: res.status,
    landedAt,
    htmlKb: Math.round(html.length / 1024),
    seeds,
  };
}

function checkBudget(results, budget) {
  let failed = false;
  const tolerance = budget.tolerance ?? 2;
  for (const r of results) {
    // Landing somewhere else means the seed under test never ran. Same lesson as
    // `lighthouse-audit.mjs`: an unmeasured route is a failure, not a skip.
    if (r.landedAt !== r.route) {
      console.error(`UNMEASURED ${r.route}: served ${r.landedAt} (session expired, or the route moved).`);
      failed = true;
      continue;
    }
    const b = budget.routes?.[r.route];
    if (!b) {
      console.error(`NO FLOOR ${r.route} — run \`npm run perf:seeds:update\` to pin one.`);
      failed = true;
      continue;
    }
    for (const seed of r.seeds) {
      const pinned = b.seeds?.find((x) => x.label === seed.label);
      if (!seed.found) {
        console.error(
          `SEED MISSING ${r.route} · ${seed.label}: no dehydrated query under ` +
            `${JSON.stringify(seed.keyPrefix)} in the first HTML. The seed soft-failed ` +
            `(${r.module}) — the page still renders, it just fetches after hydration again.`,
        );
        failed = true;
        continue;
      }
      const min = pinned?.minRows ?? 1;
      if (seed.rows < min - tolerance) {
        console.error(
          `SEED THIN ${r.route} · ${seed.label}: ${seed.rows} rows < floor ${min} ` +
            `(tolerance ${tolerance}).`,
        );
        failed = true;
      }
    }
  }
  if (failed) process.exit(1);
  console.log('Seed floors OK.');
}

function writeBudget(results) {
  const existing = fs.existsSync(budgetPath)
    ? JSON.parse(fs.readFileSync(budgetPath, 'utf8'))
    : { tolerance: 2, routes: {} };
  for (const r of results) {
    if (r.landedAt !== r.route) {
      console.error(`SKIPPED ${r.route} — served ${r.landedAt}, not itself.`);
      continue;
    }
    existing.routes[r.route] = {
      module: r.module,
      seeds: r.seeds.map((s) => ({
        label: s.label,
        keyPrefix: s.keyPrefix,
        // The key as it actually appeared. The prefix above is what MATCHES;
        // this is what a reviewer diffs when a product change moves a segment.
        observedKey: s.observedKey,
        minRows: s.rows,
      })),
      updatedAt: new Date().toISOString(),
    };
  }
  fs.writeFileSync(budgetPath, JSON.stringify(existing, null, 2) + '\n');
  console.log(`Wrote ${budgetPath}`);
}

async function main() {
  const entries = only ? SEEDED_ROUTES.filter((r) => r.route === only) : SEEDED_ROUTES;
  if (entries.length === 0) {
    console.error(`No seeded route matches --route ${only}.`);
    process.exit(1);
  }
  const cookie = sessionCookie();
  const results = [];
  for (const entry of entries) {
    const r = await observeRoute(entry, cookie);
    results.push(r);
    for (const s of r.seeds) {
      const mark = s.found ? `${String(s.rows).padStart(4)} rows` : '   MISSING';
      console.log(`${mark}  ${r.route.padEnd(18)} ${s.label}`);
    }
  }
  if (report) return;
  if (update) return writeBudget(results);
  const budget = fs.existsSync(budgetPath)
    ? JSON.parse(fs.readFileSync(budgetPath, 'utf8'))
    : null;
  if (!budget) {
    console.error('No seed-budget.json — run `npm run perf:seeds:update` first.');
    process.exit(1);
  }
  checkBudget(results, budget);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(String(err?.stack ?? err));
    process.exit(1);
  });
}
