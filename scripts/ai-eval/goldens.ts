/**
 * The assistant goldens — 11 turns the chat must get right on any model we
 * put behind it. Each check is a function of the LIVE fixtures
 * (`fixtures.ts`), so the expected bins and quantities follow the stock.
 *
 * Common guards (every golden): `done.ok`, no `error` frame, no raw tool-call
 * syntax in the answer, no bin the data did not return, and no "see the panel"
 * claim unless an artifact was actually painted.
 */

import { BIN_FACE_RE, type EvalFixtures } from './fixtures';

export interface TurnResult {
  providers: string[];
  text: string;
  reasoning: string;
  tools: Array<{ name: string; input: unknown; ok?: boolean }>;
  artifacts: Array<{ producedBy: string; title: string | undefined; rows: number }>;
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
  check: (r: TurnResult) => Check[];
}

const RAW_SYNTAX =
  /to=functions|<\||\|>|\b(?:locate_product|list_location_contents|get_packing_kpi|list_support_followups|render_artifact|hybrid_entity_search)\s*\(|"name"\s*:\s*"/;
const PANEL_CLAIM =
  /\b(?:(?:on|in|to)\s+(?:the\s+)?(?:right[-\s]hand\s+|right\s+|side\s+|view\s+|session\s+)?panel|see\s+the\s+table)\b/i;
const NEG = /\b(?:no|nothing|not|never|none|without|empty)\b|n['’]t\b/i;

const claimsPanel = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).some((s) => PANEL_CLAIM.test(s) && !NEG.test(s));
const has = (t: string, ...needles: Array<string | number>) =>
  needles.every((n) => t.toLowerCase().includes(String(n).toLowerCase()));
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
    [
      'panel claim only with artifact',
      r.artifacts.length > 0 || !claimsPanel(r.text) || r.text.includes('Correction: nothing was put on the panel'),
    ],
  ];
}

export function buildGoldens(f: EvalFixtures): Golden[] {
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
        ['no artifact (no stock)', r.artifacts.length === 0],
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
          /\b(not find|no match|couldn['’]t find|could not find|not found|doesn['’]t match|does not match|nothing|no product|no record|no sku|isn['’]t in|no results?)\b/i.test(
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
  ];
}
