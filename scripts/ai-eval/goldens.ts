/**
 * The assistant goldens — the turns the chat must get right on any model we
 * put behind it. Each check is a function of the LIVE fixtures
 * (`fixtures.ts`), so the expected bins, quantities and orders follow the data.
 *
 * Common guards (every golden): `done.ok`, no `error` frame, no raw tool-call
 * syntax in the answer, no bin the data did not return, and — in the model's
 * own words, a server correction aside — no "see the panel" pointer unless the
 * turn opened a document on the right (data renders inline in the chat).
 */

import { BIN_FACE_RE, type EvalFixtures } from './fixtures';
import { CORRECTION_PREFIX, claimsPanelContent } from '../../src/lib/assistant/panel-honesty';
import { artifactPlacement } from '../../src/lib/assistant/artifact-placement';
import type { SessionArtifact } from '../../src/lib/assistant/ui-artifacts';
import { CARD_NUMBER_REFUSAL } from '../../src/lib/assistant/pan-guard';
import { countStoredCardNumbers, type PaymentFixture } from './payment-fixture';
import { takeCreatedPhoneOrder } from './phone-order-fixture';
import { cleanupImportedPo, readImportedPo } from './po-import-fixture';
import { anyOrderGoldens } from './any-order-goldens';
import { chatWritesGoldens } from './chat-writes-goldens';
import { chatPrintGoldens } from './chat-print-goldens';
import { chatReadsGoldens } from './chat-reads-goldens';
import { poLinkGoldens } from './po-link-goldens';
import { labelBuyGoldens } from './labelbuy-goldens';

export interface TurnResult {
  providers: string[];
  text: string;
  reasoning: string;
  tools: Array<{ name: string; input: unknown; ok?: boolean }>;
  artifacts: Array<{
    producedBy: string;
    kind?: string;
    title: string | undefined;
    rows: number;
    documents: string[];
    /** The answer's identity header, when the tool built one. */
    identity?: { title: string; href: string | null } | null;
  }>;
  /** Browser verbs other than render_artifact (a print card's device action, a tote print). */
  uiTools?: Array<{ name: string; input: unknown }>;
  done: {
    ok?: boolean;
    turns?: number;
    mode?: string;
    usage?: {
      provider: string;
      model: string | null;
      inputTokens: number | null;
      outputTokens: number | null;
      costMicrocents: number | null;
      firstTokenMs: number | null;
      totalMs: number;
      rounds: number;
    };
  } | null;
  errors: Array<{ message: string; code?: string }>;
  suggestions: string[];
  firstDeltaMs: number | null;
  ms: number;
}

export type Check = [name: string, ok: boolean];

export interface Golden {
  id: string;
  /** Goldens sharing a thread key run in one session, in order. */
  thread?: string;
  question: string;
  /** Bins the answer may name; any other `A-00-00-0` token is invented. */
  bins: string[];
  check: (r: TurnResult) => Check[] | Promise<Check[]>;
  /** Latency budget: the turn (to `done`) must land within this many ms. */
  maxMs?: number;
}

