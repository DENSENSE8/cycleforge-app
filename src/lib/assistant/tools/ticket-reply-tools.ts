/**
 * draft_ticket_reply — assistant read tool (pilot verb, session surface).
 *
 * Produces a DRAFT reply for a support ticket. It writes nothing: the draft
 * comes back to the model, which shows it as a ticket_reply_draft artifact and
 * the USER sends it (Enter) — the send goes through the same photo-ticket
 * chokepoint the hands-on support console uses, under the user's own session.
 * The agent can draft; only the human can send.
 *
 * Deterministic facts (subject, status, identifiers) go into the template and
 * the mustKeep guard so a fluent draft can't quietly drop a tracking number.
 */

import { z } from 'zod';
import { draftTicketWithLlm } from '@/lib/ai/zendesk-ticket-draft';
import type { AssistantToolCtx, AssistantToolDef, AssistantToolDeps } from './types';

/** Identifiers worth dying for: anything that looks like a tracking/order/serial token. */
const IDENTIFIER_PATTERN = /[A-Z0-9]{6,}|\b\d{4,}\b/g;

function collectIdentifiers(...texts: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(IDENTIFIER_PATTERN)) out.add(match[0]);
  }
  return [...out];
}

export const draftTicketReplyTool: AssistantToolDef<
  z.ZodObject<{ ticketId: z.ZodNumber; extraContext: z.ZodOptional<z.ZodString> }>,
  unknown
> = {
  name: 'draft_ticket_reply',
  description:
    'Draft a reply to a support ticket (does NOT send). Returns { subject, body } for a ticket_reply_draft artifact — render that artifact and the user sends it with Enter. Use resolve_support_ticket or get_ticket_entities first to pick the ticket.',
  permission: 'integrations.zendesk',
  inputSchema: z.object({
    ticketId: z.number().int().positive(),
    extraContext: z.string().max(2000).optional(),
  }),
  run: async (input, ctx: AssistantToolCtx, deps: AssistantToolDeps) => {
    if (!deps.getSupportTicket) {
      return { ok: false as const, error: 'ticket lookup unavailable' };
    }
    const ticket = await deps.getSupportTicket(ctx.organizationId, input.ticketId);
    if (!ticket) return { ok: false as const, error: `ticket ${input.ticketId} not found` };

    const template = {
      subject: ticket.subjectCache?.trim() || `Ticket #${ticket.externalTicketId ?? ticket.id}`,
      description: [
        `Write a reply to support ticket #${ticket.externalTicketId ?? ticket.id}.`,
        ticket.statusCache ? `Current status: ${ticket.statusCache}.` : null,
        input.extraContext ? `What the reply should cover: ${input.extraContext}` : null,
      ]
        .filter(Boolean)
        .join(' '),
    };
    const mustKeep = collectIdentifiers(ticket.subjectCache, input.extraContext);

    const draft = await draftTicketWithLlm(ctx.organizationId, {
      context: template.description,
      template,
      mustKeep,
    });
    return {
      ok: true as const,
      ticketId: input.ticketId,
      subject: draft.subject,
      body: draft.description ?? draft.subject,
      model: draft.model,
    };
  },
};
