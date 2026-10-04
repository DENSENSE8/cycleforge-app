/**
 * The task document's LIVE parts — pure and client-safe, so the renderer, the
 * server resolver and the tests read one grammar.
 *
 * P6 (task-principles: "Reference, never copy"): a document names live records
 * by reference and the render reads each record at view time. Three grammars:
 *
 *   1. Reference tokens scanned out of prose (`scanDocRefs`):
 *        #T16034 · task:16034   a task (live title / status / due / owner)
 *        @Thuc                  a staffer
 *        RS-77                  a repair
 *        #9431                  a helpdesk ticket (4+ digits)
 *        order:<number> · 113-1234567-1234567 · 12-34567-89012   an order
 *        sku:<SKU>              a catalog SKU (opens the product peek)
 *   2. A fenced ```tasks``` query block (`parseTasksQuery`) — `owner:`,
 *      `project:`, `status:`, `id:`, `limit:` lines → live task rows.
 *   3. Each task's Definition of Done (`definitionOfDone`) — the GFM
 *      checklist under a `## Definition of done` heading in its Brief,
 *      falling back to every checklist item in the Brief.
 */

import type { TaskHold } from '@/design-system/tokens/task-status';
import type { TaskDeskPerson, TaskDeskStatus } from './task-desk-row';

// ── 1. references ───────────────────────────────────────────────────────────

export const DOC_REF_KINDS = ['task', 'staff', 'repair', 'ticket', 'order', 'sku'] as const;
export type DocRefKind = (typeof DOC_REF_KINDS)[number];

/** One reference, normalized: ids as digit strings, names / SKUs / order numbers verbatim. */
export interface DocRef {
  kind: DocRefKind;
  value: string;
}

export interface DocRefMatch {
  /** UTF-16 offsets into the scanned text, end exclusive. */
  start: number;
  end: number;
  /** The text as written (`#T16034`). */
  raw: string;
  ref: DocRef;
}

/** The resolver's cache key. Staff names / SKUs / order numbers compare case-insensitively. */
export function docRefKey(ref: DocRef): string {
  return `${ref.kind}:${ref.value.toLowerCase()}`;
}

/**
 * One pass, alternation order = precedence (`#T16034` is a task before `#…`
 * could read as a ticket). The lookbehind keeps tokens out of words, URLs,
 * emails and paths (`a#9431`, `/x#9431`, `me@host`); the lookahead stops a
 * token mid-word (`RS-77abc`).
 */
