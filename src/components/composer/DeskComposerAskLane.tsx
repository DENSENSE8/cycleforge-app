'use client';

/**
 * Desk Field — the one mouth on a desk that has no floor-station host.
 *
 * Placement is {@link useDeskField} (over `deskFieldPlacement`): station mouths
 * win, phone and public resolvers stand it down, every other desk mounts it.
 * The mode never decides whether the field exists — only what the next input
 * writes to.
 *
 * `variant="page-column"` is the BODY of `DeskPageChrome`'s lead column: the
 * chrome owns the title, the tab band and the one shared card, so this file
 * paints the mouth and nothing else. `variant="foot"` docks under a workspace
 * that already has a left rail.
 *
 * Home → Tasks adds Staff as `modeRowLeading` (not a new STATION_COMPOSER_MODES
 * id) and accepts dropped compound rows as Ask working-set context.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { StationComposerHost } from '@/components/composer/StationComposerHost';
import { useDeskField } from '@/components/composer/useDeskField';
import { isOrdersDeskPath } from '@/lib/composer/desk-field';
import {
  registerDeskLeadPaneMouth,
  useStationComposerDeskCount,
} from '@/lib/composer/station-composer-presence';
import {
  dispatchComposerAskMode,
  isComposerAskLatched,
  readStationComposerModeSession,
  stationComposerArrivalMode,
} from '@/lib/composer/station-composer-mode';
import { cn } from '@/utils/_cn';
import { User, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives/IconButton';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cursorClickTarget } from '@/design-system/motion/cursor-scrub';
import { registerAssistantContext } from '@/lib/assistant/context-store';
import { getActiveStaff } from '@/lib/staffCache';
import { mentionTokens, resolveMentions } from '@/lib/ops-plans/mentions';
import {
  PROJECT_TASK_MIME,
  addWorkingTaskRef,
  getSelectedWorkingTask,
  getWorkingTaskRefs,
  parseWorkingTaskRef,
  removeWorkingTaskRef,
  subscribeWorkingTaskRefs,
} from '@/lib/ops-plans/working-set';
import { pingStaffAboutTask } from '@/features/tasks/ping-task-staff';
import { toast } from '@/lib/toast';

export const DESK_ASK_PANE_TITLE = 'Ask';

export type DeskComposerAskLaneProps = {
  variant?: 'foot' | 'page-column';
  className?: string;
};

function useWorkingSet() {
  const dropped = useSyncExternalStore(
    subscribeWorkingTaskRefs,
    getWorkingTaskRefs,
    getWorkingTaskRefs,
  );
  const selected = useSyncExternalStore(
    subscribeWorkingTaskRefs,
    getSelectedWorkingTask,
    getSelectedWorkingTask,
  );
  return { dropped, selected };
}

export function DeskComposerAskLane({
  variant = 'foot',
  className,
}: DeskComposerAskLaneProps) {
  const pathname = usePathname();
  const placement = useDeskField();
  const isColumn = variant === 'page-column';
  const leadPaneMouths = useStationComposerDeskCount();
  const [note, setNote] = useState('');
  const [staffTalk, setStaffTalk] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const { dropped, selected } = useWorkingSet();
  // The project-task working set. Was `/?mode=tasks`; the desk moved to its own
  // `/tasks` route on 2026-09-05 when `/` became the assistant surface.
  const isTasksDesk = pathname === '/tasks' || pathname.startsWith('/tasks/');

  const onNote = useCallback((next: string) => setNote(next), []);

  const onCommit = useCallback(() => {}, []);

  const onStaffCommit = useCallback(async () => {
    const text = note.trim();
    if (!text) return;
    const tokens = mentionTokens(text);
    if (tokens.length === 0) {
      toast.error('Name someone with @Name');
      return;
    }
    const staff = await getActiveStaff();
    const hits = resolveMentions(tokens, staff);
    if (hits.length === 0) {
      toast.error('No staff matched that @mention');
      return;
    }
    const target = selected ?? dropped[dropped.length - 1] ?? null;
    try {
      for (const hit of hits) {
        await pingStaffAboutTask({
          recipientId: hit.id,
          body: text,
          planId: target?.planId,
          taskId: target?.id,
        });
      }
      if (target && hits[0]) {
        await fetch(`/api/ops-plans/tasks/${target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigneeStaffId: hits[0].id }),
        });
      }
      toast.success(hits.length === 1 ? `Pinged ${hits[0]!.name}` : `Pinged ${hits.length} people`);
      setNote('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not ping');
    }
  }, [dropped, note, selected]);

  useEffect(() => {
    if (!isTasksDesk) setStaffTalk(false);
  }, [isTasksDesk]);

  useEffect(() => {
    if (!isColumn) return undefined;
    return registerDeskLeadPaneMouth();
  }, [isColumn]);

  useEffect(() => {
    if (!isOrdersDeskPath(pathname ?? '/')) return;
    if (!isComposerAskLatched(readStationComposerModeSession())) return;
    dispatchComposerAskMode(stationComposerArrivalMode());
  }, [pathname]);

  useEffect(() => {
    if (!isTasksDesk) return undefined;
    const working = dropped.map((row) => `• ${row.title} (${row.planTitle})`).join('\n');
    const picked = selected ? `${selected.title} (${selected.planTitle})` : 'none';
    return registerAssistantContext({
      page: 'home',
      mode: 'tasks',
      selection: selected ? { kind: 'ops-plan-task', id: selected.id } : null,
      skill: [
        'The operator is on Home → Tasks, the org project-task desk (ops_plan_tasks), not personal staff_todos.',
        `Selected task: ${picked}.`,
        working
          ? `Working set (dropped onto Ask):\n${working}`
          : 'Working set is empty. Drag a table row onto this composer to attach it.',
        'When they say "this" or "these", prefer the working set, then the selected row.',
      ].join('\n'),
    });
  }, [dropped, isTasksDesk, selected]);

  if (!placement.mount) return null;
  if (!isColumn && leadPaneMouths > 0) return null;

  const staffFace = isTasksDesk ? (
    <button
      type="button"
      aria-label="Composer mode · Staff"
      aria-pressed={staffTalk}
      data-testid="composer-mode-staff"
      {...cursorClickTarget('Staff')}
      onClick={() => setStaffTalk((on) => !on)}
      className={cn(
        'ds-raw-button flex h-5 items-center gap-0.5 rounded-sm pr-1.5 text-role-micro font-semibold leading-none',
        staffTalk ? 'text-text-default' : 'text-text-faint',
        focusRing('control', 'accent'),
      )}
    >
      <span className="flex h-5 w-3.5 shrink-0 items-center justify-center" aria-hidden>
        <User className={cn('block h-3.5 w-3.5 shrink-0', staffTalk ? 'text-blue-600' : 'text-text-faint')} />
      </span>
      <span className="tracking-wide">Staff</span>
    </button>
  ) : undefined;

  return (
    <div
      className={cn(
        !isColumn && 'shrink-0 border-t border-border-hairline bg-surface-card',
        isColumn && 'mt-auto',
        dragOver && 'bg-surface-hover',
        className,
      )}
      data-testid="desk-composer-ask-lane"
      onDragOver={
        isTasksDesk
          ? (event) => {
              if (![PROJECT_TASK_MIME, 'text/plain'].some((type) => event.dataTransfer.types.includes(type))) {
                return;
              }
              event.preventDefault();
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={isTasksDesk ? () => setDragOver(false) : undefined}
      onDrop={
        isTasksDesk
          ? (event) => {
              event.preventDefault();
              setDragOver(false);
              const raw =
                event.dataTransfer.getData(PROJECT_TASK_MIME) || event.dataTransfer.getData('text/plain');
              const ref = parseWorkingTaskRef(raw);
              if (ref) addWorkingTaskRef(ref);
            }
          : undefined
      }
    >
      {isTasksDesk && dropped.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-2 pt-2" data-testid="desk-ask-working-set">
          {dropped.map((row) => (
            <span
              key={row.id}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-surface-sunken px-1.5 py-0.5 text-role-micro text-text-muted"
            >
              <span className="truncate">{row.title}</span>
              <IconButton
                type="button"
                size="xs"
                tone="neutral"
                icon={<X className="h-3 w-3" />}
                ariaLabel={`Remove ${row.title} from Ask`}
                onClick={() => removeWorkingTaskRef(row.id)}
              />
            </span>
          ))}
        </div>
      ) : null}
      <StationComposerHost
        presenceKind="desk"
        labelValue={note}
        onLabelChange={onNote}
        onLabelCommit={staffTalk ? () => void onStaffCommit() : onCommit}
        labelPlaceholder={
          staffTalk
            ? 'Ping @Name about this task…'
            : isTasksDesk
              ? 'Ask about the selected or dropped tasks…'
              : placement.placeholder
        }
        chrome="raised"
        animateMount={false}
        showModeFaces={false}
        modeRowLeading={staffFace}
      />
    </div>
  );
}
