'use client';

/**
 * Kinetic Ledger toaster — Sonner with house chrome.
 *
 * Light semantic fills (status-pill triad), quiet stroke icons, no `richColors`.
 * Mount once from Providers. Call sites use `@/lib/toast` (duration / close defaults).
 */

import { Toaster } from 'sonner';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Info,
  Loader2,
  X,
} from '@/components/Icons';
import { zIndex } from '@/design-system/tokens/z-index';
import { TOAST_CLASSNAMES, TOAST_DURATION } from './toast-theme';

const iconClass = 'h-4 w-4 shrink-0';

export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      theme="light"
      gap={10}
      visibleToasts={3}
      duration={TOAST_DURATION.success}
      closeButton={false}
      expand={false}
      style={{ zIndex: zIndex.toast }}
      icons={{
        success: <Check className={iconClass} />,
        error: <AlertCircle className={iconClass} />,
        warning: <AlertTriangle className={iconClass} />,
        info: <Info className={iconClass} />,
        // Solid stroke spinner — avoid Sonner's default dashed radial loader
        // (uneven vs caption text). Keep size matched to sibling icons.
        loading: <Loader2 className={`${iconClass} animate-spin text-text-info`} />,
        close: <X className="h-3.5 w-3.5" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: TOAST_CLASSNAMES,
      }}
    />
  );
}
