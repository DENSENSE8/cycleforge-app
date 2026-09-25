'use client';

let open = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeReturnIntake(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReturnIntakeSnapshot(): boolean {
  return open;
}

export function openReturnIntake(): void {
  if (open) return;
  open = true;
  emit();
}

export function closeReturnIntake(): void {
  if (!open) return;
  open = false;
  emit();
}
