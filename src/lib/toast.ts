/**
 * Toast waist — Sonner behind Kinetic Ledger defaults.
 *
 * Theme lives on `AppToaster` + `toast-theme.ts`. This module owns duration /
 * close-button policy so success stays a quiet whisper and errors stay dismissible.
 *
 * Prefer `@/lib/toast` over `sonner` directly so defaults apply.
 */

import {
  toast as sonnerToast,
  type ExternalToast,
} from 'sonner';
import type { ReactNode } from 'react';
import {
  TOAST_DURATION,
  type ToastKind,
} from '@/design-system/components/toast-theme';

type Title = (() => ReactNode) | ReactNode;

function mergeOptions(
  kind: ToastKind,
  data?: ExternalToast,
): ExternalToast | undefined {
  const closeByDefault = kind === 'error' || kind === 'warning';
  return {
    duration: TOAST_DURATION[kind],
    closeButton: closeByDefault,
    ...data,
  };
}

export const toast = Object.assign(
  (message: Title, data?: ExternalToast) => sonnerToast(message, data),
  {
    success: (message: Title, data?: ExternalToast) =>
      sonnerToast.success(message, mergeOptions('success', data)),
    error: (message: Title, data?: ExternalToast) =>
      sonnerToast.error(message, mergeOptions('error', data)),
    warning: (message: Title, data?: ExternalToast) =>
      sonnerToast.warning(message, mergeOptions('warning', data)),
    info: (message: Title, data?: ExternalToast) =>
      sonnerToast.info(message, mergeOptions('info', data)),
    message: (message: Title, data?: ExternalToast) =>
      sonnerToast.message(message, data),
    loading: (message: Title, data?: ExternalToast) =>
      sonnerToast.loading(message, mergeOptions('loading', data)),
    promise: sonnerToast.promise.bind(sonnerToast),
    custom: sonnerToast.custom.bind(sonnerToast),
    dismiss: sonnerToast.dismiss.bind(sonnerToast),
    getHistory: sonnerToast.getHistory.bind(sonnerToast),
    getToasts: sonnerToast.getToasts.bind(sonnerToast),
  },
);
