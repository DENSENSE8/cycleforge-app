export async function pingStaffAboutTask(opts: {
  recipientId: number;
  body: string;
  planId?: string;
  taskId?: string;
}): Promise<void> {
  const res = await fetch('/api/staff-messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientId: opts.recipientId,
      body: opts.body,
      kind: 'note',
      context: {
        surface: 'home-tasks',
        ...(opts.planId ? { planId: opts.planId } : {}),
        ...(opts.taskId ? { taskId: opts.taskId } : {}),
      },
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${res.status}`);
  }
}
