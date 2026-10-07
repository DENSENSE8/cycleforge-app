/** Toast waist — Sonner behind Kinetic Ledger defaults. */

import {
  toast as sonnerToast,
  type ExternalToast,
} from 'sonner';
import type { CSSProperties, ReactNode } from 'react';
import {
  TOAST_DEFAULT_DURATION,
  TOAST_DRAIN_KEYFRAMES,
  TOAST_DRAIN_VAR,
  TOAST_DURATION,
  TOAST_LIFETIME_VAR,
  TOAST_PERSISTENT_CLASS,
  type ToastKind,
} from '@/design-system/components/toast-theme';

type Title = (() => ReactNode) | ReactNode;
type LifetimeFields = Pick<ExternalToast, 'id' | 'duration' | 'style' | 'className'>;
type PromiseArgs<T> = Parameters<typeof sonnerToast.promise<T>>;

/** How long a reversible write's Undo stays on screen — the house undo window (chat delete, recents, carton delete alike). */
export const UNDO_WINDOW_MS = 10_000;

/**
 * Drain keyframe last used per caller-supplied id. Sonner restarts a toast's
 * timer on every in-place update, so each update flips the keyframe and the
 * bar restarts with it. Only explicit ids land here; the cap keeps a long
 * session from accumulating them (a reset costs at most one missed restart).
 */
const drainPhase = new Map<string | number, 0 | 1>();
const DRAIN_PHASE_CAP = 256;

/** Stamp the lifetime bar's inputs (see toast-theme.ts) onto a toast's options. */
function withLifetimeBar<T extends LifetimeFields>(data?: T): T {
  const opts = (data ?? {}) as T;
  const { duration, id } = opts;
  if (duration === Infinity) {
    return {
      ...opts,
      className: opts.className ? `${TOAST_PERSISTENT_CLASS} ${opts.className}` : TOAST_PERSISTENT_CLASS,
    };
  }
  let phase: 0 | 1 = 0;
  if (id !== undefined) {
    if (drainPhase.size >= DRAIN_PHASE_CAP) drainPhase.clear();
    phase = drainPhase.get(id) === 0 ? 1 : 0;
    drainPhase.set(id, phase);
  }
  // Sonner treats 0 / undefined as "use the Toaster default".
  const lifetime = duration && duration > 0 ? duration : TOAST_DEFAULT_DURATION;
  return {
    ...opts,
    style: {
      [TOAST_LIFETIME_VAR]: `${lifetime}ms`,
      [TOAST_DRAIN_VAR]: TOAST_DRAIN_KEYFRAMES[phase],
      ...opts.style,
    } as CSSProperties,
  };
}

function mergeOptions(kind: ToastKind, data?: ExternalToast): ExternalToast {
  const closeByDefault = kind === 'error' || kind === 'warning';
  return withLifetimeBar({
    duration: TOAST_DURATION[kind],
    closeButton: closeByDefault,
    ...data,
  });
}

export const toast = Object.assign(
  (message: Title, data?: ExternalToast) => sonnerToast(message, withLifetimeBar(data)),
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
      sonnerToast.message(message, withLifetimeBar(data)),
    loading: (message: Title, data?: ExternalToast) =>
      sonnerToast.loading(message, mergeOptions('loading', data)),
    promise: <ToastData>(promise: PromiseArgs<ToastData>[0], data?: PromiseArgs<ToastData>[1]) =>
      sonnerToast.promise<ToastData>(promise, data && withLifetimeBar(data)),
    custom: (jsx: Parameters<typeof sonnerToast.custom>[0], data?: ExternalToast) =>
      sonnerToast.custom(jsx, withLifetimeBar(data)),
    dismiss: sonnerToast.dismiss.bind(sonnerToast),
    getHistory: sonnerToast.getHistory.bind(sonnerToast),
    getToasts: sonnerToast.getToasts.bind(sonnerToast),
    /** A done-and-reversible write: the message plus one "Undo" action, held for the house undo window ({@link UNDO_WINDOW_MS}). */
    undo: (message: string, opts: { onUndo: () => void; duration?: number }): string | number =>
      sonnerToast.success(
        message,
        mergeOptions('success', {
          duration: opts.duration ?? UNDO_WINDOW_MS,
          action: { label: 'Undo', onClick: () => opts.onUndo() },
        }),
      ),
  },
);
