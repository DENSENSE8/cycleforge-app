/**
 * Warm the MasterNav spine's lazy chunk before the operator opens it.
 *
 * ## The gap this closes (measured 2026-08-08)
 *
 * `DashboardSidebar` is `next/dynamic` with `ssr: false` and a deliberately
 * invisible `loading` placeholder, and `SidebarNavColumn` only mounts it on
 * FIRST open. So the first click produced this, frame by frame:
 *
 * ```
 *   11ms  the <aside> mounts — hardcoded w-[240px], border, plane colour
 *   17ms  the host starts tweening its width open
 *  248ms  the column is fully open … and completely empty
 *  320ms  the chunk lands; the rows finally paint
 * ```
 *
 * **306ms of a fully-formed empty panel**, because the column's geometry and
 * its background are constants available on frame 1 while its contents come
 * over the network. The second open measured `-1ms` — rows were already
 * mounted before the width even moved — which is what proves this is purely a
 * cold-chunk problem and not a render-cost one.
 *
 * A skeleton would have been the wrong fix: it spends 300ms drawing fake rows
 * to disguise a fetch that can simply happen earlier.
 *
 * ## Fetch, never mount
 *
 * This module is deliberately tiny and imports nothing — importing IT is free,
 * and only *calling* the function pulls the chunk. That distinction is what
 * keeps `SidebarNavColumn`'s bundle-altitude rule intact: its docblock bans
 * eagerly **mounting** the spine (executing the nav graph and rendering it on
 * every desktop page load). Prefetching schedules a network fetch and parse;
 * it renders nothing and runs no nav code, so the column still starts
 * collapsed and still costs nothing to paint.
 *
 * ## Two tiers, because one is not enough on its own
 *
 * - **Hover / focus on the toggle** ({@link SidebarCollapseControl}) — precise
 *   and free, and the pointer's travel to the button is usually the ~300ms the
 *   fetch needs. But it never fires for a touch tap, and a keyboard user who
 *   Tabs straight to it gets only the focus event.
 * - **An idle backstop** ({@link ResponsiveLayout}) — `requestIdleCallback`
 *   after hydration, so the very first open is warm even for someone who never
 *   hovers. Idle-scheduled so it cannot compete with paint or TTI.
 *
 * Both call the same memoized promise, so whichever fires first wins and the
 * other is a no-op.
 */

type SpineModule = typeof import('@/components/DashboardSidebar');

/**
 * The one import site for the spine chunk — shared by `next/dynamic` and by
 * the warm paths, so they resolve to the SAME chunk. Two separate `import()`
 * expressions for one module would be deduped by the bundler today and are
 * exactly the kind of thing that silently stops being true.
 */
let pending: Promise<SpineModule> | null = null;

function importSpineChunk(): Promise<SpineModule> {
  pending ??= import('@/components/DashboardSidebar');
  return pending;
}

/**
 * Fire-and-forget warm. Safe to call on every hover — the promise is memoized,
 * so this is one fetch no matter how many times the pointer crosses the
 * button. A rejected prefetch is swallowed: failing to warm is not an error,
 * the real mount will surface it (and `ResponsiveLayout` wraps the column in
 * an ErrorBoundary).
 */
export function warmSpineChunk(): void {
  void importSpineChunk().catch(() => {});
}
