'use client';

/** Typed subscription to the receiving cross-pane event bus. */

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
