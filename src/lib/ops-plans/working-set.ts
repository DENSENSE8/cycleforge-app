/**
 * Home Tasks working set — rows dropped onto the desk Ask mouth.
 *
 * Module store (same shape as the assistant context registry): last write wins
 * for React subscribers; Ask reads the list as the operator's "this / these".
 */

export const PROJECT_TASK_MIME = 'application/x-cycleforge-working-ref';

export interface WorkingTaskRef {
  id: string;
  title: string;
  planId: string;
  planTitle: string;
}

const refs: WorkingTaskRef[] = [];
const listeners = new Set<() => void>();
let snapshot: readonly WorkingTaskRef[] = [];

function emit(): void {
  snapshot = refs.slice();
  listeners.forEach((l) => l());
}

export function getWorkingTaskRefs(): readonly WorkingTaskRef[] {
  return snapshot;
}

export function subscribeWorkingTaskRefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addWorkingTaskRef(ref: WorkingTaskRef): void {
  const idx = refs.findIndex((row) => row.id === ref.id);
  if (idx >= 0) refs.splice(idx, 1);
  refs.push(ref);
  emit();
}

export function removeWorkingTaskRef(id: string): void {
  const idx = refs.findIndex((row) => row.id === id);
  if (idx < 0) return;
  refs.splice(idx, 1);
  emit();
}

export function clearWorkingTaskRefs(): void {
  if (refs.length === 0) return;
  refs.length = 0;
  emit();
}

let selected: WorkingTaskRef | null = null;

export function getSelectedWorkingTask(): WorkingTaskRef | null {
  return selected;
}

export function setSelectedWorkingTask(ref: WorkingTaskRef | null): void {
  selected = ref;
  emit();
}

export function parseWorkingTaskRef(raw: string): WorkingTaskRef | null {
  try {
    const value = JSON.parse(raw) as Partial<WorkingTaskRef>;
    if (!value || typeof value.id !== 'string' || typeof value.title !== 'string') return null;
    if (typeof value.planId !== 'string' || typeof value.planTitle !== 'string') return null;
    return {
      id: value.id,
      title: value.title,
      planId: value.planId,
      planTitle: value.planTitle,
    };
  } catch {
    return null;
  }
}
