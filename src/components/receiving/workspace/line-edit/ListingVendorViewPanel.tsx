'use client';

/**
 * Unbox Listings — embedded marketplace browser (N5 VendorView, Phase 1).
 *
 * Desktop shell only. A combo box at the top picks which listing link is live;
 * the panel below is an ANCHORED slot the native `WebContentsView` covers,
 * bounded to the Displays column so the carton stays workable beside it.
 *
 * The native view is an OS-level layer with no DOM presence: it does not clip,
 * scroll, or stack with React. Everything unusual here follows from that —
 * the slot is measured and pushed on every resize/scroll, and the view is
 * dropped the moment the slot leaves the viewport rather than left floating
 * over whatever scrolled into its place.
 *
 * Browser (and any host with no vendor session for the URL): renders nothing —
 * `ListingLinksTab` keeps the deep-link face. Honest absence, never a dead
 * "open here" affordance.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, ExternalLink, RefreshCw, X } from '@/components/Icons';
import { SearchableSelectField, InlineNotice } from '@/design-system/components';
import { SearchBar } from '@/components/ui/SearchBar';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  canEmbedListingUrl,
  hideDesktopVendorView,
  openListingVendorView,
  pingDesktopVendorView,
  setDesktopVendorViewBounds,
  type VendorViewBounds,
} from '@/lib/desktop/desktop-host';
import {
  getVendorViewMaskState,
  subscribeVendorViewMask,
} from '@/lib/desktop/vendor-view-store';
import type { CartonListingLink } from '@/lib/receiving/listing-links';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * Sentinel option — picking it swaps the combo row for the URL editor instead of
 * selecting a link. The manual override used to live in a band UNDER the embed,
 * which cost the viewport the height it was there to provide; a listing browser
 * that only gets the leftovers is not a listing browser.
 */
const EDIT_LINK_OPTION = '__edit-listing-link__';

function hostOf(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return href;
  }
}

/**
 * Slot rect in window/DIP coords, clamped to the viewport.
 *
 * Returns `null` when the slot is off-screen or collapsed — the caller drops
 * the view instead of drawing it somewhere the operator did not put it.
 */
