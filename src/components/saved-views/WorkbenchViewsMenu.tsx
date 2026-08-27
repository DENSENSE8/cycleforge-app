'use client';

/**
 * Band-3 **Views** menu — the PAGE-WIDE saved-views control for ops-queue /
 * workbench data tables. Inner refinement: sits in Band 3's RIGHT control
 * cluster (right of find, immediately before the KPI + inspector toggles) —
 * never Band-1 beside lifecycle tabs, and never inside the find group (it is a
 * control, not part of the query).
 *
 * Two different scopes, two different controls (ruled 2026-08-09):
 *
 *   - `HeaderPinsSwitcher` (GlobalHeader) — WEBSITE-WIDE page pin.
 *   - `WorkbenchViewsMenu` (here) — PAGE-WIDE named FILTER COMBINATION on this
 *     surface's `paramKeys` (`useSavedViews`). Personal by default; optional
 *     org-share via `is_shared`.
 *
 * Trigger: flush **Bookmark + name** on the shared band face
 * ({@link WorkbenchBandControl}) — one rung, one resting tone and one lit fill
 * with its KPI / inspector peers. Abuts the find plane at `gap-0` (no white
 * seam between paste/refine and Views). The label carries the ACTIVE VIEW'S
 * NAME, falling back to `Views` when none is applied, because the one thing an
 * operator needs from this control while it is closed is *which view am I
 * looking at* — and a name that lives only in a tooltip answers that for nobody
 * scanning the band. Truncated at 14ch with the full name still in the tooltip
 * and the accessible name. Lit fill is the control box only (never a full-row /
 * full-band wash). SoT: source-of-truth.md → Left-edge occupant.
 */

import { useState } from 'react';
import { AnchoredLayer } from '@/design-system/primitives';
import { Bookmark } from '@/components/Icons';
import {
  WorkbenchBandControl,
  WORKBENCH_BAND_CONTROL_GLYPH_CLASS,
} from '@/components/dashboard/workbench-band-control';
import { HeaderChromeMenu } from '@/components/layout/header-chrome-menu';
import { SavedViewsList } from '@/components/saved-views/SavedViewsList';
import { useSavedViews } from '@/hooks/useSavedViews';
import { cn } from '@/utils/_cn';

export function WorkbenchViewsMenu({
  storageKey,
  paramKeys,
  emptyHint,
  className,
}: {
  storageKey: string;
  paramKeys: readonly string[];
  emptyHint?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const controller = useSavedViews({ storageKey, paramKeys });
  const tip = controller.activeView ? controller.activeView.name : 'Views';

  return (
    <div className={cn('relative inline-flex shrink-0 items-center', className)}>
      <ViewsMenuShell
        open={open}
        tip={tip}
        active={Boolean(controller.activeView)}
        onToggle={() => setOpen((o) => !o)}
        onClose={() => setOpen(false)}
      >
        <SavedViewsList
          storageKey={storageKey}
          paramKeys={paramKeys}
          hideHeader
          emptyHint={emptyHint}
          controller={controller}
        />
      </ViewsMenuShell>
    </div>
  );
}

/**
 * The Views **face** — flush Bookmark trigger + `HeaderChromeMenu` panel, with
 * no opinion about where the views come from.
 *
 * Exported because a surface may legitimately own a different saved-views
 * STORE while wearing this control. Media Library (`/ops/photos`) is the second
 * consumer: its views persist a JSON `{filters, view}` snapshot through
 * `useMediaLibrarySavedViews`, not a URL-param set, so it cannot compose
 * {@link WorkbenchViewsMenu} — and must not fork the icon, the tooltip or the
 * panel either. Three client hooks over ONE `saved_views` store is the ruling
 * (source-of-truth.md → Tabs vs. saved views); three *faces* never was.
 *
 * Own the store, compose the face.
 */
export function ViewsMenuShell({
  open,
  tip,
  active,
  onToggle,
  onClose,
  children,
}: {
  open: boolean;
  /** Visible label + tooltip + aria: the active view's name, else `Views`. */
  tip: string;
  /**
   * A saved view is currently applied. Pass `false` where the surface cannot
   * honestly tell — a wrong "active" badge is chrome inventing a second story.
   */
  active: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const wrapRef = { current: wrapEl };
  const lit = open || active;
  return (
    <div ref={setWrapEl} className="relative inline-flex shrink-0 items-center p-0">
      <WorkbenchBandControl
        icon={<Bookmark className={WORKBENCH_BAND_CONTROL_GLYPH_CLASS} />}
        label={tip}
        ariaLabel={active ? `Saved view: ${tip}` : 'Saved views'}
        text={tip}
        lit={lit}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-pressed={lit}
        onClick={onToggle}
      />
      <AnchoredLayer
        open={open}
        onClose={onClose}
        anchorRef={wrapRef}
        placement="bottom-end"
        className="z-popover"
      >
        <HeaderChromeMenu ariaLabel="Saved views" className="w-72 p-0">
          {/* Vertical rhythm only — no horizontal pad (flush ops chrome). */}
          <div className="py-2">{children}</div>
        </HeaderChromeMenu>
      </AnchoredLayer>
    </div>
  );
}
