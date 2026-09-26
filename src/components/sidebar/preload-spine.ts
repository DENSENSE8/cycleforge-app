/** Warm the MasterNav spine's lazy chunk before the operator opens it. */

type SpineModule = typeof import('@/components/DashboardSidebar');

/** The one import site for the spine chunk — shared by `next/dynamic` and by the warm paths, so they resolve to the SAME chunk. */
let pending: Promise<SpineModule> | null = null;

function importSpineChunk(): Promise<SpineModule> {
  pending ??= import('@/components/DashboardSidebar');
  return pending;
}

/** Fire-and-forget warm. */
export function warmSpineChunk(): void {
  void importSpineChunk().catch(() => {});
}
