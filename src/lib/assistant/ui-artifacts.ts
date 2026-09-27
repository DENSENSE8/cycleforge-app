/**
 * Session artifact contract — what the agent may SHOW on the session view
 * panel via the `render_artifact` UI tool, and what the client will render.
 *
 * This is the display-side twin of the tool registry law: the descriptor
 * carries DATA (plain strings/numbers the model copied out of a read-tool
 * result it already ran), never behavior — no callbacks, no component refs, no
 * HTML. The client validates every payload against this schema before
 * rendering; an invalid artifact degrades to a one-line notice, never a
 * rendered guess.
 *
 * Every artifact is read-only by construction. The ONE interactive exception
 * is `ticket_reply_draft`, whose send is a user action (Enter) that POSTs to
 * /api/support/tickets/reply under the user's own session and permission —
 * the agent can draft, only the human can send.
 */

import { z } from 'zod';

/**
 * A link the panel will hand to the browser. `z.url()` alone is not a scheme
 * check — `javascript:alert(1)` and `data:text/html,…` are both well-formed
 * URLs and both were ACCEPTED by this contract, which put a model-authored
 * (and therefore document-injectable) scheme one click from execution. The
 * panel opens exactly one scheme.
 */
const externalLink = z
  .string()
  .url()
  .max(600)
  .refine((u) => u.toLowerCase().startsWith('https://'), 'must be an https:// URL');

/**
 * An in-app route the record card navigates to. `^\/` alone admits
 * `//evil.test/x` (protocol-relative — an external origin) and `/\evil.test`
 * (which browsers normalize to the same thing), so the anchor has to exclude
 * a second separator.
 */
const appPath = z
  .string()
  .regex(/^\/(?![/\\])/, 'must be an app path starting with a single /')
  .max(300);

/**
 * The panel's heading. `z.string()` alone accepted `""`, and local models
 * routinely send it — the promoted gpt-oss adapter emitted `title: ""` on its
 * first measured table, qwen3:14b did the same — which renders a titleless
 * card the operator cannot name in a follow-up question. Empty is a REJECTION
 * at the chokepoint, which the loop repairs in-turn rather than painting a
 * blank heading or inventing one here.
 */
const artifactTitle = z.string().trim().min(1).max(120);

export const artifactTableSchema = z.object({
  kind: z.literal('table'),
  title: artifactTitle,
  columns: z.array(z.string().max(80)).min(1).max(12),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(200),
  /** What one row IS, e.g. "receiving line" — names the reference when attached to the composer. */
  entityHint: z.string().max(60).optional(),
  /** The id column name used when attaching a row as a composer reference. */
  idColumn: z.string().max(60).optional(),
});

export const artifactTimelineItemSchema = z.object({
  at: z.string().max(40),
  actor: z.string().max(80).nullable(),
  action: z.string().max(120),
  detail: z.string().max(400).nullable(),
});

export const artifactTimelineSchema = z.object({
  kind: z.literal('timeline'),
  title: artifactTitle,
  subject: z.string().max(120),
  items: z.array(artifactTimelineItemSchema).max(200),
});

export const artifactTicketThreadSchema = z.object({
  kind: z.literal('ticket_thread'),
  title: artifactTitle,
  ticketId: z.number().int().positive(),
  subject: z.string().max(300).nullable().optional(),
  status: z.string().max(60).nullable().optional(),
  messages: z
    .array(
      z.object({
        author: z.string().max(120),
        at: z.string().max(40).nullable().optional(),
        body: z.string().max(8000),
        public: z.boolean().nullable().optional(),
      }),
    )
    .max(100),
});

export const artifactTicketReplyDraftSchema = z.object({
  kind: z.literal('ticket_reply_draft'),
  title: artifactTitle,
  ticketId: z.number().int().positive(),
  subject: z.string().max(300),
  body: z.string().max(8000),
  public: z.boolean(),
});

export const artifactChartSchema = z.object({
  kind: z.literal('chart'),
  title: artifactTitle,
  chartType: z.enum(['bar', 'line', 'donut']),
  series: z.array(z.object({ label: z.string().max(80), value: z.number() })).min(1).max(24),
  unit: z.string().max(20).nullable().optional(),
});

export const artifactRecordSchema = z.object({
  kind: z.literal('record'),
  title: artifactTitle,
  /** Absolute app path the record lives at (navigate target). */
  path: appPath,
  fields: z.array(z.object({ label: z.string().max(80), value: z.string().max(300) })).max(20),
});

