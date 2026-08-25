'use client';

/**
 * "Open something in this pane" — the request, not the index.
 *
 * An empty canvas pane needs to offer the master index of everything
 * launchable. That index is `buildCommandBarNavGroups` + `searchNav` behind the
 * left rail's "+" popover (roadmap Phase 4), and it is a different lane's file.
 *
 * The canvas therefore ASKS rather than imports. A window `CustomEvent` carrying
 * the requesting pane's id is the whole protocol: the launcher opens, the
 * operator picks, and whoever owns the launcher calls `openTab(...)` followed by
 * `adoptTabIntoPane(groupId, tabId)`.
 *
 * Doing it this way is not a lane workaround — it is the same reason the "+"
 * index is a popover on a rail and not a component the canvas owns: pulling the
 * command bar's nav graph into the canvas chunk would put the whole launchable
 * surface list in the shell bundle, which is precisely the bundle lever this
 * refactor is trying not to give back. The event costs one listener.
 */

/** Emitted when a pane wants the master index opened against it. */
export const CANVAS_LAUNCH_REQUEST_EVENT = 'cf:canvas-launch-request';

export interface CanvasLaunchRequestDetail {
  /** The pane that asked. Whatever is opened should land here. */
  readonly groupId: string;
}

/** Ask for the launcher, aimed at one pane. No-op outside a browser. */
export function requestCanvasLaunch(groupId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<CanvasLaunchRequestDetail>(CANVAS_LAUNCH_REQUEST_EVENT, {
      detail: { groupId },
    }),
  );
}

/** Listen for launch requests. Returns an unsubscribe. */
export function subscribeCanvasLaunchRequest(
  listener: (detail: CanvasLaunchRequestDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<CanvasLaunchRequestDetail>).detail;
    if (detail?.groupId) listener(detail);
  };
  window.addEventListener(CANVAS_LAUNCH_REQUEST_EVENT, handler);
  return () => window.removeEventListener(CANVAS_LAUNCH_REQUEST_EVENT, handler);
}
