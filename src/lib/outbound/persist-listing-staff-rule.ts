/**
 * Client write for the repeating item-number → picker/packer rule.
 * Same POST as the To-ship "Listing → staff" overlay.
 */

export async function persistListingStaffRule(args: {
  orderId: number;
  techId: number;
  packerId: number;
}): Promise<{ ok: true; rulesUpserted: number } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/automations/listing-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderIds: [args.orderId],
        mode: 'save_and_assign',
        techId: args.techId,
        packerId: args.packerId,
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: string;
      rulesUpserted?: number;
    } | null;
    if (!res.ok || !body?.success) {
      return { ok: false, error: body?.error || `Could not save the rule (${res.status})` };
    }
    return { ok: true, rulesUpserted: Number(body.rulesUpserted) || 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save the rule' };
  }
}