const DOC_REF_RE =
  /(?<![\w&/#@.:-])(?:#[Tt](?<taskHash>\d{1,9})|[Tt]ask:(?<taskColon>\d{1,9})|RS[-_:#]?0*(?<repair>\d{1,9})|[Oo]rder:(?<orderColon>[A-Za-z0-9][A-Za-z0-9-]{2,39})|(?<orderAmazon>\d{3}-\d{7}-\d{7})|(?<orderEbay>\d{2}-\d{5}-\d{5})|[Ss][Kk][Uu]:(?<sku>[A-Za-z0-9][A-Za-z0-9._/-]{0,63})|#(?<ticket>\d{4,9})|@(?<staff>[A-Za-z][A-Za-z'-]{1,30}))(?!\w)/g;

/** Punctuation that may trail a SKU / order number / name in a sentence but is never part of it. */
const TRAILING_PUNCT = /[._/'-]+$/;

/** Every reference token in `text`, in order. */
export function scanDocRefs(text: string): DocRefMatch[] {
  const matches: DocRefMatch[] = [];
  for (const m of text.matchAll(DOC_REF_RE)) {
    const g = m.groups ?? {};
    const start = m.index ?? 0;
    let ref: DocRef;
    // Free-text tokens shed sentence punctuation (`sku:AB-12.` ends at `AB-12`).
    let token = '';
    if (g.taskHash ?? g.taskColon) ref = { kind: 'task', value: String(Number(g.taskHash ?? g.taskColon)) };
    else if (g.repair) ref = { kind: 'repair', value: String(Number(g.repair)) };
    else if (g.ticket) ref = { kind: 'ticket', value: String(Number(g.ticket)) };
    else {
      const kind: DocRefKind = g.sku ? 'sku' : g.staff ? 'staff' : 'order';
      token = g.sku ?? g.staff ?? g.orderColon ?? g.orderAmazon ?? g.orderEbay ?? '';
      ref = { kind, value: token.replace(TRAILING_PUNCT, '') };
    }
    if (!ref.value || ref.value === '0') continue;
    const shed = token ? token.length - ref.value.length : 0;
    const raw = m[0].slice(0, m[0].length - shed);
    matches.push({ start, end: start + raw.length, raw, ref });
  }
  return matches;
}

// ── 2. the ```tasks``` query block ──────────────────────────────────────────

export const TASKS_QUERY_STATUSES = ['open', 'done', 'all'] as const;
export type TasksQueryStatus = (typeof TASKS_QUERY_STATUSES)[number];

export const TASKS_QUERY_LIMIT_DEFAULT = 25;
export const TASKS_QUERY_LIMIT_MAX = 50;

/**
 * How a block shows its rows: the list (default), or a chart DERIVED from the
 * same live rows (P6 — a chart is a view of data, not a pasted image):
 * `pie` = tasks by status, `bar` = Definition-of-done progress per task.
 */
export const TASKS_QUERY_CHARTS = ['list', 'pie', 'bar'] as const;
export type TasksQueryChart = (typeof TASKS_QUERY_CHARTS)[number];

export interface TasksQuery {
  /** Staff names (first name or full); a task matches when ANY is among its owners. */
  owners: string[];
  /** Case-insensitive substring of the task's project. */
  project: string | null;
  status: TasksQueryStatus;
  ids: number[];
  limit: number;
  chart: TasksQueryChart;
}

export type TasksQueryParse = { ok: true; query: TasksQuery } | { ok: false; error: string };

const KEY_ALIASES: Readonly<Record<string, 'owner' | 'project' | 'status' | 'id' | 'limit' | 'chart'>> = {
  owner: 'owner',
  owners: 'owner',
  assignee: 'owner',
  person: 'owner',
  project: 'project',
  status: 'status',
  id: 'id',
  ids: 'id',
  task: 'id',
  tasks: 'id',
  limit: 'limit',
  chart: 'chart',
  show: 'chart',
};

const STATUS_ALIASES: Readonly<Record<string, TasksQueryStatus>> = {
  open: 'open',
  todo: 'open',
  active: 'open',
  done: 'done',
  closed: 'done',
  complete: 'done',
  all: 'all',
  any: 'all',
};

/**
 * One `key: value` per line; blank lines and `#` / `//` comments are skipped.
 * `owner` and `id` take comma-separated lists. A block that names no owner,
 * project or id is refused — "every task" is the board, not a doc block.
 */
export function parseTasksQuery(source: string): TasksQueryParse {
  const owners: string[] = [];
  const ids: number[] = [];
  let project: string | null = null;
  let status: TasksQueryStatus | null = null;
  let limit = TASKS_QUERY_LIMIT_DEFAULT;
  let chart: TasksQueryChart = 'list';

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) return { ok: false, error: `“${line}” is not a filter — write key: value (owner: Thuc).` };
    const key = KEY_ALIASES[line.slice(0, colon).trim().toLowerCase()];
    const value = line.slice(colon + 1).trim();
    if (!key) {
      return {
        ok: false,
        error: `Unknown filter “${line.slice(0, colon).trim()}” — use owner, project, status, id, limit or chart.`,
      };
    }
    if (!value) return { ok: false, error: `“${key}:” needs a value.` };

    if (key === 'owner') {
      for (const name of value.split(',')) {
        const trimmed = name.trim().replace(/^@/, '');
        if (trimmed) owners.push(trimmed);
      }
    } else if (key === 'project') {
      project = value;
    } else if (key === 'status') {
      const parsed = STATUS_ALIASES[value.toLowerCase()];
      if (!parsed) return { ok: false, error: `Status “${value}” — use open, done or all.` };
      status = parsed;
    } else if (key === 'id') {
      for (const part of value.split(/[\s,]+/)) {
        if (!part) continue;
        const n = Number(part.replace(/^(task:|#?t)/i, ''));
        if (!Number.isInteger(n) || n <= 0) return { ok: false, error: `“${part}” is not a task id.` };
        ids.push(n);
      }
    } else if (key === 'chart') {
      const parsed = TASKS_QUERY_CHARTS.find((c) => c === value.toLowerCase());
      if (!parsed) return { ok: false, error: `Chart “${value}” — use list, pie or bar.` };
      chart = parsed;
    } else {
      const n = Number(value);
      if (!Number.isInteger(n) || n <= 0) return { ok: false, error: `Limit “${value}” must be a whole number.` };
      limit = Math.min(n, TASKS_QUERY_LIMIT_MAX);
    }
  }

  if (owners.length === 0 && ids.length === 0 && !project) {
    return { ok: false, error: 'Name at least one filter: owner, project or id.' };
  }
  return {
    ok: true,
    // Naming ids means "these tasks", whatever their state; otherwise the working list.
    query: { owners, project, status: status ?? (ids.length ? 'all' : 'open'), ids, limit, chart },
  };
}

/** Quote-safe label for mermaid source (its strings cannot carry `"`). */
function mermaidLabel(text: string, max = 28): string {
  const clean = text.replace(/"/g, '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * Mermaid source for a block's `chart:` view, derived from its live rows:
 * `pie` counts tasks by status label; `bar` plots each task's Definition-of-
 * done progress (% of items checked; a task with no DoD plots 0).
 */
export function tasksChartMermaid(
  chart: Exclude<TasksQueryChart, 'list'>,
  rows: ReadonlyArray<{ title: string; statusLabel: string; dod: DefinitionOfDone }>,
): string {
  if (chart === 'pie') {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.statusLabel, (counts.get(row.statusLabel) ?? 0) + 1);
    return ['pie showData title Tasks by status', ...[...counts].map(([label, n]) => `  "${mermaidLabel(label)}" : ${n}`)].join('\n');
  }
  const titles = rows.map((row) => `"${mermaidLabel(row.title, 18)}"`);
  const percents = rows.map((row) =>
    row.dod.items.length ? Math.round((100 * row.dod.items.filter((i) => i.done).length) / row.dod.items.length) : 0,
  );
  return [
    'xychart-beta',
    '  title "Definition of done — % complete"',
    `  x-axis [${titles.join(', ')}]`,
    '  y-axis "% done" 0 --> 100',
    `  bar [${percents.join(', ')}]`,
  ].join('\n');
}

// ── 3. Definition of Done ───────────────────────────────────────────────────

export interface DodItem {
  text: string;
  done: boolean;
}

export interface DefinitionOfDone {
  items: DodItem[];
  /** True when the items came from a `Definition of done` heading, false for the all-checklist fallback. */
  fromHeading: boolean;
}

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const CHECK_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(.*\S)\s*$/;
const DOD_HEADING_RE = /^(definition of done|dod)\b/i;
const FENCE_RE = /^\s*(```|~~~)/;

/**
 * The task's Definition of Done, read from its Brief at view time. A task's
 * DoD is the checklist its Brief already carries — no second field to drift.
 */
export function definitionOfDone(note: string | null | undefined): DefinitionOfDone {
  const dod: DodItem[] = [];
  const all: DodItem[] = [];
  let inFence = false;
  let dodLevel: number | null = null;
  let sawHeading = false;

  for (const line of (note ?? '').split('\n')) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (dodLevel != null && level <= dodLevel) dodLevel = null;
      if (dodLevel == null && DOD_HEADING_RE.test(heading[2].replace(/[*_`]/g, ''))) {
        dodLevel = level;
        sawHeading = true;
      }
      continue;
    }
    const item = CHECK_ITEM_RE.exec(line);
    if (!item) continue;
    const face = { text: item[2], done: item[1] !== ' ' };
    all.push(face);
    if (dodLevel != null) dod.push(face);
  }
  return sawHeading && dod.length > 0 ? { items: dod, fromHeading: true } : { items: all, fromHeading: false };
}

