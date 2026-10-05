/**
 * The Support drafting prompt — pure. One standard for every reply and
 * check-in, adapted per channel; built only from the local context.
 */
import type { RagQueryResult } from '@/lib/ai/nemoclaw-rag';
import type { SearchHit } from '@/lib/search/search-hit';
import {
  SUPPORT_CHANNEL_LABEL,
  type SupportChannel,
  type SupportDraftCitation,
  type SupportDraftKind,
} from '@/lib/support/conversation/model';
import { isMarketplaceChannel, MARKETPLACE_MAX_LENGTH } from '@/lib/support/conversation/marketplace-policy';
import { renderEvidenceForPrompt } from '@/lib/support/photo-evidence';
import { supportReplyPersonaClause, type SupportReplyPersona } from '@/lib/support/reply-persona';
import {
  newestInboundMessage,
  orderFacts,
  type SupportDraftContext,
  type SupportDraftFact,
  type SupportDraftMessage,
} from './context';

/** Recent turns the model sees; older context costs tokens and drifts the reply. */
const THREAD_TURNS = 20;
/** One pasted email chain must not crowd out the rest of the conversation. */
const MESSAGE_CHARS = 1500;

const WEEKDAY_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

function channelRule(channel: SupportChannel): string {
  const label = SUPPORT_CHANNEL_LABEL[channel];
  if (isMarketplaceChannel(channel)) {
    const max = MARKETPLACE_MAX_LENGTH[channel];
    return (
      `This reply is sent through ${label} messaging: no links, no email addresses, no phone numbers, ` +
      `and never ask the customer to contact us outside ${label}` +
      `${max ? `; stay well under ${max} characters` : ''}.`
    );
  }
  if (channel === 'phone' || channel === 'walk_in') {
    return 'We spoke with this customer in person or by phone; write the follow-up message we send them, very short.';
  }
  return 'This is an email-style reply: a short greeting with the customer\u2019s first name (when known) is fine.';
}

const COMMON_RULES = [
  'Use ONLY the conversation and the facts below. If they do not answer the question, say plainly that we will check and get back to them, or ask for the one missing detail.',
  'Never state a part size, quantity, measurement, spec, model number, price, date or time frame unless those exact words appear in the conversation or the facts below. If the customer asks for one we do not have, say we will check it for them — do not guess.',
  'Never say an action happened (refund issued, shipped, delivered, replaced, repaired, warranty approved) unless a fact below says it happened. Keep "will", "may", "planned" and "pending" as future or uncertain — never turn them into done.',
  'Never promise to send, ship, refund, replace or repair anything unless a fact or staff note below says we will. Otherwise say we will look into it and follow up.',
  'Never invent order numbers, tracking numbers or policies. Write a weekday next to a date only when the calendar confirms it; today\u2019s date is given.',
  'No policy jargon or internal terms (statuses, SKU codes, system names, RMA) unless the customer used them.',
  'Internal notes are for your understanding only: never quote them or reveal what they say about our internal process.',
  'Do not open with an apology. Never ask the customer to contact us, reach out or get in touch — they already are talking to us. Never write "let us know when you\u2019re ready".',
  'Plain text ready to send: no subject line, no signature, no sign-off, no [placeholders] or {{templates}}.',
];

