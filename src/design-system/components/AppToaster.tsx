'use client';

/**
 * Kinetic Ledger toaster — Sonner with house chrome.
 *
 * Light semantic fills (status-pill triad), quiet stroke icons, no `richColors`.
 * Every timed toast drains a lifetime bar along its bottom edge; pending
 * (`loading`) toasts hold the bar as a tone instead of a spinner — see
 * `toast-theme.ts`. Mount once from Providers. Call sites use `@/lib/toast`
 * (duration / close defaults).
 */

import { useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Toaster } from 'sonner';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Info,
  X,
} from '@/components/Icons';
import { zIndex } from '@/design-system/tokens/z-index';
import {
  TOAST_CLASSNAMES,
  TOAST_DEFAULT_DURATION,
  TOAST_LIFETIME_VAR,
  TOASTER_IDLE_CLASS,
} from './toast-theme';

const iconClass = 'h-4 w-4 shrink-0';

/** Sonner lays toasts out inside a fixed-width list; widen it for the larger chrome. */
const toasterStyle = { zIndex: zIndex.toast, '--width': '24rem' } as CSSProperties;
/** Fallback lifetime for toasts that did not come through `@/lib/toast`. */
const toastStyle = { [TOAST_LIFETIME_VAR]: `${TOAST_DEFAULT_DURATION}ms` } as CSSProperties;

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

/** Sonner pauses every toast timer while the tab is hidden; the bar follows. */
function useDocumentHidden() {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  );
}

const noSubscribe = () => () => {};

export function AppToaster() {
  const documentHidden = useDocumentHidden();
  // The toaster renders on `document.body`, beside the modal portals. Inside
  // `#app-root` (a fixed box, so its own stacking context) its z band could
  // never clear a dialog: an Undo toast for a verb pressed in a dialog sat behind it.
  const host = useSyncExternalStore(noSubscribe, () => document.body, () => null);
  if (!host) return null;
  return createPortal(
    // Band 2 (globals.css motion bands): licenses the pending bar's
    // opacity-only breathing. It is bounded by a real event — a loading toast
    // lives exactly until its work settles — and reduced motion holds it static.
    <div data-motion="2" className="contents">
      <Toaster
        position="bottom-right"
        theme="light"
        gap={10}
        visibleToasts={3}
        duration={TOAST_DEFAULT_DURATION}
        closeButton={false}
        expand={false}
        className={documentHidden ? TOASTER_IDLE_CLASS : undefined}
        style={toasterStyle}
        icons={{
          success: <Check className={iconClass} />,
          error: <AlertCircle className={iconClass} />,
          warning: <AlertTriangle className={iconClass} />,
          info: <Info className={iconClass} />,
          // No spinner: pending reads from the lifetime bar (the icon slot hides
          // on `loading`). Must stay non-null — with no `loading` icon Sonner
          // mounts its own bar spinner inside every settled promise toast.
          loading: <span hidden />,
          close: <X className="h-3.5 w-3.5" />,
        }}
        toastOptions={{
          unstyled: true,
          classNames: TOAST_CLASSNAMES,
          style: toastStyle,
        }}
      />
    </div>,
    host,
  );
}
