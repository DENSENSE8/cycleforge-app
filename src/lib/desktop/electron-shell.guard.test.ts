/**
 * Guard — the desktop shell's security posture and its surviving hard bans.
 *
 * `docs/todo/electron-desktop-shell-PLAN.md` states these as laws, and a plan
 * file cannot fail (`.claude/rules/pattern-evolution.md` → Always #6). The two
 * that matter most are one word each — `webviewTag` and `sandbox` — so a change
 * could flip either while every doc still claimed otherwise.
 *
 * SCOPE NOTE (2026-08-10 evening): N5 VendorView superseded the blanket
 * vendor-embed ban, so this guard does NOT assert "no WebContentsView" — that
 * would pin a rule the plan has since retired. What it still pins is everything
 * N5 explicitly kept: the legacy `<webview>` TAG stays off, the renderer stays
 * sandboxed, and the bridge stays a named allowlist rather than a macro channel.
 *
 * The shell is plain CommonJS outside tsconfig/knip's globs, so this reads it
 * off disk as text rather than importing it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const electronDir = new URL('../../../electron/', import.meta.url);

/** Strip block + line comments so a rule is never "satisfied" by prose about it. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const read = (rel: string) => readFileSync(new URL(rel, electronDir), 'utf8');

const mainCode = code(read('main.js'));
const preloadCode = code(read('preload.js'));
const devCode = code(
  readFileSync(new URL('../../../scripts/electron-dev.mjs', import.meta.url), 'utf8'),
);

/** Every main-process file — handlers may live in a sibling module (vendor-view.js). */
const shellCode = readdirSync(electronDir)
  .filter((f) => f.endsWith('.js') && f !== 'preload.js')
  .map((f) => code(read(f)))
  .join('\n');

describe('Electron shell — hardened window', () => {
  it('runs the renderer sandboxed, isolated, and without Node', () => {
    assert.match(mainCode, /sandbox:\s*true/);
    assert.match(mainCode, /contextIsolation:\s*true/);
    assert.match(mainCode, /nodeIntegration:\s*false/);
    // A sandboxed preload still gets ipcRenderer — `sandbox: false` buys nothing
    // and costs the renderer's isolation.
    assert.doesNotMatch(shellCode, /sandbox:\s*false/);
    assert.doesNotMatch(shellCode, /nodeIntegration:\s*true/);
  });

  it('the hidden print window is sandboxed too', () => {
    // It renders operator-supplied label HTML, so it is the one window most
    // worth keeping powerless.
    const printWindow = mainCode.slice(mainCode.indexOf('cf:print-html'));
    assert.match(printWindow, /sandbox:\s*true/);
    assert.match(printWindow, /nodeIntegration:\s*false/);
  });

  it('reserves a native title bar instead of overlaying the app header', () => {
    // `hiddenInset` puts the macOS traffic lights ON the web content, exactly
    // where GlobalHeader's nav cluster (toggle · Pins · Recents) lives — two
    // controls in one place. A frameless window would need the shell to inject
    // padding into the hosted app, i.e. the desktop build silently rendering a
    // different layout from the browser build.
    assert.match(mainCode, /titleBarStyle:\s*'default'/);
    assert.doesNotMatch(mainCode, /hiddenInset/);
  });

  it('names the PRODUCT in chrome, never the tenant', () => {
    // Electron adopts the page's <title>, and this app's metadata is
    // `{page} · {org}` when signed in — so the bar read "USAV Solutions", the
    // dogfood tenant. The org is content; the shell is product chrome.
    assert.match(mainCode, /title:\s*'Cycle Forge'/);
    assert.match(mainCode, /page-title-updated/);
    assert.match(mainCode, /preventDefault/);
    // Packaged builds take productName from electron-builder; `electron .` in
    // dev falls back to package.json `name`, which rendered as "Electron".
    assert.match(mainCode, /app\.setName\('Cycle Forge'\)/);
  });
});