export const artifactImportTriageSchema = z.object({
  kind: z.literal('import_triage'),
  title: artifactTitle,
  /** Canonical field → CSV header, from the house auto-mapper. */
  mapping: z.record(z.string(), z.string()),
  rows: z
    .array(
      z.object({
        orderNumber: z.string().max(120),
        itemNumber: z.string().max(120),
        itemTitle: z.string().max(300),
        quantity: z.string().max(40),
        status: z.enum(['accepted', 'needs_resolution']),
        reason: z.string().max(300),
      }),
    )
    .max(200),
  /**
   * Projected canonical rows for the ACCEPTED rows only — the human "Import"
   * action posts these to POST /api/orders/import-csv (the same chokepoint the
   * import desk uses) under the user's own session. Data, not behavior.
   */
  acceptedRows: z.array(z.record(z.string(), z.string())).max(200),
  mappingApplied: z.boolean(),
});

/**
 * An external document read through a connected app — the inline retriever.
 * Plain text only: no HTML, no iframe, no embed. The panel is a read plane, so
 * a document renders as text plus a link back to the source of record.
 */
export const artifactDocumentSchema = z.object({
  kind: z.literal('document'),
  title: z.string().trim().min(1).max(200),
  /** Where it lives, e.g. "Google Docs". */
  source: z.string().max(60),
  /** Absolute external URL to open the real document. */
  url: externalLink.nullable().optional(),
  /** Extracted plain text, trimmed by the tool before it ever reaches here. */
  body: z.string().max(20000),
  lastModified: z.string().max(40).nullable().optional(),
});

// ─── The operator report ─────────────────────────────────────────────────────

/**
 * A REPORT is the answer to one named operating question, laid out so an owner
 * who has run a warehouse for fifteen years can read it once and act.
 *
 * ## Why one kind and not five
 *
 * The five questions this was built for (packing performance, unbox backlog,
 * most expensive order in the building, biggest gaps, who to delegate to) do
 * not differ in SHAPE. Each one is: a headline number, a handful of named KPIs
 * with verdicts, one or two detail tables, the standards the math used, and the
 * follow-up sentences. Five artifact kinds would be five renderers, five sets
 * of vocabulary and five places to drift — the same fork `table-engine-law.ts`
 * forbids for desks. The report is the engine; a question contributes DATA.
 *
 * ## Why the definitions ride along
 *
 * `kpis[].definition` and `standards[]` are not decoration. A number an owner
 * cannot audit is a number he has to phone someone about, and "42 boxes" means
 * nothing until the report says which boxes it counted and from when. Every
 * report therefore carries its own arithmetic on its face: the standard minutes
 * per pack tier, the age window, the lane predicate. That is what makes the
 * artifact READABLE rather than merely rendered.
 *
 * Still data, never behavior (law 1): `followUps[].question` is a SENTENCE the
 * composer seeds, exactly like `RoiGap.question` already does. No callbacks, no
 * mutations, no hrefs the panel did not validate.
 */

/** A number the owner is expected to judge, with the arithmetic attached. */
export const artifactReportKpiSchema = z.object({
  id: z.string().max(60),
  label: z.string().max(80),
  /** Pre-formatted by the tool — the panel never does money or rounding math. */
  value: z.string().max(40),
  unit: z.string().max(24).nullable().optional(),
  /** What good looks like, in the same unit. Omit when the org has no target. */
  target: z.string().max(40).nullable().optional(),
  /** Signed change vs the comparison window, e.g. "+12%" or "-3 boxes". */
  delta: z.string().max(24).nullable().optional(),
  /**
   * The verdict. `neutral` is for a fact with no good/bad direction (headcount,
   * window length) and is the honest answer when no target exists — a report
   * that paints every tile green teaches an owner to stop reading the colors.
   */
  status: z.enum(['good', 'watch', 'bad', 'neutral']),
  /** How this number was computed, in one sentence the owner can audit. */
  definition: z.string().max(400),
});

export const artifactReportColumnSchema = z.object({
  key: z.string().max(60),
  label: z.string().max(60),
  /** Numbers right, words left. Defaults to left when omitted. */
  align: z.enum(['left', 'right']).optional(),
  unit: z.string().max(24).nullable().optional(),
});

const reportCell = z.union([z.string().max(300), z.number(), z.null()]);

