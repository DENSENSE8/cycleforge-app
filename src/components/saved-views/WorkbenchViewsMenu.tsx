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
 * Trigger: flush icon-only Lucide **Bookmark** — Band-3 peer of KPI /
 * inspector (`IconButton` `xs`, no pad). Active fill is the icon box only
 * (never a full-row / full-band wash). Tooltip carries "Views" or the active
 * view name. SoT: source-of-truth.md → Left-edge occupant.
 */

import { useState } from 'react';
import { AnchoredLayer, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Bookmark } from '@/components/Icons';
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
      <ViewsMenuButton
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
      </ViewsMenuButton>
    </div>
  );
}

function ViewsMenuButton({
  open,
  tip,
  active,
  onToggle,
  onClose,
  children,
}: {
  open: boolean;
  tip: string;
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
      <HoverTooltip label={tip} asChild>
        <IconButton
          size="xs"
          tone="neutral"
          ariaLabel={active ? `Saved view: ${tip}` : 'Saved views'}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-pressed={lit}
          onClick={onToggle}
          icon={<Bookmark className="h-3.5 w-3.5 shrink-0" />}
          className={
            lit
              ? 'bg-blue-600 text-white hover:bg-blue-600 hover:text-white'
              : 'text-text-muted hover:bg-surface-hover hover:text-text-default'
          }
        />
      </HoverTooltip>
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
