'use client';

/**
 * The task status **combobox** (owner 2026-09-30: "a status combo box for
 * quick keyboard triage") over the ONE status map (`TASK_STATUS_FACE`):
 * To do · In progress · Pending · Follow-up · Blocked · Done · Canceled.
 *
 * Keys: type to filter (`pen` → Pending; aliases too — `parts` → Blocked); a
 * status's letter typed alone ranks it first (`p` Enter = Pending); ↑ / ↓
 * move; Enter applies; a digit applies straight away; Esc hands focus back
 * (`AnchoredLayer`). Canceled is final (`isTaskStatusReachable`).
 *
 * `TaskStatusPicker` is the board's `S` (anchored under the cursor row, or on
 * the open record's header Status verb).
 */

import { useId, useMemo, useState, type RefObject } from 'react';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  TASK_STATUSES,
  TASK_STATUS_FACE,
  TASK_STATUS_SLIDER_STOPS,
  matchTaskStatuses,
  taskStatusSliderIndex,
  type TaskStatus,
} from '@/design-system/tokens/task-status';
import { StopSlider } from '@/design-system/primitives/StopSlider';
import { isTaskStatusReachable } from '@/lib/tasks/task-status';
import { cn } from '@/utils/_cn';

/** The board's `S`: the panel, anchored to whatever the board points at. */
export function TaskStatusPicker({
  open,
  anchorRef,
  current,
  onPick,
  onClose,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  current: TaskStatus;
  /** Only called with a status that differs from `current`. */
  onPick: (status: TaskStatus) => void;
  onClose: () => void;
}) {
  return (
    <AnchoredLayer open={open} onClose={onClose} anchorRef={anchorRef} placement="bottom-start" gap={4}>
      {/* Remounted per open: the filter and highlight start fresh every time. */}
      {open ? <TaskStatusMenu current={current} onPick={onPick} onClose={onClose} /> : null}
    </AnchoredLayer>
  );
}

function TaskStatusMenu({
  current,
  onPick,
  onClose,
}: {
  current: TaskStatus;
  onPick: (status: TaskStatus) => void;
  onClose: () => void;
}) {
  const listId = useId();
  const [find, setFind] = useState('');
  const matches = useMemo(() => matchTaskStatuses(find), [find]);
  const [highlight, setHighlight] = useState(() => Math.max(0, TASK_STATUSES.indexOf(current)));
  const active = matches[Math.min(highlight, matches.length - 1)] ?? null;
  const sliderIndex = taskStatusSliderIndex(current);

  const apply = (status: TaskStatus | null) => {
    if (!status || !isTaskStatusReachable(current, status)) return;
    if (status !== current) onPick(status);
    onClose();
  };

  return (
    <div
      data-testid="task-status-picker"
      className="flex w-72 flex-col gap-0.5 rounded-2xl border border-border-hairline bg-surface-card p-1.5 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.45)]"
    >
      <input
        autoFocus
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active ? `${listId}-${active}` : undefined}
        value={find}
        aria-label="Set status"
        onChange={(event) => {
          setFind(event.target.value);
          setHighlight(0);
        }}
        onKeyDown={(event) => {
          const digit = Number(event.key);
          if (event.key.length === 1 && digit >= 1 && digit <= TASK_STATUSES.length) {
            event.preventDefault();
            apply(TASK_STATUSES[digit - 1]!);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : matches.length - 1;
            setHighlight((at) => (Math.min(at, matches.length - 1) + step) % Math.max(1, matches.length));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            apply(active);
          }
        }}
        placeholder="Set status… (type or press a letter)"
        className="mb-0.5 rounded-xl bg-surface-sunken px-2.5 py-1.5 text-xs text-text-default outline-none placeholder:text-text-muted"
      />
      {/* The quick Not done · Pending · Done slider lives HERE, inside the status drop-down (owner 2026-10-03, M6 —
          the phone status sheet's grammar, ported): never a second status control on the record's Overview. */}
      {sliderIndex != null ? (
        <StopSlider
          stops={[0, 1, 2]}
          value={sliderIndex}
          onChange={(index) => apply(TASK_STATUS_SLIDER_STOPS[index]!.status)}
          ariaLabel="Quick status"
          formatValue={(index) => TASK_STATUS_SLIDER_STOPS[index]?.label ?? ''}
          showStops={false}
          compact
          className="mx-1 mb-1"
          data-testid="task-status-slider"
        />
      ) : null}
      <div id={listId} role="listbox" aria-label="Statuses" className="flex flex-col gap-0.5">
        {matches.map((status) => {
          const face = TASK_STATUS_FACE[status];
          const Icon = face.icon;
          const enabled = isTaskStatusReachable(current, status);
          return (
            <HoverTooltip key={status} label={face.label} shortcut={face.letter.toUpperCase()} placement="auto" focusable={false} asChild>
              <button
                id={`${listId}-${status}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={status === active}
                aria-disabled={!enabled}
                disabled={!enabled}
                onPointerMove={() => setHighlight(matches.indexOf(status))}
                onClick={() => apply(status)}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-2 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-60',
                  status === active && enabled ? 'bg-surface-hover' : null,
                )}
              >
                <Icon className={cn('size-3.5 shrink-0', face.ink)} aria-hidden strokeWidth={2.25} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-text-default">
                    {face.label}
                    {status === current ? <span className="text-[10px] font-medium text-text-muted">· current</span> : null}
                  </span>
                  <span className="truncate text-[11px] text-text-muted">{face.hint}</span>
                </span>
              </button>
            </HoverTooltip>
          );
        })}
        {matches.length === 0 ? <p className="px-2 py-1 text-xs text-text-muted">No status matches</p> : null}
      </div>
    </div>
  );
}