const RAW_SYNTAX =
  /to=functions|<\||\|>|\b(?:locate_product|list_location_contents|get_packing_kpi|list_support_followups|get_order_documents|render_artifact|find_records)\s*\(|"name"\s*:\s*"/;

const NEG = /\b(?:no|nothing|not|never|none|without|empty)\b|n['’]t\b/i;
/** The answer as the model wrote it — a streamed server correction line is not the model speaking. */
const modelWords = (t: string) =>
  t
    .split('\n')
    .filter((line) => !line.trim().startsWith(CORRECTION_PREFIX))
    .join('\n');
const openedRail = (r: TurnResult) =>
  r.artifacts.some((a) => a.kind !== undefined && artifactPlacement(a.kind as SessionArtifact['kind']) === 'rail');
/** Case- and space-insensitive: a model may write U+202F / NBSP between a first and last name. */
const has = (t: string, ...needles: Array<string | number>) => {
  const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();
  return needles.every((n) => norm(t).includes(norm(String(n))));
};
const word = (t: string, n: number) => new RegExp(`\\b${n}\\b`).test(t);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const called = (r: TurnResult, name: string, arg?: string) =>
  r.tools.some(
    (t) => t.name === name && (!arg || new RegExp(escape(arg), 'i').test(JSON.stringify(t.input ?? {}))),
  );

export function commonChecks(r: TurnResult, bins: string[]): Check[] {
  const invented = (r.text.match(BIN_FACE_RE) ?? []).filter((b) => !bins.includes(b));
  return [
    ['done ok', r.done?.ok === true],
    ['no errors', r.errors.length === 0],
    ['no raw tool syntax', !RAW_SYNTAX.test(r.text)],
    [`no invented bins${invented.length ? ` (${invented.join(',')})` : ''}`, invented.length === 0],
    ['no panel pointer (data is inline)', openedRail(r) || !claimsPanelContent(modelWords(r.text))],
  ];
}

/** Visa's public test number — never a real card. */
const TEST_PAN = '4111 1111 1111 1111';

/** Goldens that create real (production) Square objects — only with `--with-payments`. */
export const SQUARE_GOLDEN_IDS: readonly string[] = ['take-payment'];

export function buildGoldens(
  f: EvalFixtures,
  run: { startedAt: Date; payment: PaymentFixture | null },
): Golden[] {
  const [top, second] = f.multiBin.bins;
  const total = top.qty + second.qty;
  const [twoA] = f.twoTool.bins;
  const twoB = f.twoTool.bins[1];
  return [
    {
      id: 'locate-sku',
      thread: 'a',
      question: `Where is SKU ${f.multiBin.sku}?`,
      bins: [top.bin, second.bin],
      check: (r) => [
        [`tool locate_product(${f.multiBin.sku})`, called(r, 'locate_product', f.multiBin.sku)],
        ['artifact from locate_product', r.artifacts.some((a) => a.producedBy === 'locate_product' && a.rows === 2)],
        ['text states bins+qty', has(r.text, top.bin, top.qty) && has(r.text, second.bin)],
        ['follow-up chip offered', r.suggestions.length > 0],
      ],
    },
    {
      id: 'follow-up',
      thread: 'a',
      question: 'How many units is that in total?',
      bins: [top.bin, second.bin],
      check: (r) => [[`text says ${total}`, word(r.text, total)]],
    },
    {
      id: 'locate-fnsku',
      question: `Where is ${f.fnskuNoStock.fnsku}?`,
      bins: [],
      check: (r) => [
        [`tool locate_product(${f.fnskuNoStock.fnsku})`, called(r, 'locate_product', f.fnskuNoStock.fnsku)],
        ['product card, no bin table', r.artifacts.length === 1 && r.artifacts[0].kind === 'record'],
        ['text names SKU + no stock', has(r.text, f.fnskuNoStock.sku) && /\b(no|not|zero|0)\b/i.test(r.text)],
      ],
    },
    {
      id: 'locate-unknown',
      question: `Where is SKU ${f.unknownSku}?`,
      bins: [],
      check: (r) => [
        [`tool locate_product(${f.unknownSku})`, called(r, 'locate_product', f.unknownSku)],
        ['no artifact', r.artifacts.length === 0],
        [
          'honest not-found',
          /\b(not find|no match|couldn['’]t (?:find|locate)|could not (?:find|locate)|not found|doesn['’]t match|does not match|nothing|no product|no record|no sku|no bins?|isn['’]t in|no results?)\b/i.test(
            r.text,
          ),
        ],
      ],
    },
    {
      id: 'locate-upc',
      question: `Where is UPC ${f.upcStocked.upc}?`,
      bins: [f.upcStocked.bin],
      check: (r) => [
        [`tool locate_product(${f.upcStocked.upc})`, called(r, 'locate_product', f.upcStocked.upc)],
        ['artifact', r.artifacts.some((a) => a.producedBy === 'locate_product')],
        ['text states bin+qty', has(r.text, f.upcStocked.bin) && word(r.text, f.upcStocked.qty)],
      ],
    },
    {
      id: 'bin-contents',
      question: `What's in bin ${f.binContents.bin}?`,
      bins: [f.binContents.bin],
      check: (r) => [
        ['tool list_location_contents', called(r, 'list_location_contents', f.binContents.bin)],
        ['artifact', r.artifacts.some((a) => a.producedBy === 'list_location_contents')],
        ['text states sku+qty', has(r.text, f.binContents.sku) && word(r.text, f.binContents.qty)],
      ],
    },
    {
      id: 'packing-pace',
      question: 'What is the packing pace today?',
      bins: [],
      check: (r) => [
        ['packing KPI answered (tool or local_ops)', called(r, 'get_packing_kpi') || r.done?.mode === 'local_ops'],
        ['non-empty answer', r.text.trim().length > 20],
      ],
    },
    {
      id: 'followups',
      question: 'Which support follow-ups are waiting on me?',
      bins: [],
      check: (r) => [
        ['tool list_support_followups', called(r, 'list_support_followups')],
        ['non-empty answer', r.text.trim().length > 10],
      ],
    },
    {
      id: 'two-tool',
      question: `Where is SKU ${f.twoTool.sku}, and what else is stored in bin ${twoB.bin}?`,
      bins: [twoA.bin, twoB.bin],
      check: (r) => [
        [`tool locate_product(${f.twoTool.sku})`, called(r, 'locate_product', f.twoTool.sku)],
        [`tool list_location_contents(${twoB.bin})`, called(r, 'list_location_contents', twoB.bin)],
        ['artifact', r.artifacts.length >= 1],
        ['text states both bins', has(r.text, twoA.bin, twoA.qty) && has(r.text, twoB.bin, twoB.qty)],
      ],
    },
    {
      id: 'out-of-scope',
      question: "What's the weather in Paris right now?",
      bins: [],
      check: (r) => [
        ['no data tool called', r.tools.length === 0],
        ['no artifact', r.artifacts.length === 0],
        [
          'declines honestly (no invented weather)',
          /\b(can['’]?t|cannot|don['’]t have|do not have|not able|unable|no access|outside|only)\b/i.test(r.text) &&
            !/\b\d+\s?°/.test(r.text),
        ],
      ],
    },
    {
      id: 'table-request',
      question: `Show me a table of what is in bin ${f.tableBin.bin}.`,
      bins: [f.tableBin.bin],
      check: (r) => [
        [`tool list_location_contents(${f.tableBin.bin})`, called(r, 'list_location_contents', f.tableBin.bin)],
        ['artifact', r.artifacts.length >= 1],
        ['text states sku+qty', has(r.text, f.tableBin.sku) && word(r.text, f.tableBin.qty)],
        ['no markdown table in text', !/^\s*\|.*\|\s*$/m.test(r.text)],
      ],
    },
    {
      id: 'order-label',
      question: `Show me the shipping label for order ${f.orderWithLabel.orderNumber}`,
      bins: [],
      check: (r) => [
        [`tool get_order_documents(${f.orderWithLabel.orderNumber})`, called(r, 'get_order_documents', f.orderWithLabel.orderNumber)],
        [
          'document artifact: label first, slip switchable',
          r.artifacts.some(
            (a) =>
              a.producedBy === 'get_order_documents' &&
              a.kind === 'document' &&
              a.documents[0] === 'shipping_label' &&
              a.documents.includes('packing_slip'),
          ),
        ],
        ['text names the order + label', has(r.text, f.orderWithLabel.orderNumber, 'label')],
        [
          'nothing printed',
          !called(r, 'print_handling_unit_labels') &&
            !r.text.split(/(?<=[.!?])\s+|\n+/).some((s) => /\bprint(?:ed|ing)\b/i.test(s) && !NEG.test(s)),
        ],
      ],
    },
    {
      id: 'order-no-docs',
      question: `Show me the shipping label for order ${f.orderNoDocs.orderNumber}`,
      bins: [],
      check: (r) => [
        [`tool get_order_documents(${f.orderNoDocs.orderNumber})`, called(r, 'get_order_documents', f.orderNoDocs.orderNumber)],
        ['no artifact', r.artifacts.length === 0],
        [
          'honest no-documents',
          has(r.text, f.orderNoDocs.orderNumber) &&
            /\b(no|not|none|nothing|isn['’]t|aren['’]t|doesn['’]t|couldn['’]t)\b/i.test(r.text) &&
            /\b(label|slip|documents?|paperwork)\b/i.test(r.text),
        ],
      ],
    },
    // ─── SquarePaymentRail: take payment + card-number guard ──────────────────
    // take-payment runs only with `--with-payments`: `run.payment` is then a
    // TEMP $1 order (payment-fixture.ts) whose Square link and rows run.ts
    // deletes after the run. Nothing is charged. card-refused never reaches
    // Square (or a model) and always runs.
    ...(run.payment
      ? [
          {
            id: 'take-payment',
            question: `Take payment for order ${run.payment.orderNumber} by payment link`,
            bins: [],
            check: (r: TurnResult): Check[] => [
              [`tool request_payment(${run.payment?.orderNumber})`, called(r, 'request_payment', run.payment?.orderNumber)],
              ['payment panel opened', r.artifacts.some((a) => a.producedBy === 'request_payment' && a.kind === 'payment')],
              ['no amount or link typed', !/\$\s?\d|https?:\/\/|square\.link/i.test(modelWords(r.text))],
            ],
          },
        ]
      : []),
    {
      id: 'card-refused',
      question: `Charge order ${f.orderNoDocs.orderNumber} to card ${TEST_PAN} exp 12/29`,
      bins: [],
      check: async (r) => [
        ['refused before any model or tool', r.done?.mode === 'card_refused' && r.tools.length === 0],
        ['refusal reply', r.text.trim() === CARD_NUMBER_REFUSAL],
        ['card never echoed', !r.text.replace(/\D/g, '').includes(TEST_PAN.replace(/\D/g, ''))],
        ['no card number stored', (await countStoredCardNumbers(f.orgId, run.startedAt, TEST_PAN)) === 0],
      ],
    },
    // ─── end SquarePaymentRail ────────────────────────────────────────────────
    ...phoneOrderGoldens(f, run),
    ...poImportGoldens(f, run),
    ...anyOrderGoldens(f, run), // AnyChannelOrderChat
    ...chatWritesGoldens(f, run), // ChatWrites
    ...chatPrintGoldens(f, run), // ChatPrint
    ...chatReadsGoldens(f, run), // ChatReads
    ...poLinkGoldens(f, run), // PoOrderLink
    ...labelBuyGoldens(f, run), // LabelBuyChat
    ...corpusGoldens(f),
  ];
}

// ─── AiSpeed corpus (A7) ─────────────────────────────────────────────────────
// One real value per identifier kind, twice: bare (a paste / wedge scan —
// answered by its read tool with NO model round, inside the scan budget) and
// as a question (the model routes it). Values come from `fixtures.corpus`.

/** Scan → answer on screen budget for a bare identifier (no model). */
const SCAN_BUDGET_MS = 1500;

const noModel = (r: TurnResult): Check => [
  'answered without a model round',
  r.done?.mode === 'identifier' && r.done?.turns === 0 && !r.done?.usage && r.reasoning === '',
];
const identityHeader = (r: TurnResult, tool: string): Check => [
  `identity header from ${tool}`,
  r.artifacts.some((a) => a.producedBy === tool && Boolean(a.identity?.title)),
];
const linksRecord = (r: TurnResult): Check => [
  'links /search?sel=',
  r.artifacts.some((a) => /^\/search\?sel=[a-z]+:\d+$/.test(a.identity?.href ?? '')),
];
const calledAny = (r: TurnResult, names: string[], arg: string) => names.some((n) => called(r, n, arg));

/** `7812585370` → `(781) 258-5370` — how a phone is typed, not stored. */
const typedPhone = (digits: string) => `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;

function corpusGoldens(f: EvalFixtures): Golden[] {
  const c = f.corpus;
  const scan = (id: string, value: string, tool: string, extra: (r: TurnResult) => Check[], link = true): Golden => ({
    id: `scan-${id}`,
    question: value,
    bins: f.corpus && id === 'bin' ? [f.binContents.bin] : id === 'sku' ? f.multiBin.bins.map((b) => b.bin) : id === 'upc' ? [f.upcStocked.bin] : [],
    maxMs: SCAN_BUDGET_MS,
    check: (r) => [
      noModel(r),
      [`tool ${tool}`, called(r, tool, value.replace(/[()]/g, '').split(' ')[0])],
      identityHeader(r, tool),
      ...(link ? [linksRecord(r)] : []),
      ...extra(r),
    ],
  });
  const phone = typedPhone(c.customer.phone);
  return [
    scan('order', c.order.orderNumber, 'find_records', (r) => [['text: order # + buyer', has(r.text, c.order.orderNumber, c.order.customerName)]]),
    scan('tracking', c.tracking.tracking, 'find_records', (r) => [['text: its order #', has(r.text, c.tracking.orderNumber)]]),
    scan('serial', c.serial.serial, 'locate_product', (r) => [['text: serial + SKU', has(r.text, c.serial.serial, c.serial.sku)]]),
    scan('sku', f.multiBin.sku, 'locate_product', (r) => [['text: bins + qty', has(r.text, f.multiBin.bins[0].bin, f.multiBin.bins[0].qty)]]),
    // This FNSKU's SKU has no catalog row, so there is no /search record to link.
    scan('fnsku', f.fnskuNoStock.fnsku, 'locate_product', (r) => [['text: SKU + no stock', has(r.text, f.fnskuNoStock.sku) && /\b0 units\b/.test(r.text)]], false),
    scan('upc', f.upcStocked.upc, 'locate_product', (r) => [['text: bin + qty', has(r.text, f.upcStocked.bin) && word(r.text, f.upcStocked.qty)]]),
    // A bare contact is a caller: the customer dossier answers it (ChatReads).
    scan('customer-name', c.customer.name, 'get_customer', (r) => [['text: the buyer', has(r.text, c.customer.name)]], false),
    scan('email', c.customer.email, 'get_customer', (r) => [['text: the buyer', has(r.text, c.customer.name)]], false),
    scan('phone', phone, 'get_customer', (r) => [['text: the buyer', has(r.text, c.customer.name)]], false),
    scan('po', c.po.po, 'find_records', (r) => [['text: the PO', has(r.text, c.po.po)]]),
    // A bin is not a /search record (search-selection.ts): its link is the Bins desk filtered to it.
    scan('bin', f.binContents.bin, 'list_location_contents', (r) => [
      ['text: sku + qty', has(r.text, f.binContents.sku) && word(r.text, f.binContents.qty)],
      ['links the bin on Locations ▸ Bins', r.artifacts.some((a) => a.identity?.href === `/inventory/locations?tab=bins&q=${encodeURIComponent(f.binContents.bin)}`)],
    ], false),
    {
      id: 'scan-lpn',
      question: c.lpn.lpn,
      bins: [],
      maxMs: SCAN_BUDGET_MS,
      check: (r) => [noModel(r), [`tool locate_product(${c.lpn.lpn})`, called(r, 'locate_product', c.lpn.lpn)], ['text: the LPN', has(r.text, c.lpn.lpn)]],
    },
    // The same values as questions — the model routes them to the same tools.
    {
      id: 'ask-order',
      question: `Who is the customer on order ${c.order.orderNumber}?`,
      bins: [],
      check: (r) => [
        ['order read', calledAny(r, ['find_records', 'get_order_lookup'], c.order.orderNumber)],
        ['text: the buyer', has(r.text, c.order.customerName)],
      ],
    },
    {
      id: 'ask-tracking',
      question: `Which order shipped with tracking ${c.tracking.tracking}?`,
      bins: [],
      check: (r) => [
        ['tracking read', calledAny(r, ['find_records', 'get_order_lookup'], c.tracking.tracking)],
        ['text: its order #', has(r.text, c.tracking.orderNumber)],
      ],
    },
    {
      id: 'ask-serial',
      question: `Where is serial ${c.serial.serial}?`,
      bins: [],
      check: (r) => [
        ['serial read', calledAny(r, ['locate_product', 'lookup_serial', 'find_records'], c.serial.serial)],
        ['text: the serial', has(r.text, c.serial.serial)],
      ],
    },
    {
      id: 'ask-customer',
      question: `Find the orders for ${c.customer.name}`,
      bins: [],
      check: (r) => [
        [`customer read(${c.customer.name})`, calledAny(r, ['find_records', 'get_customer'], c.customer.name)],
        ['text: the buyer', has(r.text, c.customer.name)],
      ],
    },
    {
      id: 'ask-email',
      question: `Which customer has the email ${c.customer.email}?`,
      bins: [],
      check: (r) => [
        [`customer read(${c.customer.email})`, calledAny(r, ['find_records', 'get_customer'], c.customer.email)],
        ['text: the buyer', has(r.text, c.customer.name)],
      ],
    },
    {
      id: 'ask-phone',
      question: `Who is the customer with phone number ${phone}?`,
      bins: [],
      check: (r) => [
        ['customer read(phone)', calledAny(r, ['find_records', 'get_customer'], c.customer.phone.slice(-4))],
        ['text: the buyer', has(r.text, c.customer.name)],
      ],
    },
    {
      id: 'ask-po',
      question: `Find PO ${c.po.po}`,
      bins: [],
      check: (r) => [
        [`tool find_records(${c.po.po})`, called(r, 'find_records', c.po.po)],
        ['text: the PO', has(r.text, c.po.po)],
      ],
    },
    {
      id: 'ask-lpn',
      question: `Where is LPN ${c.lpn.lpn}?`,
      bins: [],
      check: (r) => [
        [`tool locate_product(${c.lpn.lpn})`, called(r, 'locate_product', c.lpn.lpn)],
        ['text: the LPN', has(r.text, c.lpn.lpn)],
      ],
    },
  ];
}
// ─── end AiSpeed corpus ──────────────────────────────────────────────────────

// ─── OrderDraftChat: a phone order, end to end ───────────────────────────────
// A new caller (unique per run), two lines by SKU with agreed prices, ship by
// Friday → the order card; "Create this order" → the confirm-before-write
// proposal; "yes" → the server's confirmation path creates the caged rows,
// which are read back (SELECT) and then deleted.

/** The next Friday on or after today, warehouse time — what "ship by Friday" must become. */
function nextFriday(now: Date): string {
  const today = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  today.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7));
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function phoneOrderGoldens(f: EvalFixtures, run: { startedAt: Date }): Golden[] {
  const caller = `Eval Caller ${run.startedAt.getTime().toString(36)}`;
  // A phone no customer has — a known number would (correctly) reuse that customer.
  const phone = `555-${String(run.startedAt.getTime() % 10_000_000).padStart(7, '0').replace(/^(\d{3})/, '$1-')}`;
  const skuA = f.multiBin.sku;
  const skuB = f.twoTool.sku;
  return [
    {
      id: 'phone-draft',
      thread: 'phone-order',
      question: `Phone order: ${caller}, ${phone}, ship to 42 Wallaby Way, Chicago IL 60614. She wants 2 of SKU ${skuA} at $39 each and 1 of SKU ${skuB} at $25. Ship by Friday.`,
      bins: [],
      check: (r) => [
        ['tool draft_manual_order', called(r, 'draft_manual_order')],
        [
          'order card for the caller',
          r.artifacts.some((a) => a.producedBy === 'draft_manual_order' && a.kind === 'order_draft' && has(a.title ?? '', caller)),
        ],
        ['nothing written yet', !called(r, 'create_manual_order')],
      ],
    },
    {
      id: 'phone-create',
      thread: 'phone-order',
      question: 'Create this order',
      bins: [],
      check: (r) => [
        ['tool create_manual_order (propose)', called(r, 'create_manual_order')],
        ['asks for a yes', /\byes\b/i.test(r.text)],
      ],
    },
    {
      id: 'phone-confirm',
      thread: 'phone-order',
      question: 'yes',
      bins: [],
      check: async (r) => {
        const rows = await takeCreatedPhoneOrder(f.orgId, caller);
        const bySku = (sku: string) => rows.find((row) => row.sku.toUpperCase() === sku.toUpperCase());
        const a = bySku(skuA);
        const b = bySku(skuB);
        return [
          ['settled on the confirmation path', r.done?.mode === 'confirmation'],
          ['created card', r.artifacts.some((x) => x.producedBy === 'create_manual_order' && x.kind === 'order_draft')],
          ['two caged rows under one PH- number', rows.length === 2 && new Set(rows.map((x) => x.order_id)).size === 1 && /^PH-\d+$/.test(rows[0].order_id) && rows.every((x) => x.release_state === 'caged')],
          [`${skuA}: 2 × $39`, a?.quantity === '2' && Number(a?.sale_amount) === 78],
          [`${skuB}: 1 × $25`, b?.quantity === '1' && Number(b?.sale_amount) === 25],
          ['channel Phone', rows.every((x) => x.account_source === 'Phone')],
          ['ship by Friday', rows.every((x) => x.deadline === nextFriday(run.startedAt))],
        ];
      },
    },
  ];
}
// ─── end OrderDraftChat ──────────────────────────────────────────────────────

// ─── PoImportChat: a purchase order imported through the completeness loop ───
// Paste a PO without tracking → the card asks for the tracking number; give it
// → complete; "Import this PO" → the confirm-before-write proposal; "yes" →
// the spine rows exist (SELECT) with the tracking linked to the PO's carton.
// A second thread pastes the same PO number → flagged as already imported;
// its check removes every row the import wrote.

function poImportGoldens(f: EvalFixtures, run: { startedAt: Date }): Golden[] {
  const tag = run.startedAt.getTime().toString(36).toUpperCase();
  const po = `EVPO-${tag}`;
  const vendor = `Eval Vendor ${tag}`;
  const tracking = `EVTRK${String(run.startedAt.getTime()).slice(-10)}`;
  const sku = f.multiBin.sku;
  const draftCard = (r: TurnResult) => r.artifacts.some((a) => a.producedBy === 'draft_po_import' && a.kind === 'po_draft' && has(a.title ?? '', po));
  return [
    {
      id: 'po-paste',
      thread: 'po-import',
      question: `Import this purchase order:\nPO number: ${po}\nVendor: ${vendor}\n2 x SKU ${sku} @ $45.50\nExpected: Friday`,
      bins: [],
      check: (r) => [
        ['tool draft_po_import', called(r, 'draft_po_import')],
        ['PO card for the PO', draftCard(r)],
        ['asks for the tracking number', /tracking number/i.test(r.text) && r.text.trim().endsWith('?')],
        ['nothing written yet', !called(r, 'import_purchase_order')],
      ],
    },
    {
      id: 'po-tracking',
      thread: 'po-import',
      question: `Tracking number: ${tracking}`,
      bins: [],
      check: (r) => [
        ['tool draft_po_import', called(r, 'draft_po_import')],
        ['same PO card, updated', draftCard(r)],
        ['no longer asks for tracking', !/what is the tracking number/i.test(r.text)],
        ['nothing written yet', !called(r, 'import_purchase_order')],
      ],
    },
    {
      id: 'po-import',
      thread: 'po-import',
      question: 'Import this PO',
      bins: [],
      check: (r) => [
        ['tool import_purchase_order (propose)', called(r, 'import_purchase_order')],
        ['asks for a yes', /\byes\b/i.test(r.text)],
      ],
    },
    {
      id: 'po-confirm',
      thread: 'po-import',
      question: 'yes',
      bins: [],
      check: async (r) => {
        const rows = await readImportedPo(f.orgId, po, tracking);
        const line = rows[0];
        return [
          ['settled on the confirmation path', r.done?.mode === 'confirmation'],
          ['record card links to receiving', r.artifacts.some((x) => x.producedBy === 'import_purchase_order' && x.kind === 'record')],
          ['one EXPECTED PO line', rows.length === 1 && line.workflow_status === 'EXPECTED' && line.receiving_type === 'PO'],
          [`${sku} × 2 (got ${line?.sku ?? '∅'} × ${line?.quantity_expected ?? '∅'})`, line?.sku?.toUpperCase() === sku.toUpperCase() && Number(line?.quantity_expected) === 2],
          ['tracking linked to the PO carton', line?.receiving_id != null && line.carton_tracking_linked === true],
          ['vendor on the PO mirror', line?.mirror_vendor === vendor],
        ];
      },
    },
    {
      id: 'po-duplicate',
      thread: 'po-duplicate',
      question: `Import this purchase order:\nPO number: ${po}\nVendor: ${vendor}\n1 x SKU ${sku}\nTracking: ${tracking}`,
      bins: [],
      check: async (r) => {
        const checks: Check[] = [
          ['tool draft_po_import', called(r, 'draft_po_import')],
          ['PO card for the PO', draftCard(r)],
          ['says it is already imported', /already/i.test(r.text)],
          ['nothing written', !called(r, 'import_purchase_order')],
        ];
        await cleanupImportedPo(f.orgId, po, tracking);
        checks.push(['cleaned up', (await readImportedPo(f.orgId, po, tracking)).length === 0]);
        return checks;
      },
    },
  ];
}
// ─── end PoImportChat ────────────────────────────────────────────────────────
