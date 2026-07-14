'use client';

/**
 * Header chips for saved outbound views — sits next to All so supervisors can
 * re-open “late tested” / “my pending” without opening the sidebar.
 */

import { Star, X } from '@/components/Icons';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useSavedViews } from '@/hooks/useSavedViews';
import {
  PACKED_SAVED_VIEWS_KEY,
  PACKED_VIEW_PARAMS,
  SHIPPED_SAVED_VIEWS_KEY,
  SHIPPED_VIEW_PARAMS,
  UNSHIPPED_SAVED_VIEWS_KEY,
  UNSHIPPED_VIEW_PARAMS,
} from '@/components/unshipped/outbound-sidebar-shared';
import { cn } from '@/utils/_cn';

type Mode = 'unshipped' | 'packed' | 'shipped';

const MAX_CHIPS = 4;

function configFor(mode: Mode) {
  if (mode === 'unshipped') {
    return { storageKey: UNSHIPPED_SAVED_VIEWS_KEY, paramKeys: UNSHIPPED_VIEW_PARAMS };
  }
  if (mode === 'packed') {
    return { storageKey: PACKED_SAVED_VIEWS_KEY, paramKeys: PACKED_VIEW_PARAMS };
  }
  return { storageKey: SHIPPED_SAVED_VIEWS_KEY, paramKeys: SHIPPED_VIEW_PARAMS };
}

export function OutboundSavedViewChips({ mode }: { mode: Mode }) {
  const { storageKey, paramKeys } = configFor(mode);
  const { views, activeView, applyView, removeView } = useSavedViews({
    storageKey,
    paramKeys,
  });

  const visible = views.slice(0, MAX_CHIPS);
  const overflow = views.length - visible.length;

  if (views.length === 0) return null;

  return (
    <div className="flex min-w-0 max-w-[min(40vw,28rem)] items-center gap-1" role="group" aria-label="Saved views">
      {visible.map((view) => {
        const isActive = view.id === activeView?.id;
        return (
          <HoverTooltip key={view.id} label={view.name} asChild>
            <span className="group/chip relative inline-flex max-w-[8rem]">
              <ToolbarButton
                active={isActive}
                onClick={() => applyView(view)}
                aria-pressed={isActive}
                className="max-w-full pr-1"
              >
                <Star className={cn('h-3 w-3 shrink-0', isActive ? 'text-amber-300' : 'text-amber-500')} />
                <span className="min-w-0 truncate">{view.name}</span>
              </ToolbarButton>
              <button
                type="button"
                aria-label={`Delete view ${view.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeView(view.id);
                }}
                className="ds-raw-button absolute -right-1 -top-1 hidden rounded-full bg-surface-card p-0.5 text-text-faint shadow-sm ring-1 ring-border-soft group-hover/chip:block hover:text-rose-500"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          </HoverTooltip>
        );
      })}
      {overflow > 0 ? (
        <span className="px-1 text-role-eyebrow font-bold tabular-nums text-text-faint">+{overflow}</span>
      ) : null}
    </div>
  );
}
