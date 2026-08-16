/**
 * Client helper: post an internal note (or public reply) to a helpdesk ticket
 * via the shared photo-ticket chokepoint. Used by QC / AI summary callers that
 * are not mounted inside {@link useSupportReply}'s composer.
 *
 * Never uses VendorView DOM injection.
 */

export async function postTicketComment(opts: {
  ticketId: number;
  body: string;
  /** Default false = internal note. */
  isPublic?: boolean;
  htmlBody?: string;
}): Promise<{ ok: true; attached: number } | { ok: false; error: string }> {
  const fd = new FormData();
  fd.append(
    'meta',
    JSON.stringify({
      mode: 'update',
      ticketId: opts.ticketId,
      comment: opts.body,
      htmlBody: opts.htmlBody,
      isPublic: opts.isPublic ?? false,
    }),
  );
  try {
    const res = await fetch('/api/zendesk/photo-ticket', { method: 'POST', body: fd });
    const data = (await res.json().catch(() => null)) as
      | { success?: boolean; error?: string; message?: string; attached?: number }
      | null;
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: data?.error || data?.message || `Failed to send (${res.status})`,
      };
    }
    return { ok: true, attached: data.attached ?? 0 };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Convenience: always `public: false` internal note (QC / AI summaries). */
export async function postTicketInternalNote(
  ticketId: number,
  body: string,
): Promise<{ ok: true; attached: number } | { ok: false; error: string }> {
  return postTicketComment({ ticketId, body, isPublic: false });
}