function measureSlot(el: HTMLElement | null): VendorViewBounds | null {
  if (!el || typeof window === 'undefined') return null;
  const r = el.getBoundingClientRect();
  const top = Math.max(0, r.top);
  const left = Math.max(0, r.left);
  const bottom = Math.min(window.innerHeight, r.bottom);
  const right = Math.min(window.innerWidth, r.right);
  const width = right - left;
  const height = bottom - top;
  if (width < 2 || height < 2) return null;
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function ListingVendorViewPanel({
  links,
  listingLink,
  setListingLink,
  onOpenChange,
  className,
}: {
  links: CartonListingLink[];
  /** Manual override URL — edited from the combo row, never a band below. */
  listingLink: string;
  setListingLink: (v: string) => void;
  /** Lets the host drop its own link chrome while the viewport owns the leaf. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const embeddable = useMemo(
    () => links.filter((l) => l.href && canEmbedListingUrl(l.href)),
    [links],
  );

  const [activeHref, setActiveHref] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const slotRef = useRef<HTMLDivElement | null>(null);
  /** Whether Main currently holds a view for us — not React state: the sync
   *  callback reads it every scroll frame and must not re-render to do so. */
  const mountedRef = useRef(false);
  const loadedUrlRef = useRef<string | null>(null);

  const open = activeHref !== null;

  // A carton swap can drop the link we were showing.
  useEffect(() => {
    if (activeHref && !embeddable.some((l) => l.href === activeHref)) {
      setActiveHref(null);
    }
  }, [embeddable, activeHref]);

  /**
   * The shell owns exactly ONE vendor view, so this panel cannot assume the view
   * it opened is still the one on screen. Main dismisses it on Esc / ⌘] inside
   * the page and on window close, and a helpdesk takeover replaces it outright —
   * none of which pass through React. Without this the combo row would keep
   * showing an open listing (and a "Opening…" slot) over a view that is gone,
   * which is the panel "not unmounting" from the operator's side.
   *
   * The store is therefore the truth for *is my view still up*, and it is only
   * ours while it is open, anchored, and pointed at our URL.
   */
  const vendorState = useSyncExternalStore(
    subscribeVendorViewMask,
    getVendorViewMaskState,
    getVendorViewMaskState,
  );
  const viewIsOurs =
    vendorState.open && vendorState.mode === 'anchored' && vendorState.url === activeHref;

  useEffect(() => {
    // `mountedRef` is the load-bearing half: between the pick and the store
    // update we legitimately have an href with no view yet, and collapsing there
    // would cancel the operator's own selection on the frame they made it.
    if (activeHref && mountedRef.current && !viewIsOurs) {
      mountedRef.current = false;
      loadedUrlRef.current = null;
      setActiveHref(null);
    }
  }, [activeHref, viewIsOurs]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const sync = useCallback(() => {
    const url = activeHref;
    if (!url) return;
    const bounds = measureSlot(slotRef.current);
    if (!bounds) {
      if (mountedRef.current) {
        mountedRef.current = false;
        loadedUrlRef.current = null;
        void hideDesktopVendorView();
      }
      return;
    }
    if (mountedRef.current && loadedUrlRef.current === url) {
      void setDesktopVendorViewBounds(bounds);
      return;
    }
    loadedUrlRef.current = url;
    void openListingVendorView({ url, title: hostOf(url), bounds }).then((ok) => {
      mountedRef.current = ok;
      if (!ok) {
        loadedUrlRef.current = null;
        setFailed(true);
      }
    });
  }, [activeHref]);

  /**
   * Reload the live listing.
   *
   * Clearing the loaded-URL ref is what makes `sync` take its load branch again
   * instead of the cheap set-bounds path, and Main answers a repeat open for the
   * same partition with a fresh `loadURL`. That reuses plumbing that already
   * exists rather than adding a reload IPC — the native view is an OS layer with
   * no DOM handle the renderer could call `.reload()` on.
   */
  const reload = useCallback(() => {
    if (!activeHref) return;
    loadedUrlRef.current = null;
    setFailed(false);
    sync();
  }, [activeHref, sync]);

  useEffect(() => {
    if (!open) {
      if (mountedRef.current) {
        mountedRef.current = false;
        loadedUrlRef.current = null;
        void hideDesktopVendorView();
      }
      return undefined;
    }

    setFailed(false);
    sync();

    const el = slotRef.current;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => sync()) : null;
    if (ro && el) ro.observe(el);
    window.addEventListener('resize', sync);
    // Capture: the Displays column scrolls, and a scroll on an inner port does
    // not bubble to window.
    window.addEventListener('scroll', sync, true);

    // Lease renewal. Main drops the view when these stop, which is what makes a
    // stranded listing impossible: if this component dies in a way that skips
    // the cleanup below — a crashed render, a discarded hot-reload module — the
    // heartbeat dies with it and Main cleans up on its own within seconds.
    pingDesktopVendorView();
    const heartbeat = window.setInterval(pingDesktopVendorView, 2000);

    return () => {
      ro?.disconnect();
      window.clearInterval(heartbeat);
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
      // Leaving the leaf (or the carton) must take the native view with it —
      // it has no parent to be unmounted by.
      mountedRef.current = false;
      loadedUrlRef.current = null;
      void hideDesktopVendorView();
    };
  }, [open, sync]);

  if (embeddable.length === 0) return null;

  const options = [
    ...embeddable.map((l, i) => ({
      value: l.href,
      label: (l.label || '').trim() || `Listing ${i + 1}`,
      meta: hostOf(l.href),
    })),
    // Reachable from the picker so the override never needs a band of its own.
    { value: EDIT_LINK_OPTION, label: 'Edit listing link…', meta: 'manual override' },
  ];

  return (
    // Content-sized when closed (just the combo row) — the CALLER adds
    // `flex-1` when a listing is live. An `h-full` here would make the panel
    // claim the whole column while closed and push its siblings out.
    <div className={cn('flex min-h-0 min-w-0 flex-col', className)}>
      {/* Banner — the only chrome the operator gets once the native view is up.
          It owns the seam below it (one hairline per seam), and every cell abuts
          flush: this is station chrome, not a toolbar of floating chips. */}
      <div
        data-testid="listing-vendor-view-banner"
        className={cn(
          'flex shrink-0 items-stretch gap-0',
          open && 'border-b border-border-hairline',
        )}
      >
        {editing ? (
          <>
            <div className="min-w-0 flex-1">
              <SearchBar
                value={listingLink}
                onChange={setListingLink}
                placeholder="https://…"
                variant="blue"
                size="compact"
                hideUnderline
                autoFocus
                className="w-full"
              />
            </div>
            <HoverTooltip label="Done editing the listing link" asChild>
              <IconButton
                type="button"
                size="md"
                icon={<Check className="h-4 w-4" />}
                onClick={() => setEditing(false)}
                ariaLabel="Done editing the listing link"
                className={cn(cornerClass('flush'), 'self-stretch border-l border-border-hairline')}
              />
            </HoverTooltip>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <SearchableSelectField
                value={activeHref}
                onChange={(v) => {
                  if (v === EDIT_LINK_OPTION) {
                    setEditing(true);
                    return;
                  }
                  setActiveHref(typeof v === 'string' ? v : null);
                }}
                options={options}
                appearance="flush"
                placeholder="Open a listing here…"
                searchPlaceholder="Filter listings…"
                emptyMessage="No embeddable listings"
                ariaLabel="Listing to open in the embedded browser"
              />
            </div>
            {open ? (
              <HoverTooltip label="Reload this listing" asChild>
                <IconButton
                  type="button"
                  size="md"
                  icon={<RefreshCw className="h-4 w-4" />}
                  onClick={reload}
                  ariaLabel="Reload this listing"
                  className={cn(
                    cornerClass('flush'),
                    'self-stretch border-l border-border-hairline',
                  )}
                />
              </HoverTooltip>
            ) : null}
            {open ? (
              <HoverTooltip label="Close embedded listing" asChild>
                <IconButton
                  type="button"
                  size="md"
                  icon={<X className="h-4 w-4" />}
                  onClick={() => setActiveHref(null)}
                  ariaLabel="Close embedded listing"
                  className={cn(
                    cornerClass('flush'),
                    'self-stretch border-l border-border-hairline',
                  )}
                />
              </HoverTooltip>
            ) : null}
          </>
        )}
      </div>

      {open ? (
        failed ? (
          <InlineNotice tone="warning" size="sm">
            Could not open this listing here. Use Open to view it in a browser tab.
          </InlineNotice>
        ) : (
          <div
            ref={slotRef}
            data-testid="listing-vendor-view-slot"
            className={cn(
              cornerClass('flush'),
              // Fills the leaf. The Displays leaf body is a height-resolved flex
              // column (`flex min-h-0 flex-1 flex-col`), so `flex-1 min-h-0`
              // gets a real height here — a fixed px slot left the marketplace
              // page in a letterbox with dead rail underneath it.
              // No `border-t`: the banner above owns this seam. Both would
              // double the joint.
              'flex min-h-0 flex-1 items-center justify-center bg-surface-canvas',
            )}
          >
            {/* Covered by the native view once Main mounts it. Visible only for
                the frame before that, and whenever the shell declines. */}
            <span className="flex items-center gap-1.5 text-role-caption text-text-faint">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Opening {hostOf(activeHref)}…
            </span>
          </div>
        )
      ) : null}
    </div>
  );
}
