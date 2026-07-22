'use client';

/**
 * Typed subscription to the receiving cross-pane event bus. Thin wrapper over
 * `useEventBridge` (one declarative effect, ref-held handlers so re-renders
 * never re-bind) that resolves each handler's `detail` type from the
 * `ReceivingEventDetail` registry — the sanctioned replacement for hand-wired
 * `window.addEventListener('receiving-…')` effects.
 *
 *   useReceivingEvents({
 *     'receiving-line-deleted': ({ id }) => id != null && dropLine(id),
 *     'receiving-workspace-close': () => resetSelection(),
 *   });
 *
 * Dispatch side: `emitReceiving` (`@/components/receiving/receiving-events`).
 */

import { useEventBridge } from '@/hooks/_events';
import type {
  ReceivingEventDetail,
  ReceivingEventName,
} from '@/components/receiving/receiving-events';

type ReceivingEventHandlers = {
  [K in ReceivingEventName]?: (
    detail: ReceivingEventDetail[K],
    event: CustomEvent<ReceivingEventDetail[K]>,
  ) => void;
};

export function useReceivingEvents(handlers: ReceivingEventHandlers, enabled = true): void {
  const bridge: Record<string, (event: Event) => void> = {};
  for (const name of Object.keys(handlers) as ReceivingEventName[]) {
    const handler = handlers[name] as
      | ((detail: unknown, event: CustomEvent) => void)
      | undefined;
    if (!handler) continue;
    bridge[name] = (event: Event) => {
      const ce = event as CustomEvent;
      handler(ce.detail, ce);
    };
  }
  useEventBridge(bridge, enabled);
}
