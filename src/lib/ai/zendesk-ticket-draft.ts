/**
 * Generic LLM drafting for an internal Zendesk ticket (roadmap A-series).
 *
 * Takes a deterministic ticket template + a short context label and asks the
 * local Hermes model to rewrite it into clearer, more professional prose.
 * Ticket surfaces that need a Hermes rewrite (unfound queue, etc.) use this
 * module.
 *
 * Discipline (mirrors `extract-llm.ts`): local gateway only, forced single tool
 * call, temperature 0 (inside `hermesToolCall`). The model rewrites PROSE only —
 * it must not invent or alter facts. The result is a DRAFT the operator reviews
 * and edits before the ticket is filed.
 */

import { hermesToolCall } from '@/lib/ai/hermes-tool-call';
import type { OrgId } from '@/lib/tenancy/constants';

const TOOL_NAME = 'report_ticket_draft';

const SYSTEM_PROMPT = [
  'You write clear, professional internal support tickets for a warehouse',
  'operations team (Zendesk). You are given a short CONTEXT label and a factual',
  'TEMPLATE already filled from our records. Rewrite it into a cleaner ticket.',
  '',
  'Rules:',
  '- NEVER invent, drop, or change facts. Keep every identifier, reference,',
  '  serial number, and labeled reference line exactly as in the template.',
  '- Improve clarity and flow; turn terse fragments into complete sentences.',
  '- Keep the labeled reference lines (the "Label: value" lines) intact.',
  '- Tone: factual, neutral, professional. No blame, slang, or internal jargon.',
  '- Subject: one concise line a support agent can scan (≤ ~90 chars).',
  '',
  `Call the \`${TOOL_NAME}\` tool exactly once and stop. Do not reply with prose.`,
].join('\n');

export interface TicketDraftInput {
  /** Short label of what this ticket is, e.g. "Unfound item — PO Mailbox". */
  context: string;
  /** Deterministic template — authoritative facts the model must preserve. */
  template: { subject: string; description: string };
  /**
   * Identifiers the caller's fact guard will REJECT the draft for losing.
   *
   * "Keep every identifier" in the system prompt is a rule about a category;
   * this is the list. Without it the caller checks an invariant the model was
   * never told, which is how a draft that reads perfectly gets thrown away for
   * dropping a tracking number that only ever appeared in the subject line.
   * Blank/duplicate entries are dropped.
   */
  mustKeep?: readonly (string | null | undefined)[];
}

export interface TicketDraftResult {
  subject: string;
  description: string;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
  };
}

interface DraftToolArgs {
  subject?: unknown;
  description?: unknown;
}

export async function draftTicketWithLlm(
  /** Tenant whose AI provider serves this call — required, never defaulted. */
  orgId: OrgId,
  input: TicketDraftInput,
): Promise<TicketDraftResult> {

  const mustKeep = [
    ...new Set((input.mustKeep ?? []).map((v) => (v ?? '').trim()).filter(Boolean)),
  ];

  const userText = [
    `Context: ${input.context}`,
    '',
    '--- TEMPLATE SUBJECT (improve, keep the facts) ---',
    input.template.subject,
    '',
    '--- TEMPLATE BODY (rewrite the prose, keep the reference lines) ---',
    input.template.description,
    ...(mustKeep.length
      ? [
          '',
          '--- MUST APPEAR VERBATIM (in the subject or the body) ---',
          ...mustKeep.map((v) => `- ${v}`),
          '',
          'A draft missing any of the strings above is rejected and discarded.',
        ]
      : []),
  ].join('\n');

  const { args, model, usage } = await hermesToolCall<DraftToolArgs>({
    orgId,
    systemPrompt: SYSTEM_PROMPT,
    userText,
    maxTokens: 1200,
    tool: {
      name: TOOL_NAME,
      description: 'Report the rewritten ticket subject and body.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          subject: {
            type: 'string',
            description: 'Concise, professional ticket subject.',
          },
          description: {
            type: 'string',
            description: 'Rewritten ticket body: clear prose + the intact reference lines.',
          },
        },
        required: ['subject', 'description'],
      },
    },
  });

  const subject = typeof args.subject === 'string' ? args.subject.trim() : '';
  const description = typeof args.description === 'string' ? args.description.trim() : '';
  if (!subject || !description) {
    throw new Error(`Model "${model}" returned an empty subject or body`);
  }

  return { subject, description, model, usage };
}
