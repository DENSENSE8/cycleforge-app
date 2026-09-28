/**
 * Client writers for the QC assignment (`receiving_line_testing.assigned_tech_id`):
 * one receiving line from the QC bench, or every origin line behind an order.
 */

async function patchJson(url: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error || `Assign failed (${res.status})`);
  }
}

/** Assign (or clear, `null`) the QC tech of one receiving line. */
export function patchLineQcAssignee(lineId: number, techId: number | null): Promise<void> {
  return patchJson('/api/receiving-lines', { id: lineId, assigned_tech_id: techId });
}

/** Assign (or clear, `null`) the QC tech on the origin lines of an order's allocated units. */
export function patchOrderQcAssignee(orderId: number, techId: number | null): Promise<void> {
  return patchJson('/api/receiving-lines/qc-assignee', { order_id: orderId, assigned_tech_id: techId });
}
