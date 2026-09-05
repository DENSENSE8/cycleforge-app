'use client';

/**
 * Home Tasks Morphing — same left-start manifold as To-ship, different verbs.
 *
 * Do not edit MorphingRowActionMenu (typed to ShippedOrder). This sibling
 * shares the `cyc-82-morphing-action-menu` event so only one panel is open.
 */

import { useEffect, useId, useMemo, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { Popover } from '@/design-system/primitives/Popover';
import {
  MorphingMenuRow,
  MorphingMenuSeparator,
} from '@/design-system/primitives/MorphingMenuRow';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { AssigneeComboboxPanel } from '@/design-system/components/AssigneeCombobox';
import { getActiveStaff, type StaffMember } from '@/lib/staffCache';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import type { TaskRow } from '@/lib/ops-plans/types';
import type { OpsPlanTaskStatus } from '@/lib/ops-plans/constants';
import { pingStaffAboutTask } from './ping-task-staff';

const MENU_EVENT = 'cyc-82-morphing-action-menu';
type MenuView = 'actions' | 'assign' | 'people';

type ProjectMember = { staffId: number; name: string };

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function TaskMorphingRowActionMenu({
  task,
  open,
  onClose,
  anchorRef,
  onPatch,
  onComplete,
}: {
  task: TaskRow;
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  onPatch: (input: {
    status?: OpsPlanTaskStatus;
    assigneeStaffId?: number | null;
  }) => Promise<unknown>;
  onComplete: () => Promise<unknown>;
}) {
  const instanceId = useId();
  const [view, setView] = useState<MenuView>('actions');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffQuery, setStaffQuery] = useState('');
  const [staffReady, setStaffReady] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersReady, setMembersReady] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const memberIds = useMemo(() => new Set(members.map((row) => row.staffId)), [members]);

  const visibleStaff = useMemo(() => {
    const q = staffQuery.trim().toLowerCase();
    return staff.filter((row) => {
      if (!Number.isFinite(row.id) || row.id <= 0 || !row.name.trim()) return false;
      if (!q) return true;
      return row.name.toLowerCase().includes(q);
    });
  }, [staff, staffQuery]);

  useEffect(() => {
    if (!open) return;
    const onPeer = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id !== instanceId) onClose();
    };
    window.addEventListener(MENU_EVENT, onPeer);
    return () => window.removeEventListener(MENU_EVENT, onPeer);
  }, [open, instanceId, onClose]);

  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent(MENU_EVENT, { detail: instanceId }));
    setView('actions');
    setCancelArmed(false);
    setStaffQuery('');
    setStaffReady(false);
    setMembersReady(false);
    let cancelled = false;
    getActiveStaff()
      .then((roster) => {
        if (cancelled) return;
        setStaff(
          (Array.isArray(roster) ? roster : []).filter(
            (row) => Number.isFinite(row.id) && row.id > 0 && row.name.trim(),
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setStaffReady(true);
      });
    fetch(`/api/ops-plans/${task.planId}/members`)
      .then((res) => readJson<{ members: ProjectMember[] }>(res))
      .then((body) => {
        if (cancelled) return;
        setMembers(Array.isArray(body.members) ? body.members : []);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      })
      .finally(() => {
        if (!cancelled) setMembersReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, instanceId, task.planId]);

  const close = () => {
    setView('actions');
    setCancelArmed(false);
    setStaffQuery('');
    onClose();
  };

  const run = async (fn: () => Promise<unknown>, ok: string, stayOpen = false) => {
    try {
      await fn();
      toast.success(ok);
      if (!stayOpen) close();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update the task';
      toast.error(
        message === 'NOT_ASSIGNEE'
          ? 'Only the assignee can complete this task'
          : message === 'INVALID_TRANSITION'
            ? 'That status change is not allowed'
            : message,
      );
    }
  };

  const markDone = () => void run(() => onComplete(), 'Marked done');
  const markInProgress = () =>
    void run(() => onPatch({ status: 'in_progress' }), 'In progress', true);
  const markOpen = () => void run(() => onPatch({ status: 'open' }), 'Reopened', true);
  const markCanceled = async () => {
    if (!cancelArmed) {
      setCancelArmed(true);
      return;
    }
    await run(() => onPatch({ status: 'canceled' }), 'Canceled');
  };

  const pingAssignee = () => {
    if (task.assigneeStaffId == null) {
      setView('assign');
      return;
    }
    void run(
      () =>
        pingStaffAboutTask({
          recipientId: task.assigneeStaffId!,
          body: `Look at “${task.title}” on ${task.planTitle || 'Tasks'}.`,
          planId: task.planId,
          taskId: task.id,
        }),
      'Pinged',
    );
  };

  const commitAssignee = (row: { id: number; name: string }) => {
    void run(() => onPatch({ assigneeStaffId: row.id }), `Assigned to ${row.name}`);
  };

  const toggleMember = (row: { id: number; name: string }) => {
    void (async () => {
      try {
        if (memberIds.has(row.id)) {
          const res = await fetch(
            `/api/ops-plans/${task.planId}/members?staffId=${row.id}`,
            { method: 'DELETE' },
          );
          await readJson<{ success: boolean }>(res);
          setMembers((prev) => prev.filter((m) => m.staffId !== row.id));
          toast.success(`Removed ${row.name} from the project`);
          return;
        }
        const res = await fetch(`/api/ops-plans/${task.planId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staffId: row.id }),
        });
        const body = await readJson<{ member: ProjectMember }>(res);
        setMembers((prev) =>
          prev.some((m) => m.staffId === row.id)
            ? prev
            : [...prev, body.member ?? { staffId: row.id, name: row.name }],
        );
        toast.success(`Added ${row.name} to the project`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update project staff');
      }
    })();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const key = event.key;
      if (key === 'Escape') {
        event.preventDefault();
        if (view === 'assign' || view === 'people') {
          setView('actions');
          return;
        }
        close();
        return;
      }
      const target = event.target as HTMLElement | null;
      const inField = Boolean(
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'),
      );
      if (
        inField &&
        (view === 'assign' || view === 'people') &&
        !staffQuery.trim() &&
        /^[1-9]$/.test(key)
      ) {
        const row = visibleStaff[Number(key) - 1];
        if (row) {
          event.preventDefault();
          if (view === 'assign') commitAssignee(row);
          else toggleMember(row);
        }
        return;
      }
      if (inField) return;
      if (view === 'actions') {
        const hit: Record<string, () => void> = {
          d: markDone,
          i: markInProgress,
          o: markOpen,
          a: () => setView('assign'),
          m: () => setView('people'),
          p: pingAssignee,
          x: () => void markCanceled(),
        };
        const runKey = hit[key.toLowerCase()];
        if (runKey) {
          event.preventDefault();
          runKey();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const closed = task.status === 'done' || task.status === 'canceled';

  return (
    <Popover
      open={open}
      onClose={close}
      anchorRef={anchorRef}
      placement="right-start"
      gap={8}
      role="menu"
      aria-label="Task actions"
      data-testid="task-morphing-row-action-menu"
    >
      <motion.div
        layout
        className={cn(
          'p-1',
          view === 'assign' || view === 'people' ? 'min-w-[16rem]' : 'min-w-[15rem]',
        )}
        data-view={
          view === 'assign' ? 'assign-view' : view === 'people' ? 'people-view' : 'actions-view'
        }
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {view === 'actions' ? (
            <motion.div key="actions-view" layout className="flex flex-col gap-0.5">
              {task.status !== 'done' ? (
                <MorphingMenuRow
                  label="Done"
                  testId="task-morphing-done"
                  hotkey="D"
                  tone="success"
                  onClick={markDone}
                />
              ) : null}
              {!closed && task.status !== 'in_progress' ? (
                <MorphingMenuRow
                  label="In progress"
                  testId="task-morphing-in-progress"
                  hotkey="I"
                  tone="warning"
                  onClick={markInProgress}
                />
              ) : null}
              {task.status === 'in_progress' ? (
                <MorphingMenuRow
                  label="Open"
                  testId="task-morphing-open"
                  hotkey="O"
                  onClick={markOpen}
                />
              ) : null}
              <MorphingMenuSeparator />
              <MorphingMenuRow
                label="Assign"
                testId="task-morphing-assign"
                hint={task.assigneeName}
                hotkey="A"
                tone="accent"
                onClick={() => setView('assign')}
              />
              <MorphingMenuRow
                label="People"
                testId="task-morphing-people"
                hint={
                  membersReady
                    ? members.length === 1
                      ? '1 on project'
                      : `${members.length} on project`
                    : undefined
                }
                hotkey="M"
                tone="accent"
                onClick={() => setView('people')}
              />
              <MorphingMenuRow
                label="Ping"
                testId="task-morphing-ping"
                hint={task.assigneeName ? undefined : 'Assign first'}
                hotkey="P"
                tone="accent"
                onClick={pingAssignee}
              />
              {!closed ? (
                <>
                  <MorphingMenuSeparator />
                  <MorphingMenuRow
                    label={cancelArmed ? 'Cancel — press again' : 'Cancel'}
                    testId="task-morphing-cancel"
                    hotkey="X"
                    tone="danger"
                    onClick={() => void markCanceled()}
                  />
                </>
              ) : null}
            </motion.div>
          ) : view === 'people' ? (
            <motion.div key="people-view" layout>
              <AssigneeComboboxPanel
                query={staffQuery}
                onQueryChange={setStaffQuery}
                loading={!staffReady || !membersReady}
                emptyMessage="No staff match"
                roster={false}
                heading="Project staff"
                numbered
                rows={visibleStaff.map((row) => ({
                  id: row.id,
                  name: row.name,
                  selected: memberIds.has(row.id),
                  leading: <StaffAvatar staffId={row.id} name={row.name} size="xs" />,
                }))}
                onSelect={(row) => toggleMember(row)}
                onEscape={() => setView('actions')}
              />
            </motion.div>
          ) : (
            <motion.div key="assign-view" layout>
              <AssigneeComboboxPanel
                query={staffQuery}
                onQueryChange={setStaffQuery}
                loading={!staffReady}
                emptyMessage="No staff match"
                roster={false}
                heading="Assign"
                numbered
                rows={visibleStaff.map((row) => ({
                  id: row.id,
                  name: row.name,
                  selected: row.id === task.assigneeStaffId,
                  leading: <StaffAvatar staffId={row.id} name={row.name} size="xs" />,
                }))}
                onSelect={(row) => commitAssignee(row)}
                onEscape={() => setView('actions')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </Popover>
  );
}
