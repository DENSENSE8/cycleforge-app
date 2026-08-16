/**
 * Desktop host seam — the ONLY module in `src/` that names the Electron bridge.
 *
 * Cycle Forge is browser-first (`docs/todo/saas-commercialization-plan.md` §0).
 * The desktop shell (`electron/`) is an OPTIONAL station-PC host for the SAME
 * hosted app — N1–N5 in `docs/todo/electron-desktop-shell-PLAN.md`.
 *
 * Feature code must never read `window.cycleForgeDesktop` directly: one module
 * per concern, so the browser fallback can never drift per call site and a
 * capability check can never be re-derived with different semantics.
 *
 * Everything here is null/empty-safe in a plain browser, so a caller writes the
 * capability check once and gets the browser path for free.
 */

import {
  VENDOR_PARTITION_ZENDESK,
  VENDOR_VIEW_CHROME_PX,
  vendorPartitionForListingUrl,
  type VendorPartition,
} from '@/lib/desktop/vendor-partitions';
import {
  hideVendorViewMask,
  showVendorViewMask,
} from '@/lib/desktop/vendor-view-store';

/** An installed OS printer, as reported by the shell (`getPrintersAsync`). */
export interface DesktopPrinter {
  name: string;
  displayName: string;
  isDefault: boolean;
}

/**
 * Result of a silent print. `reason` carries the driver's message on failure.
 * Module-private on purpose — callers read `.success` / `.reason` structurally,
 * so exporting the name would be an export with no importer.
 */
interface DesktopPrintResult {
  success: boolean;
  reason?: string | null;
}

/** Module-private for the same reason as {@link DesktopPrintResult}. */
interface DesktopPrintOptions {
  /** OS printer name. Omitted → the system default printer. */
  deviceName?: string | null;
  copies?: number;
  landscape?: boolean;
  printBackground?: boolean;
  /** Settle time for in-page scripts (barcodes, web fonts) before printing. */
  waitMs?: number;
}

export type VendorViewBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface DesktopBridge {
  isDesktopHost: true;
  platform: string;
  printHtml: (html: string, options?: DesktopPrintOptions) => Promise<DesktopPrintResult>;
  listPrinters: () => Promise<DesktopPrinter[]>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  openVendorView: (payload: {
    partition: string;
    url: string;
    bounds?: VendorViewBounds;
  }) => Promise<{ success: boolean; error?: string }>;
  setVendorViewBounds: (
    bounds: VendorViewBounds,
  ) => Promise<{ success: boolean; error?: string }>;
  hideVendorView: () => Promise<{ success: boolean; error?: string }>;
  pingVendorView?: () => void;
  isVendorViewOpen: () => Promise<{ open: boolean; partition: string | null }>;
  onVendorViewHidden: (listener: () => void) => () => void;
}

function bridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as { cycleForgeDesktop?: DesktopBridge }).cycleForgeDesktop;
  return candidate?.isDesktopHost === true ? candidate : null;
}

/**
 * True only inside the Electron shell. Never assume desktop from user-agent —
 * the shell reports itself, so a Chromium UA string cannot be mistaken for one.
 */
export function isDesktopHost(): boolean {
  return bridge() !== null;
}

/**
 * Silently print fully-formed HTML to an OS/office printer — the one printing
 * job a browser genuinely cannot do (WebUSB / Web Serial already cover thermal
 * label printers dialog-free; see `@/lib/print/browserPrint`).
 *
 * Returns `null` when there is no desktop host, so the caller falls through to
 * its browser path instead of having to branch on a thrown error.
 */
export function desktopPrintHtml(
  html: string,
  options: DesktopPrintOptions = {},
): Promise<DesktopPrintResult> | null {
  const host = bridge();
  if (!host) return null;
  return host.printHtml(html, options).catch((err: unknown) => ({
    success: false,
    reason: err instanceof Error ? err.message : String(err),
  }));
}

/**
 * Installed OS printers, or `[]` in a browser — so Settings can offer real
 * device names instead of asking an operator to type one exactly.
 */
export async function listDesktopPrinters(): Promise<DesktopPrinter[]> {
  const host = bridge();
  if (!host) return [];
  try {
    return await host.listPrinters();
  } catch {
    return [];
  }
}

