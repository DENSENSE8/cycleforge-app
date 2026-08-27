'use client';

/**
 * Shared receiving-surface page shell — the desktop sidebar + right-pane
 * (`RouteShell`) mounted by `/unbox`, `/triage`, `/receiving` (legacy),
 * `/receiving/history`, `/incoming`, `/pickup` and `/repair`. The sidebar
 * switches modes via `useReceivingMode`, which is surface-aware and routes the
 * Unbox mode to `/unbox`.
 *
 * **There is no narrow-width mobile branch here, and there must not be one
 * again.** This surface used to carry a second, complete `md:hidden` tree — a
 * photo-only feed with its own header, drawer button and `MobileReceivingList`
 * — selected by viewport width. Mobile is a ROUTING decision in this app, not a
 * width decision: the edge proxy serves phones the `/m/*` shell, and a phone
 * that lands on a desk path bounces to `/m/home` (`ResponsiveLayout`). So that
 * tree never rendered for a real device; it only server-rendered a duplicate
 * page into every desk document and pulled the mobile feed's components into
 * the desk bundle. Narrow-width treatments that a desk surface genuinely needs
 * belong in CSS on the one tree below.
 */

import { Suspense } from 'react';
import ReceivingDashboard from '@/components/ReceivingDashboard';
import { ReceivingSidebarPanel } from '@/components/sidebar/ReceivingSidebarPanel';
import { RouteShell } from '@/design-system/components/RouteShell';
import { ZohoSplitPane } from '@/components/receiving/workspace/ZohoSplitPane';

function ReceivingSurfacePageInner() {
  return (
    <>
      {/* Sidebar + form flows. Wash lives on CONTEXT_PANEL_HOST_RECEIVING
          (shared behind rail + workspace), not on this workspace-only wrapper —
          a workspace wash re-painted the seam and sheared outset collapse
          chrome. */}
      <div className="flex h-full w-full overflow-hidden">
        <RouteShell
          actions={<ReceivingSidebarPanel />}
          history={<ReceivingDashboard />}
        />
      </div>

      {/* Electron-only: right-side Zoho viewer triggered by the per-line
          "Open in Zoho" action. Hidden until activated; no-op in a browser. */}
      <ZohoSplitPane />
    </>
  );
}

export function ReceivingSurfacePage() {
  return (
    // Fallback fills the page slot with the app wash while useSearchParams
    // suspends (SSR/hydration) — a bare Suspense here rendered a white void.
    <Suspense fallback={<div className="h-full w-full" aria-hidden />}>
      <ReceivingSurfacePageInner />
    </Suspense>
  );
}