/** The system prompt: who answers, for whom, and the drafting standard. */
export function buildSupportDraftSystemPrompt(
  persona: SupportReplyPersona | null | undefined,
  opts: { kind: SupportDraftKind; channel: SupportChannel },
): string {
  const who =
    'You are a customer support specialist with 15+ years of e-commerce experience, ' +
    `answering customers for ${supportReplyPersonaClause(persona)}.`;
  const task =
    opts.kind === 'check_in'
      ? [
          'Write ONE short paragraph (2-3 sentences): a professional post-purchase check-in.',
          'Name the customer (when known), the product and the order number exactly as the facts give them.',
          'Ask how everything is going and invite them to reply here if they need anything.',
          'State nothing about delivery, refunds, replacements, repairs or warranty beyond what the facts list.',
        ]
      : [
          'Write ONE short paragraph (2-4 sentences): the next reply to the customer.',
          'Your first sentence answers the customer\u2019s actual question directly, using only the facts.',
          'Then give the single clearest next step — what we will check or do, or the one thing they should do.',
          'Ask only for information genuinely missing from the facts; never ask for anything the facts already contain (such as a linked order number).',
          'A brief acknowledgement is fine; no apology, no filler, no closing pleasantries.',
        ];
  const rules = [...task, ...COMMON_RULES, channelRule(opts.channel)];
  return `${who}\n\nRules:\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
}

function clip(text: string): string {
  const t = text.trim();
  return t.length > MESSAGE_CHARS ? `${t.slice(0, MESSAGE_CHARS)}…` : t;
}

function speaker(m: SupportDraftMessage): string {
  if (m.direction === 'inbound') return 'Customer';
  if (m.direction === 'internal') return 'INTERNAL NOTE (never quote)';
  if (m.deliveryState === 'failed') return 'Us (NOT delivered)';
  if (m.deliveryState === 'copied' || m.deliveryState === 'pending') return 'Us (prepared, not confirmed sent)';
  return 'Us';
}

/**
 * The inbound messages since our last delivered reply — what the draft must
 * answer. Falls back to the newest inbound.
 */
export function unansweredInbound(messages: readonly SupportDraftMessage[]): SupportDraftMessage[] {
  let lastReply = -1;
  messages.forEach((m, i) => {
    if (m.direction === 'outbound' && (m.deliveryState === 'sent' || m.deliveryState === 'logged' || m.deliveryState == null)) lastReply = i;
  });
  const after = messages.slice(lastReply + 1).filter((m) => m.direction === 'inbound');
  if (after.length) return after;
  const latest = newestInboundMessage(messages);
  return latest ? [latest] : [];
}

const FACT_HEADINGS: ReadonlyArray<[SupportDraftCitation['type'], string]> = [
  ['repair', 'Repairs'],
  ['receiving', 'Receiving (what came back to us)'],
  ['serial', 'Serial units'],
  ['sku', 'Products and warranty'],
  ['manual', 'Product manuals on file'],
  ['rag', 'Related records'],
  [
    'past_reply',
    'How we answered similar resolved conversations (tone and approach only — their facts are NOT about this customer)',
  ],
];

function renderFacts(facts: readonly SupportDraftFact[]): string {
  const blocks: string[] = [];
  for (const [type, heading] of FACT_HEADINGS) {
    const group = facts.filter((f) => f.citation.type === type);
    if (group.length) blocks.push(`${heading}:\n${group.map((f) => `- ${f.text}`).join('\n')}`);
  }
  return blocks.join('\n\n');
}

export interface SupportDraftPromptInput {
  context: SupportDraftContext;
  kind: SupportDraftKind;
  persona?: SupportReplyPersona | null;
  /** Service-documentation grounding (NemoClaw), when it answered. */
  rag?: RagQueryResult | null;
  /** Retrieved records not already linked (hybrid search). */
  records?: SearchHit[];
}

export function buildSupportDraftPrompt(input: SupportDraftPromptInput): { system: string; user: string } {
  const { context, kind } = input;
  const { item } = context;
  const answer = kind === 'reply' ? unansweredInbound(context.messages) : [];
  const answerIds = new Set(answer.map((m) => m.id));
  const earlier = context.messages.filter((m) => !answerIds.has(m.id)).slice(-THREAD_TURNS);

  const customer = [item.requesterName, item.requesterHandle && `(${item.requesterHandle})`].filter(Boolean).join(' ');
  const header = [
    `Today: ${WEEKDAY_FMT.format(new Date(`${context.today}T00:00:00Z`))} (${context.today}).`,
    `Channel: ${SUPPORT_CHANNEL_LABEL[item.channel]}${item.accountLabel ? ` · account ${item.accountLabel}` : ''}.`,
    customer ? `Customer: ${customer}.` : 'Customer name: not on record.',
    item.subject ? `Subject: ${item.subject}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const thread = earlier.length
    ? `Conversation so far (oldest first):\n${earlier.map((m) => `[${m.occurredAt.slice(0, 10)}] ${speaker(m)}: ${clip(m.body)}`).join('\n\n')}`
    : '';

  const question =
    kind === 'check_in'
      ? 'The customer has not written to us about this order yet.'
      : answer.length > 1
        ? `Customer messages since our last reply (answer all of them):\n${answer.map((m) => `[${m.occurredAt.slice(0, 10)}] ${clip(m.body)}`).join('\n\n')}`
        : answer.length === 1
          ? `Latest customer message (the one you are answering):\n${clip(answer[0].body)}`
          : 'There is no customer message; the case was logged by our staff. Write our next message to the customer about it.';

  const orders = orderFacts(context.orders);
  const ordersBlock = orders.length
    ? `Linked orders (already known — never ask the customer for the order number):\n${orders.map((f) => `- ${f.text}`).join('\n')}`
    : 'Linked orders: none — no order is linked to this conversation.';

  const recordFacts: SupportDraftFact[] = (input.records ?? []).map((h) => ({
    citation: { type: 'rag', label: `${h.entityType} · ${h.title}`, ref: null },
    text: `${h.entityType} — ${h.title}${h.subtitle ? ` (${h.subtitle})` : ''} (mention only if it clearly matches)`,
  }));

  const rag = input.rag?.answer?.trim()
    ? `Service documentation:\n${input.rag.answer.trim()}`
    : '';

  const user = [
    header,
    thread,
    question,
    ordersBlock,
    renderFacts([...context.facts, ...recordFacts]),
    renderEvidenceForPrompt(context.photos),
    rag,
  ]
    .filter(Boolean)
    .join('\n\n');

  // Small local models follow the LAST instruction best: restate the rules
  // they break most (live eval, 2026-10-04) right before the ask.
  const reminder =
    kind === 'check_in'
      ? 'Write the check-in message now: one short paragraph, facts only.'
      : 'Write the reply to the customer now: one short paragraph; first sentence answers the question; ' +
        'no apology; no sizes, numbers or dates the facts do not state; no promise to send, refund, replace or repair ' +
        'unless a fact or staff note says we will (say we will check and follow up instead); ' +
        `${orders.length ? 'do not ask for the order number; ' : ''}do not ask them to contact us.`;
  return {
    system: buildSupportDraftSystemPrompt(input.persona, { kind, channel: item.channel }),
    user: `${user}\n\n${reminder}`,
  };
}
