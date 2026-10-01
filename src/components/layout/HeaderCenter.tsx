'use client';

import { useRef, type KeyboardEvent } from 'react';
import { Bookmark, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { KeyboardKey } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useHeader, type HeaderCenterTask } from '@/contexts/HeaderContext';
import { useSavedViews } from '@/hooks/useSavedViews';
import { useOperationsSavedViewPresets } from '@/hooks/useOperationsSavedViews';
import {
  MAX_SAVED_VIEW_DIGIT,
  useSavedViewDigitHotkeys,
  useShiftHeld,
} from '@/hooks/useSavedViewDigitHotkeys';
import { OPERATIONS_SAVED_VIEWS_KEY } from '@/lib/operations/saved-view-presets';
import type { NavContext } from '@/lib/nav/context/schema';
import { cn } from '@/utils/_cn';
import {
  HEADER_CONTROL_CORNER,
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
} from './header-shell';
import { useCurrentNavPath, useNavContext } from '@/components/sidebar/contextual/useNavContext';

type SavedViewsSpec = NonNullable<NavContext['savedViews']>;

type SavedViewFace = {
  id: string;
  name: string;
  isMine: boolean;
};

interface SavedViewCenterModel<V extends SavedViewFace> {
  views: readonly V[];
  activeView: V | null;
  hasActiveFilters: boolean;
  applyView: (view: V) => void;
  clearView: () => void;
  saveView: (name: string) => void;
  removeView: (id: string) => void;
}

const SAVED_VIEW_FACE = cn(
  'ds-raw-button relative inline-flex h-8 min-w-0 items-center gap-1.5 border border-border-soft bg-surface-card px-2 text-role-caption font-semibold text-text-muted',
  'transition-colors hover:bg-surface-hover hover:text-text-default',
  HEADER_CONTROL_CORNER,
  focusRing('control', 'accent'),
);

function HeaderTaskTabs({
  ariaLabel,
  activeId,
  tasks,
  onSelect,
}: {
  ariaLabel: string;
  activeId: string;
  tasks: readonly HeaderCenterTask[];
  onSelect: (id: string) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = tasks.findIndex((task) => task.id === activeId);
    let next = current < 0 ? 0 : current;
    if (event.key === 'ArrowRight') next = (next + 1) % tasks.length;
    else if (event.key === 'ArrowLeft') next = (next - 1 + tasks.length) % tasks.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tasks.length - 1;
    else return;
    event.preventDefault();
    const task = tasks[next];
    if (!task) return;
    onSelect(task.id);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="flex h-9 items-center gap-0.5 rounded-mode-pill border border-border-hairline bg-surface-card/90 px-0.5 shadow-elev-soft backdrop-blur-sm"
      data-header-center="station-tasks"
    >
      {tasks.map((task, index) => {
        const active = task.id === activeId;
        const Icon = task.icon;
        return (
          <HoverTooltip key={task.id} label={task.label} placement="below" asChild>
            <button
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="tab"
              aria-label={task.label}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(task.id)}
              className={cn(
                'ds-raw-button relative grid place-content-center',
                HEADER_ICON_BTN_CLASS,
                focusRing('control', 'accent'),
                active && HEADER_ICON_BTN_OPEN_CLASS,
                active && 'text-text-default shadow-elev-soft',
                task.tone,
              )}
            >
              <span aria-hidden>
                <Icon className="size-4" />
              </span>
              {task.count != null ? (
                <span className="absolute -right-0.5 -top-0.5 min-w-3 rounded-full bg-surface-inverse px-0.5 text-center text-role-micro tabular-nums text-text-inverse">
                  {task.count}
                </span>
              ) : null}
            </button>
          </HoverTooltip>
        );
      })}
    </div>
  );
}

function SavedViewTabs<V extends SavedViewFace>({
  model,
}: {
  model: SavedViewCenterModel<V>;
}) {
  const { views, activeView, applyView, clearView, removeView } = model;
  const shiftHeld = useShiftHeld();

  useSavedViewDigitHotkeys({
    views,
    activeViewId: activeView?.id ?? null,
    applyView,
    clearView,
  });

  if (views.length === 0) return null;


  return (
    <div
      role="group"
      aria-label="Saved views"
      className="flex h-9 max-w-2xl items-center gap-0.5 overflow-x-auto rounded-mode-pill border border-border-hairline bg-surface-card/90 px-0.5 shadow-elev-soft backdrop-blur-sm [scrollbar-width:none]"
      data-header-center="saved-views"
    >
      {views.map((view, index) => {
        const active = view.id === activeView?.id;
        const digit = shiftHeld && index < MAX_SAVED_VIEW_DIGIT ? index + 1 : null;
        return (
          <div key={view.id} className="group/view relative flex shrink-0 items-center">
            <button
              type="button"
              aria-pressed={active}
              aria-keyshortcuts={index < MAX_SAVED_VIEW_DIGIT ? `Shift+${index + 1}` : undefined}
              onClick={() => (active ? clearView() : applyView(view))}
              className={cn(
                SAVED_VIEW_FACE,
                view.isMine && 'pr-7',
                active && 'border-border-default bg-surface-sunken text-text-default',
              )}
              title={view.name}
            >
              {digit ? (
                <KeyboardKey aria-hidden size="xs">{digit}</KeyboardKey>
              ) : (
                <Bookmark aria-hidden className="size-3.5 shrink-0" />
              )}
              <span className="max-w-32 truncate">{view.name}</span>
            </button>
            {view.isMine ? (
              <button
                type="button"
                aria-label={`Delete view ${view.name}`}
                onClick={() => removeView(view.id)}
                className={cn(
                  'ds-raw-button absolute right-1 grid size-5 place-content-center text-text-faint opacity-0 transition-opacity hover:text-text-default group-hover/view:opacity-100 focus-visible:opacity-100',
                  HEADER_CONTROL_CORNER,
                  focusRing('control', 'accent'),
                )}
              >
                <X aria-hidden className="size-3" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function GenericSavedViews({ spec }: { spec: SavedViewsSpec }) {
  const model = useSavedViews({ storageKey: spec.storageKey, paramKeys: spec.paramKeys });
  return <SavedViewTabs model={model} />;
}

function OperationsSavedViews() {
  const model = useOperationsSavedViewPresets();
  return <SavedViewTabs model={model} />;
}

function HeaderSavedViews({ spec }: { spec: SavedViewsSpec }) {
  return spec.storageKey === OPERATIONS_SAVED_VIEWS_KEY ? (
    <OperationsSavedViews />
  ) : (
    <GenericSavedViews spec={spec} />
  );
}

/** Fixed geometric center of the global header. Record tasks outrank page presets. */
export function HeaderCenter() {
  const { centerTasks } = useHeader();
  const path = useCurrentNavPath();
  const nav = useNavContext(path).data;
  const savedViews = nav?.rollout === 'contextual' && nav.scope === 'section'
    ? nav.savedViews
    : undefined;
  const registration = centerTasks;

  if (!registration && !savedViews) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-40" data-header-zone="center">
      <div className="pointer-events-auto min-w-0 max-w-full">
        {registration ? (
          <HeaderTaskTabs
            ariaLabel={registration.ariaLabel}
            activeId={registration.activeId}
            tasks={registration.tasks}
            onSelect={registration.onSelect}
          />
        ) : savedViews ? (
          <HeaderSavedViews spec={savedViews} />
        ) : null}
      </div>
    </div>
  );
}