export const artifactReportSectionSchema = z
  .object({
    title: z.string().max(120),
    /** One line of context under the section heading. */
    note: z.string().max(400).nullable().optional(),
    columns: z.array(artifactReportColumnSchema).min(1).max(14),
    rows: z.array(z.record(z.string(), reportCell)).max(300),
    /** Footer row, keyed by the same column keys. */
    totals: z.record(z.string(), reportCell).nullable().optional(),
  })
  .superRefine((section, ctx) => {
    // Two columns with the same key render identical data under different
    // labels AND log duplicate React keys — the payload is wrong, reject it.
    const seen = new Set<string>();
    for (const col of section.columns) {
      if (seen.has(col.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['columns'],
          message: `duplicate column key "${col.key}"`,
        });
        return;
      }
      seen.add(col.key);
    }
  });

/**
 * A declared operating standard the report's math depends on — the pack tier
 * minutes, the workday length, the age window. Printed on the report so the
 * owner can disagree with the STANDARD instead of distrusting the RESULT.
 */
export const artifactReportStandardSchema = z.object({
  label: z.string().max(80),
  value: z.string().max(40),
  unit: z.string().max(24).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});

export const artifactReportSchema = z.object({
  kind: z.literal('report'),
  title: artifactTitle,
  /** The exact sentence this report answers, echoed back for the record. */
  question: z.string().trim().min(1).max(300),
  /** When the numbers were read, in the operator's timezone. */
  asOf: z.string().max(60),
  /** What was counted: the day, the lane, the staff member, the window. */
  scope: z.string().max(200),
  /** The single number the question asked for. */
  headline: z.object({
    /** Same guard `title` carries: a report cannot render with no headline number. */
    value: z.string().trim().min(1).max(60),
    unit: z.string().max(24).nullable().optional(),
    label: z.string().max(120),
    hint: z.string().max(200).nullable().optional(),
  }),
  kpis: z.array(artifactReportKpiSchema).max(10),
  sections: z.array(artifactReportSectionSchema).max(4),
  standards: z.array(artifactReportStandardSchema).max(8),
  /** Definitions, caveats and known blind spots. The owner reads these. */
  notes: z.array(z.string().max(400)).max(12),
  /** Follow-up sentences the composer seeds on click. Data, not behavior. */
  followUps: z
    .array(z.object({ label: z.string().max(80), question: z.string().max(300) }))
    .max(6),
});

export const sessionArtifactUnion = z.discriminatedUnion('kind', [
  artifactTableSchema,
  artifactTimelineSchema,
  artifactTicketThreadSchema,
  artifactTicketReplyDraftSchema,
  artifactChartSchema,
  artifactRecordSchema,
  artifactImportTriageSchema,
  artifactDocumentSchema,
  artifactReportSchema,
]);

/**
 * Strip invisible controls from every string on a VALIDATED artifact.
 *
 * `sanitizeSessionArtifact` already does this for the payload a MODEL types,
 * but that is one of three doors. A report tool's envelope goes
 * `splitToolArtifact` → `sessionArtifactSchema.safeParse` (tool-artifact.ts:88),
 * and the panel's own listener parses whatever was dispatched
 * (useSessionArtifacts.ts) — neither passes through the sanitizer. So a
 * `product_title` carrying U+202E reached the money column of a
 * Postgres-backed report untouched, which is the S1 in angle 3: the owner acts
 * on what he reads, and the override reverses what he reads without changing a
 * byte of what was stored.
 *
 * On the schema it is unmissable — every path that validates gets it, including
 * paths nobody has written yet.
 */
function scrubInvisibleDeep<T>(value: T): T {
  if (typeof value === 'string') return stripInvisible(value) as unknown as T;
  if (Array.isArray(value)) return value.map(scrubInvisibleDeep) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubInvisibleDeep(v);
    return out as unknown as T;
  }
  return value;
}

export const sessionArtifactSchema = sessionArtifactUnion.transform(scrubInvisibleDeep);

export type ArtifactTable = z.infer<typeof artifactTableSchema>;
export type ArtifactTimeline = z.infer<typeof artifactTimelineSchema>;
export type ArtifactTicketThread = z.infer<typeof artifactTicketThreadSchema>;
export type ArtifactTicketReplyDraft = z.infer<typeof artifactTicketReplyDraftSchema>;
export type ArtifactChart = z.infer<typeof artifactChartSchema>;
export type ArtifactRecord = z.infer<typeof artifactRecordSchema>;
export type ArtifactImportTriage = z.infer<typeof artifactImportTriageSchema>;
export type ArtifactDocument = z.infer<typeof artifactDocumentSchema>;
export type ArtifactReport = z.infer<typeof artifactReportSchema>;
export type ArtifactReportKpi = z.infer<typeof artifactReportKpiSchema>;
export type ArtifactReportSection = z.infer<typeof artifactReportSectionSchema>;
export type ArtifactReportStandard = z.infer<typeof artifactReportStandardSchema>;
export type SessionArtifact = z.infer<typeof sessionArtifactSchema>;

