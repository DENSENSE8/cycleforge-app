'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { useHasSidebarContext } from '@/components/sidebar/useHasSidebarContext';
import {
  CONTEXT_PANEL_COLUMN_CLASS,
  CONTEXT_PANEL_HOST_CLASS,
} from '@/components/sidebar/context-panel-column';
import { isStationSurfaceRoute } from '@/lib/sidebar-navigation';

// Kept lazy, exactly as they were when this mounted from the app shell: the
// dispatcher code-splits every route panel behind it, so a shell-chunk static
// import here would pull each feature's graph into the shared bundle
// (`.claude/rules/build-gotchas.md` → bundle altitude).
const SidebarContextPanel = dynamic(
  () => import('@/components/sidebar/SidebarContextPanel').then((m) => m.SidebarContextPanel),
  { ssr: false },
);
const MasterNavProvider = dynamic(
  () => import('@/components/sidebar/master-nav').then((m) => m.MasterNavProvider),
  { ssr: false },
);

/**
 * The wrapper that mounts a route's OWN sidebar beside its workspace.
 *
 * This is the shape the station benches always had — scan bar + recents rail as
 * a card in the content region — generalized to every route that has a context
 * panel. It replaced the nav-aside mount, where a route's rail was a *body of
 * the navigator*: `MasterNav` chose between "the page list" and "this route's
 * sidebar", so the two surfaces shared one column and had to fight over it.
 *
 * Why it is a wrapper and not a slot in the nav:
 *
 * - **A rail is part of the page, not part of the navigator.** Products' picker
 *   and Unbox's recents rail are the surface the operator works from; putting
 *   them inside the nav made them disappear (or get painted over) the moment the
 *   page list opened.
 * - **It leaves exactly one left-edge surface.** With the rails out of the aside,
 *   the spine no longer lands on top of anything, which is what let the Media
 *   library — a route with no rail at all — have the page list paint straight
 *   over its photo grid.
 * - **One shape, one set of tokens.** Every route now reads as
 *   `[rail card] [workspace]` on the canvas ground plane, instead of station
 *   routes doing that and classic routes doing something else.
 *
 * Renders `children` untouched when the route has no panel, so a panel-less
 * surface still reserves nothing.
 */
export function ContextPanelLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Two families, one question: station benches (scan bar + rail) and classic
  // routes (picker / feed) both mount their panel here now.
  const hasPanel = useHasSidebarContext() || isStationSurfaceRoute(pathname);

  if (!hasPanel) return <>{children}</>;

  return (
    <div className={CONTEXT_PANEL_HOST_CLASS}>
      {/* `data-context-panel` is the panel's identity hook, so a test can ask
          "did the route's rail render?" without keying off its width class. */}
      <div className={CONTEXT_PANEL_COLUMN_CLASS} data-context-panel>
        {/* The rail degrades alone. It carried an `ErrorBoundary` when it lived
            in the nav aside, and moving it into the content region must not
            quietly turn a throwing picker into a blank page. */}
        <ErrorBoundary
          label="context-panel"
          fallback={(_e, reset) => (
            <div className="m-3 rounded-lg border border-dashed border-rose-200 bg-rose-50 px-3 py-4 text-center">
              <p className="text-role-caption font-semibold text-rose-700">Sidebar unavailable</p>
              <p className="mt-1 text-role-eyebrow uppercase tracking-widest text-rose-500">
                The rest of the page still works
              </p>
              <button
                type="button"
                onClick={reset}
                className="ds-raw-button mt-3 rounded-lg bg-surface-card px-3 py-1.5 text-role-caption font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50"
              >
                Retry
              </button>
            </div>
          )}
        >
          {/* `enabled` keeps every panel's own mode pill-row suppressed
              (`useMasterNavEnabled()`): the nav owns page + mode, and a second
              mode strip at the top of the rail is noise. */}
          <MasterNavProvider enabled>
            <SidebarContextPanel />
          </MasterNavProvider>
        </ErrorBoundary>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