/** Open http(s) in the OS browser via the shell, or `window.open` in a browser. */
export async function desktopOpenExternal(url: string): Promise<boolean> {
  const host = bridge();
  if (host) {
    try {
      const res = await host.openExternal(url);
      return !!res?.success;
    } catch {
      return false;
    }
  }
  if (typeof window === 'undefined') return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

function defaultVendorBounds(): VendorViewBounds {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  return {
    x: 0,
    y: VENDOR_VIEW_CHROME_PX,
    width: Math.max(0, w),
    height: Math.max(0, h - VENDOR_VIEW_CHROME_PX),
  };
}

/**
 * Open a partitioned VendorView (N5). Shows the React mask first, then asks
 * Main to mount the WebContentsView. On failure the mask is cleared.
 *
 * Browser: returns `false` (caller should deep-link via {@link desktopOpenExternal}).
 */
export async function openDesktopVendorView(opts: {
  partition: VendorPartition;
  url: string;
  /** Operator-facing chrome title (capability label). */
  title: string;
  /**
   * Anchored rect (window/DIP coords) for a view the FEATURE frames — the Unbox
   * Listings dropdown inside the Displays column. Omitted → the full-window
   * takeover the helpdesk console uses.
   */
  bounds?: VendorViewBounds;
}): Promise<boolean> {
  const host = bridge();
  if (!host?.openVendorView) return false;

  const anchoredBounds = opts.bounds ?? null;
  showVendorViewMask({
    title: opts.title,
    url: opts.url,
    mode: anchoredBounds ? 'anchored' : 'takeover',
  });
  try {
    const res = await host.openVendorView({
      partition: opts.partition,
      url: opts.url,
      bounds: anchoredBounds ?? defaultVendorBounds(),
    });
    if (!res?.success) {
      hideVendorViewMask();
      return false;
    }
    return true;
  } catch {
    hideVendorViewMask();
    return false;
  }
}

/** Hide VendorView + clear the React mask. Safe in a browser (no-op). */
export async function hideDesktopVendorView(): Promise<void> {
  hideVendorViewMask();
  const host = bridge();
  if (!host?.hideVendorView) return;
  try {
    await host.hideVendorView();
  } catch {
    /* ignore */
  }
}

/**
 * Re-bound an already-open anchored view. Called from the owning slot's
 * ResizeObserver / scroll handler — a native view does not reflow with the DOM,
 * so a slot that moves and does not push is a view left floating over the wrong
 * pixels. Safe (no-op) in a browser and when nothing is open.
 */
export async function setDesktopVendorViewBounds(
  bounds: VendorViewBounds,
): Promise<void> {
  const host = bridge();
  if (!host?.setVendorViewBounds) return;
  try {
    await host.setVendorViewBounds(bounds);
  } catch {
    /* view closed under us */
  }
}

/**
 * Renew the anchored view's lease.
 *
 * Main drops the view when these stop arriving, so the owning slot MUST call
 * this on a timer for as long as it wants the view. That inverts the fragile
 * part of the contract: instead of a stranded view needing someone to remember
 * to dismiss it, a view survives only while something is actively asking for it.
 * Synchronous and unawaited — a heartbeat that can block is not a heartbeat.
 */
export function pingDesktopVendorView(): void {
  bridge()?.pingVendorView?.();
}

/**
 * Open a marketplace listing INSIDE an anchored slot (Unbox Listings display).
 *
 * Returns `false` when there is no desktop host **or** no vendor session covers
 * that URL's host — the caller then keeps its deep link. It never falls back to
 * `openExternal` itself: an anchored dropdown silently becoming an OS browser
 * tab is a different action than the one the operator asked for.
 */
export async function openListingVendorView(opts: {
  url: string;
  title: string;
  bounds: VendorViewBounds;
}): Promise<boolean> {
  if (!isDesktopHost()) return false;
  const partition = vendorPartitionForListingUrl(opts.url);
  if (!partition) return false;
  return openDesktopVendorView({
    partition,
    url: opts.url,
    title: opts.title,
    bounds: opts.bounds,
  });
}

/**
 * Can this listing URL open as an embedded vendor view here? Drives whether the
 * Listings display offers the dropdown at all — an offer that cannot be honored
 * is worse than the honest deep link.
 */
export function canEmbedListingUrl(url: string): boolean {
  return isDesktopHost() && vendorPartitionForListingUrl(url) !== null;
}

/** Subscribe to Main-driven dismiss (Esc inside vendor console / Ctrl+]). */
export function onDesktopVendorViewHidden(listener: () => void): () => void {
  const host = bridge();
  if (!host?.onVendorViewHidden) return () => {};
  return host.onVendorViewHidden(() => {
    hideVendorViewMask();
    listener();
  });
}

/**
 * Open a helpdesk Agent ticket: VendorView on desktop, OS/browser tab otherwise.
 * Prefer this over raw `<a target=_blank>` on ticket chrome.
 */
export async function openHelpdeskTicketUrl(
  url: string,
  opts?: { title?: string },
): Promise<void> {
  const title = opts?.title?.trim() || 'Helpdesk';
  if (isDesktopHost()) {
    const ok = await openDesktopVendorView({
      partition: VENDOR_PARTITION_ZENDESK,
      url,
      title,
    });
    if (ok) return;
  }
  await desktopOpenExternal(url);
}

export { VENDOR_PARTITION_ZENDESK, VENDOR_VIEW_CHROME_PX };