/** Narrowed view of the kinds the view panel can render — used by prompts and tripwires. */
export const SESSION_ARTIFACT_KINDS = [
  'table',
  'timeline',
  'ticket_thread',
  'ticket_reply_draft',
  'chart',
  'record',
  'import_triage',
  'document',
  'report',
] as const;

// ─── Chat-side table interception ────────────────────────────────────────────

/**
 * GFM pipe-table block: header | separator (---) | body rows. Returns the
 * block's lines and the parsed cells.
 */
function parseGfmTable(lines: string[]): { columns: string[]; rows: string[][] } | null {
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  if (lines.length < 2) return null;
  const columns = cells(lines[0]);
  if (columns.length < 2 || columns.every((c) => !c)) return null;
  // Second line must be the separator (--- / :---:).
  if (!/^\s*\|?[\s:-]*-[\s:|-]*$/.test(lines[1]) || !lines[1].includes('-')) return null;
  const rows = lines.slice(2).map(cells);
  return { columns, rows };
}

/**
 * Extract GFM markdown tables out of assistant chat text. The LEFT side of the
 * session is prose-only: tables render exclusively as artifacts on the right
 * panel, so any table the model leaks into text is MOVED, not displayed —
 * stripped from the returned text and returned as ready-to-dispatch table
 * payloads. Title comes from the nearest preceding short line (the sentence
 * that introduced the table).
 */
export function extractGfmTables(content: string): {
  tables: Array<{ title: string; columns: string[]; rows: Array<Record<string, string | number | boolean | null>> }>;
  text: string;
} {
  const tables: Array<{ title: string; columns: string[]; rows: Array<Record<string, string | number | boolean | null>> }> = [];
  if (!content.includes('|')) return { tables, text: content };
  const lines = content.split('\n');
  const out: string[] = [];
  let pendingTitle = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const isPipe = /^\s*\|.*\|\s*$/.test(line);
    const nextIsSep = i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1] ?? '');
    if (isPipe && nextIsSep) {
      let j = i + 1;
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) j += 1;
      const block = parseGfmTable(lines.slice(i, j));
      if (block) {
        const rows = block.rows.slice(0, 200).map((cells) => {
          const row: Record<string, string | number | boolean | null> = {};
          block.columns.forEach((col, idx) => {
            row[col] = cells[idx] ?? null;
          });
          return row;
        });
        tables.push({
          title: pendingTitle ? pendingTitle.slice(0, 120) : 'Table',
          columns: block.columns,
          rows,
        });
        // Drop the introducing title line too — it named what moved to the panel.
        if (pendingTitle && out[out.length - 1] === pendingTitle) out.pop();
        i = j;
        pendingTitle = '';
        continue;
      }
    }
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('|') && trimmed.length <= 80) {
      pendingTitle = trimmed;
    } else if (trimmed) {
      pendingTitle = '';
    }
    out.push(line);
    i += 1;
  }
  return { tables, text: out.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

// ─── Boundary sanitizer ──────────────────────────────────────────────────────

/**
 * Unicode bidi controls and invisible joiners never reach the panel: an
 * RTL-override smuggled into a money cell reflows everything after it (the
 * "1‑$0" trick), and a zero-width joiner hides in a match with no glyph.
 * Stripped at the boundary, beside `cellString`, for EVERY report string.
 */
const INVISIBLE_RE = /[\u202A-\u202E\u2066-\u2069\u200B-\u200F\u2060\uFEFF]/g;

function stripInvisible(s: string): string {
  return s.replace(INVISIBLE_RE, '');
}

/**
 * A numeric string in exponent form (`1e-320`, `2.5e+7`) is a number the model
 * serialized, not prose: normalize it to plain decimal at the boundary so a
 * Boxes column never prints `1e-320` (angle 1).
 */
function normalizeNumeric(s: string): string {
  if (!/^[-+]?\d+(\.\d+)?[eE][-+]?\d+$/.test(s)) return s;
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n !== 0 && Math.abs(n) < 1e-6) return n.toExponential(2);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
}