describe('Electron shell — the legacy <webview> tag stays banned', () => {
  it('never enables the webview tag and refuses attachment', () => {
    // N5 VendorView uses the WebContentsView API. The <webview> TAG — which is
    // what the legacy USAV shell enabled — remains off.
    assert.match(mainCode, /webviewTag:\s*false/);
    assert.doesNotMatch(shellCode, /webviewTag:\s*true/);
    // Defence in depth — the ban should not rest on one flag.
    assert.match(mainCode, /will-attach-webview/);
  });

  it('never reaches for the deprecated BrowserView', () => {
    assert.doesNotMatch(shellCode, /\bBrowserView\b/);
  });

  it('sends out-of-allowlist navigation to the OS browser', () => {
    // This is what keeps an ordinary deep link landing in the operator's real,
    // signed-in browser rather than somewhere inside the shell.
    assert.match(mainCode, /will-navigate/);
    assert.match(mainCode, /setWindowOpenHandler/);
    assert.match(mainCode, /shell\.openExternal/);
  });
});

describe('Electron shell — deleted legacy subsystems stay deleted', () => {
  it('ships no local HTTP sidecar', () => {
    for (const banned of [/express/i, /startSidecar/, /require\(['"]\.\.\/server/]) {
      assert.doesNotMatch(shellCode, banned);
    }
  });

  it('never shells out to print a file path', () => {
    // The legacy `printer.js` interpolated a renderer-supplied path into `lp` /
    // PowerShell. The repo prints HTML and raw device bytes, never a path.
    for (const banned of [/child_process/, /\bexec\(/, /powershell/i]) {
      assert.doesNotMatch(shellCode, banned);
    }
  });
});

describe('Electron shell — preload is a narrow bridge', () => {
  it('exposes exactly one global', () => {
    const exposed = preloadCode.match(/exposeInMainWorld\(/g) ?? [];
    assert.equal(exposed.length, 1, 'exactly one bridge global');
    assert.match(preloadCode, /exposeInMainWorld\(\s*['"]cycleForgeDesktop['"]/);
  });

  it('offers no generic invoke and no script-execution macro', () => {
    // A pass-through `invoke(channel, …)` would hand the renderer every IPC
    // channel and make the allowlist below meaningless. A JS-execution channel
    // would turn the bridge into a DOM-scrape macro engine, which the plan bans
    // even for VendorView (CF-owned mutations go through REST facades).
    assert.doesNotMatch(preloadCode, /\binvoke:\s*\(/);
    assert.doesNotMatch(preloadCode, /ipcRenderer\.invoke\(\s*channel/);
    assert.doesNotMatch(preloadCode, /executeJavaScript/);
  });

  it('only invokes channels the main process actually registers', () => {
    const invoked = [...preloadCode.matchAll(/ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g)].map(
      (m) => m[1],
    );
    assert.ok(invoked.length > 0, 'bridge invokes at least one channel');
    for (const channel of invoked) {
      assert.ok(
        shellCode.includes(`ipcMain.handle('${channel}'`),
        `preload invokes ${channel} but no main-process file handles it`,
      );
    }
  });

  it('exposes no filesystem or module access', () => {
    for (const banned of [/readFile/, /writeFile/, /['"]fs['"]/, /require:\s/, /process\.env/]) {
      assert.doesNotMatch(preloadCode, banned);
    }
  });
});

describe('Electron shell — legacy Intel macOS target', () => {
  const legacyYml = readFileSync(
    new URL('../../../electron-builder.mac-intel-legacy.yml', import.meta.url),
    'utf8',
  );

  it('pins an Electron line that still runs on macOS 10.13–10.15', () => {
    // Electron 41 floors at macOS 11, stranding 2012–2015 Intel Macs.
    assert.match(legacyYml, /electronVersion:\s*22\./);
    assert.match(legacyYml, /minimumSystemVersion:\s*'10\.13\.0'/);
  });

  it('never publishes to the auto-update feed', () => {
    // The feed carries current-Electron builds that cannot launch on macOS 10.x.
    // Publishing here would hand the oldest bench an update that bricks it.
    assert.doesNotMatch(code(legacyYml), /^\s*publish:/m);
    // zip exists only to feed electron-updater — a legacy target that must not
    // self-update has no use for one.
    assert.doesNotMatch(code(legacyYml), /target:\s*zip/);
  });

  it('the shell refuses to self-update on that Electron line', () => {
    // Runtime major, not a build-time flag, so packaging from the wrong config
    // cannot lose the guard.
    assert.match(mainCode, /process\.versions\.electron/);
    assert.match(mainCode, /electronMajor\s*<\s*23/);
  });

  it('degrades VendorView instead of throwing where WebContentsView is absent', () => {
    // WebContentsView landed in Electron 30; `new undefined()` would throw.
    assert.match(shellCode, /typeof WebContentsView !== 'function'/);
  });
});

describe('Electron shell — deploy pickup (build watch)', () => {
  const watch = code(read('build-watch.js'));

  it('never reloads out from under a working operator', () => {
    // An unprompted reload at a bench destroys in-flight work — a half-typed
    // serial, an unsaved note. OS idle time is the one signal that says nobody
    // is mid-carton, so a stale build alone must never be sufficient.
    assert.match(watch, /powerMonitor\.getSystemIdleTime\(\)\s*>=\s*IDLE_SECONDS_BEFORE_RELOAD/);
    assert.match(watch, /IDLE_SECONDS_BEFORE_RELOAD\s*=\s*300/);
  });

  it('will not orphan an open VendorView', () => {
    // The view is attached to the window's contentView, so it survives a
    // renderer reload while its React mask does not.
    assert.match(watch, /isVendorViewOpen/);
  });

  it('reports unknown rather than changed when it cannot tell', () => {
    // A false positive reloads a working bench for nothing, so every failure
    // path — bad response, no chunks, thrown fetch — must return null.
    assert.match(watch, /if \(!res\.ok\) return null/);
    assert.match(watch, /if \(srcs\.length === 0\) return null/);
    assert.match(watch, /catch \{\s*return null;\s*\}/);
  });

  it('degrades on the legacy Electron line instead of throwing', () => {
    // Electron 22 ships Node 16 — no global fetch.
    assert.match(watch, /typeof fetch !== 'function'/);
  });

  it('busts the disk cache on reload', () => {
    // main.js configures a 256 MB disk cache; a plain reload could re-serve the
    // very HTML whose chunk URLs just went stale.
    assert.match(watch, /reloadIgnoringCache/);
  });

  it('stays off in dev, where HMR moves chunks without a deploy', () => {
    assert.match(mainCode, /if \(!isDev\) \{\s*startBuildWatch/);
  });
});

describe('Electron shell — renderer seam', () => {
  it('is named in exactly one place under src/', () => {
    // Feature code must go through src/lib/desktop/desktop-host.ts, so the
    // browser fallback cannot drift per call site.
    const seam = readFileSync(new URL('./desktop-host.ts', import.meta.url), 'utf8');
    assert.match(seam, /cycleForgeDesktop/);
  });
});

describe('Electron dev harness — attach, never spawn', () => {
  it('does not start a dev server', () => {
    // .claude/rules/workflow-safety.md: the user owns the dev server. The legacy
    // harness spawned `npm run dev` itself — exactly what that rule forbids.
    assert.doesNotMatch(devCode, /['"]dev['"]/);
    assert.doesNotMatch(devCode, /next\s+dev/);
    const spawns = devCode.match(/spawn\(/g) ?? [];
    assert.equal(spawns.length, 1, 'spawns only the electron child');
    assert.match(devCode, /electron/);
  });

  it('targets the repo dev port and exits when nothing is listening', () => {
    assert.match(devCode, /3050/);
    assert.match(devCode, /process\.exit\(1\)/);
  });
});
