'use client';

/**
 * Home Tasks L2 — project record on the desk stage (Center Lock).
 *
 * Table stays mounted underneath. People live here so staff do not hunt
 * Morphing for the roster. Gutter Morphing stays the row verbs.
 */

import { useEffect, useMemo, useState } from 'react';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import { TriageScrollLayout } from '@/design-system/components/TriageScrollLayout';
import { InlineEditableValue } from '@/design-system/components/InlineEditableValue';
import { AssigneeComboboxPanel } from '@/design-system/components/AssigneeCombobox';
import { Button } from '@/design-system/primitives/Button';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { getActiveStaff, type StaffMember } from '@/lib/staffCache';
import { toast } from '@/lib/toast';
import type { OpsPlanTaskStatus } from '@/lib/ops-plans/constants';
import type { PlanRow, TaskRow } from '@/lib/ops-plans/types';

type ProjectMember = { staffId: number; name: string };

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function TasksProjectStageOverlay({
  open,
  planId,
  planTitle,
  task,
  onClose,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  indexLabel,
  onPlanTitle,
  onPatchTask,
  onCompleteTask,
}: {
  open: boolean;
  planId: string | null;
  planTitle: string;
  task: TaskRow | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  indexLabel?: string;
  onPlanTitle: (title: string) => void;
  onPatchTask: (body: {
    status?: OpsPlanTaskStatus;
    assigneeStaffId?: number | null;
  }) => Promise<unknown>;
  onCompleteTask: () => Promise<unknown>;
}) {
  const [title, setTitle] = useState(planTitle);
  const [progress, setProgress] = useState<PlanRow['progress'] | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [assignQuery, setAssignQuery] = useState('');
  const [staffReady, setStaffReady] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersReady, setMembersReady] = useState(false);
  const memberIds = useMemo(() => new Set(members.map((row) => row.staffId)), [members]);

  useEffect(() => {
    setTitle(planTitle);
  }, [planTitle, planId]);

  useEffect(() => {
    if (!open || !planId) return;
    let cancelled = false;
    setStaffReady(false);
    setMembersReady(false);
    setPeopleQuery('');
    setAssignQuery('');
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
    fetch(`/api/ops-plans/${planId}/members`)
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
    fetch(`/api/ops-plans/${planId}`)
      .then((res) => readJson<{ plan: PlanRow }>(res))
      .then((body) => {
        if (!cancelled) setProgress(body.plan?.progress ?? null);
      })
      .catch(() => {
        if (!cancelled) setProgress(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, planId]);

  const peopleStaff = useMemo(() => {
    const needle = peopleQuery.trim().toLowerCase();
    return staff.filter((row) => !needle || row.name.toLowerCase().includes(needle));
  }, [staff, peopleQuery]);
  const assignStaff = useMemo(() => {
    const needle = assignQuery.trim().toLowerCase();
    return staff.filter((row) => !needle || row.name.toLowerCase().includes(needle));
  }, [staff, assignQuery]);

  const saveTitle = async () => {
    const next = title.trim();
    if (!planId || !next || next === planTitle) return;
    try {
      await readJson<{ plan: PlanRow }>(
        await fetch(`/api/ops-plans/${planId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: next }),
        }),
      );
      onPlanTitle(next);
      toast.success('Project renamed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not rename');
      setTitle(planTitle);
    }
  };

  const toggleMember = (row: { id: number; name: string }) => {
    if (!planId) return;
    void (async () => {
      try {
        if (memberIds.has(row.id)) {
          const res = await fetch(`/api/ops-plans/${planId}/members?staffId=${row.id}`, {
            method: 'DELETE',
          });
          await readJson<{ success: boolean }>(res);
          setMembers((prev) => prev.filter((m) => m.staffId !== row.id));
          toast.success(`Removed ${row.name} from the project`);
          return;
        }
        const res = await fetch(`/api/ops-plans/${planId}/members`, {
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

  const runTask = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the task');
    }
  };

  const closed = task?.status === 'done' || task?.status === 'canceled';
  const subtitle =
    progress == null
      ? undefined
      : `${progress.doneTasks} of ${progress.totalTasks} done`;

  return (
    <DeskStageOverlay
      open={open && Boolean(planId)}
      onClose={onClose}
      title={planTitle || 'Project'}
      subtitle={subtitle}
      indexLabel={indexLabel}
      onPrev={onPrev}
      onNext={onNext}
      prevDisabled={prevDisabled}
      nextDisabled={nextDisabled}
      fill="stage"
      closeOnScrim={false}
      testId="tasks-project-stage-overlay"
    >
      <TriageScrollLayout
        sections={[
          {
            id: 'identity',
            label: 'Project',
            children: (
              <InlineEditableValue
                value={title}
                placeholder="Project name"
                onChange={setTitle}
                onBlur={() => void saveTitle()}
                onSubmit={() => void saveTitle()}
                showEditIcon
              />
            ),
          },
          {
            id: 'people',
            label: 'People on this project',
            children: (
              <div className="flex flex-col gap-3">
                {members.length > 0 ? (
                  <ul className="flex flex-col gap-1.5">
                    {members.map((member) => (
                      <li
                        key={member.staffId}
                        className="flex items-center gap-2 text-role-body text-text-default"
                      >
                        <StaffAvatar
                          staffId={member.staffId}
                          name={member.name}
                          size="xs"
                        />
                        {member.name}
                      </li>
                    ))}
                  </ul>
                ) : membersReady ? (
                  <p className="text-role-caption text-text-soft">
                    Nobody on this project yet. Add staff below.
                  </p>
                ) : null}
                <AssigneeComboboxPanel
                  query={peopleQuery}
                  onQueryChange={setPeopleQuery}
                  loading={!staffReady || !membersReady}
                  emptyMessage="No staff match"
                  roster={false}
                  heading="Add or remove"
                  numbered
                  rows={peopleStaff.map((row) => ({
                    id: row.id,
                    name: row.name,
                    selected: memberIds.has(row.id),
                    leading: <StaffAvatar staffId={row.id} name={row.name} size="xs" />,
                  }))}
                  onSelect={(row) => toggleMember(row)}
                />
              </div>
            ),
          },
          ...(task
            ? [
                {
                  id: 'task',
                  label: 'This task',
                  children: (
                    <div className="flex flex-col gap-3">
                      <p className="text-role-body text-text-default">{task.title}</p>
                      <p className="text-role-caption text-text-soft">
                        {task.assigneeName ? `Assigned to ${task.assigneeName}` : 'Unassigned'}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {task.status !== 'done' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void runTask(() => onCompleteTask(), 'Marked done')}
                          >
                            Done
                          </Button>
                        ) : null}
                        {!closed && task.status !== 'in_progress' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              void runTask(
                                () => onPatchTask({ status: 'in_progress' }),
                                'In progress',
                              )
                            }
                          >
                            In progress
                          </Button>
                        ) : null}
                        {task.status === 'in_progress' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              void runTask(() => onPatchTask({ status: 'open' }), 'Reopened')
                            }
                          >
                            Open
                          </Button>
                        ) : null}
                      </div>
                      <AssigneeComboboxPanel
                        query={assignQuery}
                        onQueryChange={setAssignQuery}
                        loading={!staffReady}
                        emptyMessage="No staff match"
                        roster={false}
                        heading="Assign"
                        numbered
                        rows={assignStaff.map((row) => ({
                          id: row.id,
                          name: row.name,
                          selected: row.id === task.assigneeStaffId,
                          leading: <StaffAvatar staffId={row.id} name={row.name} size="xs" />,
                        }))}
                        onSelect={(row) =>
                          void runTask(
                            () => onPatchTask({ assigneeStaffId: row.id }),
                            `Assigned to ${row.name}`,
                          )
                        }
                      />
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </DeskStageOverlay>
  );
}
