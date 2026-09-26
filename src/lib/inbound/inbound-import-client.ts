/**
 * Browser call for single-line inbound Add (purchase or return) —
 * `POST /api/receiving/inbound/import-purchase`. A return also files its
 * support ticket server-side; the ticket outcome rides back on the result.
 */

export interface InboundImportResult {
  created: boolean;
  /** Present on returns: whether the linked support ticket was filed. */
  ticket: { success: boolean; error: string | null; draftBody: string | null } | null;
  ticketNumber: string | null;
}

export async function postInboundImport(body: Record<string, unknown>): Promise<InboundImportResult> {
  const res = await fetch('/api/receiving/inbound/import-purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    created?: boolean;
    draftBody?: string;
    ticket?: { success?: boolean; error?: string; draftBody?: string };
    ticket_number?: string;
  } | null;
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || data?.draftBody || `Import failed (${res.status})`);
  }
  return {
    created: Boolean(data.created),
    ticket: data.ticket
      ? {
          success: Boolean(data.ticket.success),
          error: data.ticket.error ?? null,
          draftBody: data.ticket.draftBody ?? data.draftBody ?? null,
        }
      : null,
    ticketNumber: data.ticket_number ?? null,
  };
}
