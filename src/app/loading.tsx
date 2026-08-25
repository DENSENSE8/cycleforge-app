/**
 * Root loading boundary. NULL on purpose (rewritten 2026-08-23): the old
 * version imported `@/design-system/components/RouteLoading`, which was
 * deleted with the component tree — a loading boundary that cannot compile
 * breaks every route it wraps. And the shell is always-mounted, so there is
 * no blank frame for a spinner to fill; a loading flash over a live HUD is
 * noise, not information.
 */
export default function Loading() {
  return null;
}