/**
 * Coerce one cell/field the model sent as an object (or anything else) into
 * the plain string the contract demands. Named keys win ({label, value, …});
 * otherwise a bounded JSON dump — still data, never behavior.
 */
function cellString(v: unknown): string {
  if (v == null) return '';
  // A function is BEHAVIOR, not formatting: pass it through untouched so the
  // schema — not this helper — rejects the payload.
  if (typeof v === 'function') return v as unknown as string;
  if (typeof v === 'string') return normalizeNumeric(stripInvisible(v));
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(cellString).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    const rec = v as Record<string, unknown>;
    for (const key of ['label', 'text', 'value', 'name', 'title', 'body', 'message', 'summary', 'subject', 'display']) {
      const pick = rec[key];
      if (typeof pick === 'string' && pick.trim()) return pick;
      if (typeof pick === 'number' && Number.isFinite(pick)) return String(pick);
      if (typeof pick === 'boolean') return String(pick);
    }
    try {
      return JSON.stringify(v).slice(0, 300);
    } catch {
      return '[unrenderable]';
    }
  }
  return String(v);
}

function toBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.trim().toLowerCase() === 'true' || v.trim() === '1';
  if (typeof v === 'number') return v !== 0;
  return undefined;
}

function toCount(n: unknown): number | undefined {
  const num = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Column headers, plus the machine-key → header aliases the rows need.
 *
 * Local models describe a column as an OBJECT — `{name:'unitsPerHour',
 * label:'Units/hr'}` is what the MLX 27B emits on its first data turn — while
 * keying every row by the machine name. `cellString` picks `label`, so the
 * header rendered "Units/hr" and the cell lookup (normalized-key match in
 * renderers.tsx) then failed against `unitsPerHour`: a valid artifact with a
 * blank column. The alias carries the object's own machine keys so the row
 * keys land under the header that was actually rendered.
 */
function tableColumns(raw: unknown): { columns: string[]; alias: Map<string, string> } {
  const alias = new Map<string, string>();
  if (!Array.isArray(raw)) return { columns: [], alias };
  const columns = raw.map((col) => {
    const header = cellString(col);
    if (col && typeof col === 'object' && !Array.isArray(col)) {
      for (const key of ['name', 'key', 'field', 'id', 'accessor', 'dataIndex']) {
        const machine = (col as Record<string, unknown>)[key];
        if (typeof machine === 'string' && machine && machine !== header && !alias.has(machine)) {
          alias.set(machine, header);
        }
      }
    }
    return header;
  });
  return { columns, alias };
}

/**
 * Sanitize a render_artifact payload BEFORE validation: models routinely wrap
 * cells in objects ({value: 3, unit: 'min'}) or stringify dates into objects.
 * The contract stays strict at the CLIENT (the browser never renders a guess);
 * the boundary absorbs the model's sloppiness so the turn renders instead of
 * burning repair rounds on formatting.
 */
export function sanitizeSessionArtifact(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const a = raw as Record<string, unknown>;
  try {
    switch (a.kind) {
      case 'table': {
        const { columns, alias } = tableColumns(a.columns);
        const rows = Array.isArray(a.rows)
          ? a.rows.map((row) => {
              if (!row || typeof row !== 'object' || Array.isArray(row)) return {};
              const out: Record<string, string | number | boolean | null> = {};
              for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
                // An alias never overwrites a key the model already sent under
                // the header itself — the explicit one wins.
                const key = alias.get(k) ?? k;
                if (key !== k && Object.hasOwn(out, key)) continue;
                out[key] = v === null ? null : typeof v === 'number' || typeof v === 'boolean' ? v : cellString(v);
              }
              return out;
            })
          : [];
        return {
          kind: 'table',
          title: cellString(a.title),
          columns,
          rows,
          // Optional facets stay ABSENT when null — an explicit `undefined`
          // value still materializes the key on the emitted payload, and the
          // declared shape is "absent unless real".
          ...(a.entityHint == null ? {} : { entityHint: cellString(a.entityHint) }),
          ...(a.idColumn == null ? {} : { idColumn: alias.get(cellString(a.idColumn)) ?? cellString(a.idColumn) }),
        };
      }
      case 'timeline':
        return {
          kind: 'timeline',
          title: cellString(a.title),
          subject: cellString(a.subject),
          items: Array.isArray(a.items)
            ? a.items.map((item) => {
                const it = (item ?? {}) as Record<string, unknown>;
                return {
                  at: cellString(it.at),
                  actor: it.actor == null ? null : cellString(it.actor),
                  action: cellString(it.action),
                  detail: it.detail == null ? null : cellString(it.detail),
                };
              })
            : [],
        };
      case 'ticket_thread':
        return {
          kind: 'ticket_thread',
          title: cellString(a.title),
          ticketId: toCount(a.ticketId) ?? 0,
          subject: a.subject == null ? null : cellString(a.subject),
          status: a.status == null ? null : cellString(a.status),
          messages: Array.isArray(a.messages)
            ? a.messages.map((m) => {
                const msg = (m ?? {}) as Record<string, unknown>;
                return {
                  author: cellString(msg.author),
                  at: msg.at == null ? null : cellString(msg.at),
                  body: cellString(msg.body),
                  public: toBool(msg.public),
                };
              })
            : [],
        };
      case 'ticket_reply_draft':
        return {
          kind: 'ticket_reply_draft',
          title: cellString(a.title),
          ticketId: toCount(a.ticketId) ?? 0,
          subject: cellString(a.subject),
          body: cellString(a.body),
          public: toBool(a.public) ?? false,
        };
      case 'chart': {
        const chartType = a.chartType === 'line' || a.chartType === 'donut' ? a.chartType : 'bar';
        const series = Array.isArray(a.series)
          ? a.series
              .map((s) => {
                const it = (s ?? {}) as Record<string, unknown>;
                const value = toCount(it.value);
                return value === undefined ? null : { label: cellString(it.label), value };
              })
              .filter((s): s is { label: string; value: number } => s !== null)
          : [];
        return {
          kind: 'chart',
          title: cellString(a.title),
          chartType,
          series,
          unit: a.unit == null ? null : cellString(a.unit),
        };
      }
      case 'record': {
        const path = cellString(a.path);
        return {
          kind: 'record',
          title: cellString(a.title),
          path: path.startsWith('/') ? path : `/${path}`,
          fields: Array.isArray(a.fields)
            ? a.fields.map((f) => {
                const it = (f ?? {}) as Record<string, unknown>;
                return { label: cellString(it.label), value: cellString(it.value) };
              })
            : [],
        };
      }
      case 'import_triage': {
        const mapping: Record<string, string> = {};
        if (a.mapping && typeof a.mapping === 'object' && !Array.isArray(a.mapping)) {
          for (const [k, v] of Object.entries(a.mapping as Record<string, unknown>)) {
            mapping[cellString(k)] = cellString(v);
          }
        }
        const status = (v: unknown): 'accepted' | 'needs_resolution' =>
          v === 'accepted' ? 'accepted' : 'needs_resolution';
        return {
          kind: 'import_triage',
          title: cellString(a.title),
          mapping,
          rows: Array.isArray(a.rows)
            ? a.rows.map((r) => {
                const it = (r ?? {}) as Record<string, unknown>;
                return {
                  orderNumber: cellString(it.orderNumber),
                  itemNumber: cellString(it.itemNumber),
                  itemTitle: cellString(it.itemTitle),
                  quantity: cellString(it.quantity),
                  status: status(it.status),
                  reason: cellString(it.reason),
                };
              })
            : [],
          acceptedRows: Array.isArray(a.acceptedRows)
            ? a.acceptedRows.map((row) => {
                const out: Record<string, string> = {};
                if (row && typeof row === 'object' && !Array.isArray(row)) {
                  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
                    out[cellString(k)] = cellString(v);
                  }
                }
                return out;
              })
            : [],
          mappingApplied: Boolean(a.mappingApplied),
        };
      }
      case 'report': {
        // Report strings are pre-formatted by the tools, but the model can
        // also type a report payload directly — every string on it gets the
        // same boundary treatment as a table cell (angle 3: bidi controls
        // survived into headline and money cells).
        const walk = (v: unknown): unknown => {
          if (typeof v === 'string') return normalizeNumeric(stripInvisible(v));
          if (Array.isArray(v)) return v.map(walk);
          if (v && typeof v === 'object') {
            const out: Record<string, unknown> = {};
            for (const [k, val] of Object.entries(v)) out[k] = walk(val);
            return out;
          }
          return v;
        };
        return walk(a);
      }
      default:
        return raw;
    }
  } catch {
    return raw;
  }
}
