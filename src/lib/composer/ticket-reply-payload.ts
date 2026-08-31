/**
 * The ONE builder for a Zendesk comment posted from a composer.
 *
 * Two hosts send ticket comments — the Support console chat composer and the
 * Unbox station Ticket composer — and before 2026-08-30 each carried its own
 * copy of the signature rule and only one of them knew about CCs. A reply that
 * is public from the station and public from the console must reach Zendesk as
 * the same payload; that is what this module is for.
 *
 * Photo attach (`photoIds` / `attachmentPreviews`) rides the same shape, so a
 * host that stages photos passes them through here rather than assembling a
 * second variant of the mutation vars.
 */

import { markdownToHtml } from '@/lib/support/markdown';
import { resolveComposerCcPayload } from './ticket-cc';
import type { SupportReplyVars } from '@/hooks/useSupportReply';

/**
 * Internal notes are signed with the staffer's name for exact attribution.
 * Public replies are not — the customer sees the Zendesk agent identity.
 * Idempotent: re-signing an already-signed body is a no-op.
 */
export function signComposerInternalNote(
  text: string,
  opts: { isPublic: boolean; staffName?: string | null },
): string {
  const staffName = (opts.staffName || '').trim();
  if (opts.isPublic || !staffName) return text;
  const sig = `— ${staffName}`;
  return text.trimEnd().endsWith(sig) ? text : `${text}\n\n${sig}`;
}

/**
 * Assemble the mutation vars for {@link useSupportReply}.
 *
 * Returns `null` when there is nothing to send, so a caller can use it as the
 * empty-draft guard instead of re-deriving one.
 */
export function buildComposerReplyVars(opts: {
  ticketId: number;
  body: string;
  isPublic: boolean;
  staffName?: string | null;
  staffId?: number | null;
  /** CC chips already committed (public replies only). */
  ccs?: readonly string[];
  /** Whatever is still in the CC input — folded in rather than dropped. */
  ccDraft?: string;
  photoIds?: readonly number[];
  attachmentPreviews?: ReadonlyArray<{ url: string; thumbUrl?: string }>;
}): SupportReplyVars | null {
  const text = opts.body.trim();
  if (!text) return null;
  const finalText = signComposerInternalNote(text, {
    isPublic: opts.isPublic,
    staffName: opts.staffName,
  });
  const emailCcs = resolveComposerCcPayload({
    isPublic: opts.isPublic,
    ccs: opts.ccs ?? [],
    draft: opts.ccDraft,
  });
  const photoIds = opts.photoIds?.length ? [...opts.photoIds] : undefined;
  const attachmentPreviews = opts.attachmentPreviews?.length
    ? opts.attachmentPreviews.map((p) => ({ url: p.url, thumbUrl: p.thumbUrl }))
    : undefined;
  return {
    ticketId: opts.ticketId,
    body: finalText,
    isPublic: opts.isPublic,
    htmlBody: markdownToHtml(finalText),
    ...(opts.staffId != null && opts.staffId > 0 ? { staffId: opts.staffId, staffName: opts.staffName } : {}),
    ...(emailCcs ? { emailCcs } : {}),
    ...(photoIds ? { photoIds } : {}),
    ...(attachmentPreviews ? { attachmentPreviews } : {}),
  };
}
