/**
 * Pick up new deployments without an installer release.
 *
 * THE PROBLEM. The shell loads the hosted app, so a deploy reaches it for free —
 * but only on the next load. A bench PC that stays open for days is still running
 * the client bundle it booted with, and once a deploy rotates the content-hashed
 * chunk filenames, the old URLs 404. The operator gets a chunk-load error
 * mid-scan. A browser hides this because people close tabs; a station shell that
 * never closes does not.
 *
 * THE FINGERPRINT. We poll the start URL and hash the set of
 * `/_next/static/chunks/*.js` sources in the HTML. Those names are content
 * hashes, so the fingerprint changes exactly when the CLIENT bundle changes —
 * and notably NOT on a server-only deploy, which needs no reload because server
 * code is already live. No API route, no auth, no app-side surface.
 *
 * WHEN WE RELOAD — and why not immediately. An unprompted reload at a scan bench
 * can destroy in-flight work: a half-typed serial, an unsaved note. So a stale
 * fingerprint alone is never enough. We wait for the OS to report the operator
 * genuinely idle (`powerMonitor.getSystemIdleTime`), which is the one signal that
 * says "nobody is mid-carton". Lunch, a shift change, or overnight all qualify;
 * an operator working through a deploy is left alone and keeps the bundle they
 * started with.
 *
 * KNOWN GAP, stated rather than hidden: an operator who works continuously across
 * a deploy can still hit a stale chunk before the bench ever goes idle. Closing
 * that needs a renderer-side chunk-error handler, which is an app-wide change
 * (it would affect every browser tab too), not a shell change.
 */

const crypto = require('node:crypto');
const { powerMonitor } = require('electron');

/** How often to ask the server what it is serving. */
const POLL_INTERVAL_MS = 5 * 60_000;

/**
 * How long the operator must be idle before a background reload is allowed.
 * Five minutes is deliberately generous: a bench can sit untouched for two
 * minutes while someone wrestles a box with a serial half-typed on screen.
 */
const IDLE_SECONDS_BEFORE_RELOAD = 300;

let timer = null;
let baseline = null;

/**
 * Hash the client chunk set served at `url`, or null when we cannot tell.
 *
 * Null is load-bearing: the dev server emits no content-hashed chunks, and a
 * network blip returns nothing. In both cases we must report "unknown" rather
 * than "changed" — a false positive here reloads a working bench for no reason.
 */
function fingerprintFromHtml(html) {
  const srcs = [...String(html).matchAll(/\/_next\/static\/chunks\/[^"'\s>]+\.js/g)].map((m) => m[0]);
  if (srcs.length === 0) return null;
  // Sort + dedupe so attribute order or a repeated preload cannot make an
  // unchanged deployment look new.
  const stable = [...new Set(srcs)].sort().join('|');
  return crypto.createHash('sha1').update(stable).digest('hex');
}

async function fetchClientFingerprint(url) {
  // Electron 22 (the legacy Intel macOS target) ships Node 16, which has no
  // global fetch. Feature-detect instead of crashing the oldest bench.
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    if (!res.ok) return null;
    return fingerprintFromHtml(await res.text());
  } catch {
    return null;
  }
}

/** True only when a reload cannot interrupt or orphan anything. */
function safeToReload(win, isVendorViewOpen) {
  if (!win || win.isDestroyed()) return false;

  // A VendorView is attached to the window's contentView, so it SURVIVES a
  // renderer reload — the React mask behind it would not, leaving an overlay
  // the operator cannot dismiss.
  try {
    if (isVendorViewOpen?.()?.open) return false;
  } catch {
    /* treat an unreadable vendor state as unsafe */
  }

  // Only reload a real page. On the offline fallback (a data: URL) a reload
  // would just re-render the error; the caller re-navigates instead.
  const current = win.webContents.getURL();
  if (!current.startsWith('http')) return false;

  return powerMonitor.getSystemIdleTime() >= IDLE_SECONDS_BEFORE_RELOAD;
}

/**
 * Start watching. Safe to call repeatedly — only one timer ever runs.
 *
 * @param {object} opts
 * @param {() => import('electron').BrowserWindow | null} opts.getWindow
 * @param {string} opts.startUrl
 * @param {() => { open: boolean } | undefined} [opts.isVendorViewOpen]
 * @param {{ info: Function, error: Function }} opts.log
 */
function startBuildWatch({ getWindow, startUrl, isVendorViewOpen, log }) {
  stopBuildWatch();
  if (typeof fetch !== 'function') {
    log.info('[build-watch] disabled — this Electron build has no global fetch');
    return;
  }

  const tick = async () => {
    const fingerprint = await fetchClientFingerprint(startUrl);
    if (!fingerprint) return;

    if (baseline === null) {
      baseline = fingerprint;
      log.info(`[build-watch] tracking client build ${fingerprint.slice(0, 8)}`);
      return;
    }
    if (fingerprint === baseline) return;

    const win = getWindow();
    if (!safeToReload(win, isVendorViewOpen)) return;

    log.info(
      `[build-watch] client build ${baseline.slice(0, 8)} → ${fingerprint.slice(0, 8)}; ` +
        `bench idle ${powerMonitor.getSystemIdleTime()}s — reloading`,
    );
    baseline = fingerprint;
    // Ignore cache so the new HTML (and its new chunk URLs) is actually fetched
    // rather than served from the 256 MB disk cache main.js configures.
    win.webContents.reloadIgnoringCache();
  };

  timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  void tick(); // capture the baseline now rather than one interval late
}

function stopBuildWatch() {
  if (timer) clearInterval(timer);
  timer = null;
  baseline = null;
}

module.exports = {
  startBuildWatch,
  stopBuildWatch,
  // Pure half, split out so the regex that decides "is this a new deployment"
  // is testable against real served HTML instead of taken on faith.
  fingerprintFromHtml,
  IDLE_SECONDS_BEFORE_RELOAD,
  POLL_INTERVAL_MS,
};
