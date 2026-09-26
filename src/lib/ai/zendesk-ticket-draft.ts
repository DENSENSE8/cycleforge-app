/** Generic LLM drafting for an internal Zendesk ticket (roadmap A-series). */

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

  const userText = [
    `Context: ${input.context}`,
    '',
    '--- TEMPLATE SUBJECT (improve, keep the facts) ---',
    input.template.subject,
    '',
    '--- TEMPLATE BODY (rewrite the prose, keep the reference lines) ---',
    input.template.description,
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
