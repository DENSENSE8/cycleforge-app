/** Warm the desktop sidebar's lazy chunk (`ContextualSidebar`) before the operator opens it. */

import type * as SidebarModule from '@/components/sidebar/contextual/ContextualSidebar';

let pending: Promise<typeof SidebarModule> | null = null;

/** Fire-and-forget warm. */
export function warmSpineChunk(): void {
  pending ??= import('@/components/sidebar/contextual/ContextualSidebar');
  void pending.catch(() => {});
}