// ── the wire (POST /api/tasks/doc-live) ─────────────────────────────────────

/** One task as a document paints it — a reference chip or a `tasks` block row. */
export interface DocTaskFace {
  id: number;
  title: string;
  status: TaskDeskStatus;
  taskState: TaskHold | null;
  deadlineAt: string | null;
  /** Ordered, lead first. */
  owners: TaskDeskPerson[];
  projectName: string | null;
  dod: DefinitionOfDone;
}

export type DocRefFace =
  | { kind: 'task'; task: DocTaskFace }
  | { kind: 'staff'; id: number; name: string }
  | { kind: 'repair'; id: number; ticketNumber: string | null; status: string | null; title: string | null }
  | { kind: 'ticket'; number: number; subject: string | null; status: string | null }
  | { kind: 'order'; id: number; orderNumber: string; title: string | null }
  | { kind: 'sku'; sku: string; title: string; imageUrl: string | null };

/** At most this many references / blocks per call — a document, not a crawl. */
export const DOC_LIVE_REFS_MAX = 200;
export const DOC_LIVE_QUERIES_MAX = 20;

export interface DocLiveRequest {
  refs: DocRef[];
  /** Raw ```tasks``` block sources; the server parses each with `parseTasksQuery`. */
  queries: string[];
}

export type DocTasksQueryResult = { ok: true; rows: DocTaskFace[] } | { ok: false; error: string };

export interface DocLivePayload {
  ok: true;
  /** By `docRefKey`; null when the reference names nothing in this org. */
  refs: Record<string, DocRefFace | null>;
  /** By the block source, trimmed. */
  queries: Record<string, DocTasksQueryResult>;
}

/** Fenced ```tasks``` block bodies in a markdown text, trimmed, in order. */
export function tasksBlockSources(markdown: string): string[] {
  const sources: string[] = [];
  for (const m of markdown.matchAll(/^ {0,3}```tasks[^\S\n]*\n([\s\S]*?)^ {0,3}```[^\S\n]*$/gm)) {
    sources.push(m[1].trim());
  }
  return sources;
}

/** Every distinct reference in a markdown text, skipping fenced code (whose text never renders as prose). */
export function docRefsIn(markdown: string): DocRef[] {
  const seen = new Map<string, DocRef>();
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    // Inline code spans never render as references either.
    for (const match of scanDocRefs(line.replace(/`[^`]*`/g, (span) => ' '.repeat(span.length)))) {
      seen.set(docRefKey(match.ref), match.ref);
    }
  }
  return [...seen.values()];
}

/**
 * A heading's anchor id (`## Definition of done` → `definition-of-done`). The
 * renderer stamps it on the heading and a comment records it as `headingSlug`,
 * so a comment can scroll its passage into view.
 */
export function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[*_`~[\]()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
