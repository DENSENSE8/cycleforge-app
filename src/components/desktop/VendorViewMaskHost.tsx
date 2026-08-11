'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { useRegisterOverlay } from '@/design-system/hooks';
import { zIndex } from '@/design-system/tokens/z-index';
import {
  hideDesktopVendorView,
  isDesktopHost,
  onDesktopVendorViewHidden,
} from '@/lib/desktop/desktop-host';
import {
  getVendorViewMaskState,
  hideVendorViewMask,
  subscribeVendorViewMask,
  type VendorViewMaskState,
} from '@/lib/desktop/vendor-view-store';
import { cn } from '@/utils/_cn';

/**
 * Full-window React mask for N5 VendorView.
 *
 * Painted BEFORE Main mounts the WebContentsView so Unbox layout does not thrash.
 * The native view covers everything below the chrome strip; Esc / Ctrl+] are
 * handled in Main and notify this host via `onDesktopVendorViewHidden`.
 *
 * Mount once from {@link ResponsiveLayout}. Browser: never opens.
 */
export function VendorViewMaskHost() {
  const state: VendorViewMaskState = useSyncExternalStore(
    subscribeVendorViewMask,
    getVendorViewMaskState,
    getVendorViewMaskState,
  );

  // An anchored view is framed by the feature that opened it (Unbox Listings
  // dropdown), so this host paints nothing and claims no overlay slot for it —
  // the operator must keep working the carton beside it. The Esc / ⌘] handling
  // below still runs, because the native view owns focus in BOTH modes and the
  // renderer is the only place that hears those keys when it does not.
  const takeover = state.open && state.mode === 'takeover';

  useRegisterOverlay(takeover);

  useEffect(() => {
    if (!isDesktopHost()) return undefined;
    return onDesktopVendorViewHidden(() => {
      hideVendorViewMask();
    });
  }, []);

  useEffect(() => {
    if (!state.open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e.key === ']' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        e.stopPropagation();
        void hideDesktopVendorView();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [state.open]);

  if (!takeover) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={state.title}
      className={cn('fixed inset-0 flex flex-col bg-surface-canvas')}
      style={{ zIndex: zIndex.takeover }}
      data-testid="vendor-view-mask"
    >
      <div
        className="flex h-12 shrink-0 items-center gap-2 border-b border-border-hairline bg-surface-card px-3"
        style={{ height: 48 }}
      >
        <IconButton
          icon={<X className="h-4 w-4" />}
          onClick={() => void hideDesktopVendorView()}
          ariaLabel="Close vendor view"
          size="md"
          className="rounded-none ring-1 ring-inset ring-border-soft"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-role-body font-semibold text-text-default">{state.title}</p>
          <p className="truncate text-role-micro text-text-faint">
            Esc or Ctrl+] to return
          </p>
        </div>
      </div>
      {/* Native WebContentsView paints over this sunken region. */}
      <div className="min-h-0 flex-1 bg-surface-sunken" aria-hidden />
    </div>
  );
}
