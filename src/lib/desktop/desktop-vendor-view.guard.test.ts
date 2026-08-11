/**
 * Guard — Station desktop VendorView waist.
 *
 * - Feature code never reads `window.cycleForgeDesktop` (only desktop-host.ts).
 * - No executeJavaScript / ticket-macro IPC channel.
 * - Legacy <webview> tag stays off; N5 uses WebContentsView via vendor-view.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');
const SRC = join(ROOT, 'src');
const ELECTRON = join(ROOT, 'electron');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) out.push(p);
  }
  return out;
}

describe('desktop VendorView waist', () => {
  it('only desktop-host.ts names cycleForgeDesktop in src/', () => {
    const files = walk(SRC);
    const hits: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (rel === 'src/lib/desktop/desktop-host.ts') continue;
      if (rel.endsWith('.guard.test.ts') || rel.endsWith('.test.ts')) continue;
      const text = readFileSync(file, 'utf8');
      if (text.includes('cycleForgeDesktop')) hits.push(rel);
    }
    assert.deepEqual(
      hits,
      [],
      `feature code must not read window.cycleForgeDesktop:\n${hits.join('\n')}`,
    );
  });

  it('electron bridge has no executeJavaScript / ticket-macro IPC', () => {
    const main = readFileSync(join(ELECTRON, 'main.js'), 'utf8');
    const preload = readFileSync(join(ELECTRON, 'preload.js'), 'utf8');
    const vendor = readFileSync(join(ELECTRON, 'vendor-view.js'), 'utf8');

    // Print N1 stubs window.print via executeJavaScript — that is allowed.
    // VendorView + preload must never expose or call it for DOM macros.
    assert.equal(
      /\.executeJavaScript\s*\(/.test(vendor),
      false,
      'vendor-view must not call executeJavaScript',
    );
    assert.equal(
      /\.executeJavaScript\s*\(/.test(preload),
      false,
      'preload must not call executeJavaScript',
    );
    assert.equal(
      /ticket-macro|cf:ticket-macro/.test(`${main}\n${preload}\n${vendor}`),
      false,
      'ticket-macro IPC channel must not exist',
    );
    assert.match(vendor, /WebContentsView/);
    assert.match(vendor, /persist:zendesk/);
    assert.match(preload, /openVendorView/);
    assert.match(main, /registerVendorViewHandlers/);
  });

  it('webviewTag stays false (legacy tag banned)', () => {
    const main = readFileSync(join(ELECTRON, 'main.js'), 'utf8');
    assert.match(main, /webviewTag:\s*false/);
    assert.match(main, /will-attach-webview/);
  });

  it('marketplace listing partition is host-allowlisted in Main', () => {
    const vendor = readFileSync(join(ELECTRON, 'vendor-view.js'), 'utf8');
    // Main is the security boundary: a partition the renderer can name must be
    // pinned to real host suffixes here, or a signed-in vendor session could be
    // pointed at an arbitrary URL.
    assert.match(vendor, /'persist:ebay':\s*\[/);
    assert.match(vendor, /\.ebay\.com/);
  });

  it('an anchored view is not re-slammed to full-window on resize', () => {
    const vendor = readFileSync(join(ELECTRON, 'vendor-view.js'), 'utf8');
    // The renderer owns an anchored rect (Listings dropdown). Without this the
    // window resize handler would stretch it back over the whole carton.
    assert.match(vendor, /if \(anchored\) return;/);
  });

  it('VendorView never takes the Displays toggle chord app-wide', () => {
    const vendor = readFileSync(join(ELECTRON, 'vendor-view.js'), 'utf8');
    // A globalShortcut on ⌘] steals it from `displays-toggle-hotkey.ts`, the SoT
    // owner of the Station Displays toggle: Main killed the native view and the
    // renderer never heard the key, so the rail stayed open around a dead panel.
    // Dismissal is scoped to the vendor view's own focus instead.
    // Match the API, not the word — the docblock above `isDismissChord`
    // explains why this is banned and must stay readable.
    assert.equal(
      /globalShortcut\s*\.|globalShortcut\s*[,}]/.test(vendor),
      false,
      'vendor-view must not use globalShortcut (it would steal ⌘] from the Displays toggle)',
    );
    assert.match(vendor, /before-input-event/);
    assert.match(vendor, /function isDismissChord/);
  });

  it('the Listings dropdown collapses when the shell dismisses the view', () => {
    const panel = readFileSync(
      join(SRC, 'components/receiving/workspace/line-edit/ListingVendorViewPanel.tsx'),
      'utf8',
    );
    // Esc / ⌘] inside the page, window close, and a helpdesk takeover all drop
    // our view without passing through React. The store is the truth for
    // "is my view still up", or the panel outlives the thing it is framing.
    assert.match(panel, /subscribeVendorViewMask/);
    assert.match(panel, /mode === 'anchored'/);
  });

  it('an anchored view is a LEASE — Main drops it when heartbeats stop', () => {
    const vendor = readFileSync(join(ELECTRON, 'vendor-view.js'), 'utf8');
    const preload = readFileSync(join(ELECTRON, 'preload.js'), 'utf8');
    const panel = readFileSync(
      join(SRC, 'components/receiving/workspace/line-edit/ListingVendorViewPanel.tsx'),
      'utf8',
    );
    // Every other defence reacts to a signal. A crashed render / discarded
    // hot-reload module emits none, and a native view has no DOM parent — which
    // is how a listing got stranded over the app with no control to dismiss it.
    // Absence of a heartbeat is the one signal that survives all of those.
    assert.match(vendor, /cf:vendor-view-keepalive/);
    assert.match(vendor, /startKeepaliveWatchdog/);
    assert.match(preload, /pingVendorView/);
    // The renewal must be on a timer the component owns, so it dies with it.
    assert.match(panel, /setInterval\(pingDesktopVendorView/);
    // …and a blurred window must NOT be read as a dead one (Chromium throttles
    // background renderer timers), or alt-tabbing would kill a healthy view.
    assert.match(vendor, /isFocused\(\)/);
  });

  it('the Listings dropdown reaches the shell only through desktop-host', () => {
    const panel = readFileSync(
      join(SRC, 'components/receiving/workspace/line-edit/ListingVendorViewPanel.tsx'),
      'utf8',
    );
    assert.match(panel, /from '@\/lib\/desktop\/desktop-host'/);
    // A native view has no parent to unmount it — leaving the leaf must hide it.
    assert.match(panel, /hideDesktopVendorView/);
    // It must not pick a partition itself; that mapping has one home.
    assert.equal(
      /persist:/.test(panel),
      false,
      'ListingVendorViewPanel must not name a partition (vendor-partitions.ts owns that map)',
    );
  });

  it('desktop-host exposes openHelpdeskTicketUrl + hideDesktopVendorView', () => {
    const host = readFileSync(join(SRC, 'lib/desktop/desktop-host.ts'), 'utf8');
    assert.match(host, /export async function openHelpdeskTicketUrl/);
    assert.match(host, /export async function hideDesktopVendorView/);
    assert.match(host, /export async function openDesktopVendorView/);
    assert.match(host, /VENDOR_PARTITION_ZENDESK/);
  });
});
