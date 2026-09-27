/**
 * One assistant turn as the operator sees it: the ANSWER (`content`), and the
 * ordered WORK that led there (`steps`) with how long the model thought before
 * answering (`thinkingMs`) — the live thinking line and the "Thought process" view in the answer (`ThinkingTrace`).
 *
 * ONE reducer, two callers, so what streamed and what reopens cannot differ:
 *   • the browser folds `/api/assistant/chat`'s SSE frames into the live
 *     message (`useAssistantChat`);
 *   • the route folds the SAME frames into the trace it persists on the
 *     assistant row (`ai_chat_messages.analysis`, `kind: 'turn_trace'`).
 *
 * Frame contract (grok-agent-loop → route → here):
 *   step {index}                 a model round opened
 *   delta {text}                 visible text of the open round
 *   reasoning {text}             model deliberation (never answer text)
 *   step_end {index, toolRound}  the round's model output is complete; a
 *                                TOOL round's text was narration ("Let me
 *                                check…"), so it MOVES out of `content` into a
 *                                `note` step — `content` is only the answer
 *   tool {name, status, ok, input, result}  a server read/write tool ran;
 *                                `result` (end only) is the short count the
 *                                timeline prints ("3 results")
 *
 * Pure: no React, no I/O, `now` is a parameter.
 */

import { toolActivityPhrase } from './tool-activity';
import { sessionArtifactSchema, type SessionArtifact } from './ui-artifacts';

export type AssistantToolStepStatus = 'running' | 'ok' | 'error';

export type AssistantStep =
  | {
      kind: 'tool';
      name: string;
      /** Operator copy (`toolActivityPhrase`) — the id is never rendered. */
      phrase: string;
      status: AssistantToolStepStatus;
      /** Compacted arguments (scalars only), humanised at render. */
      input: Record<string, unknown>;
      startedAt: number;
      endedAt: number | null;
      /** What came back, in a few words ("3 results") — from `summarizeToolResult`. */
      result?: string;
    }
  | { kind: 'note'; text: string }
  | { kind: 'reasoning'; text: string };

export interface AssistantTurnTrace {
  steps: AssistantStep[];
  /** Turn start → the answer's first visible text; null until known. */
  thinkingMs: number | null;
}

export type AssistantTurnFrame =
  | { event: 'step'; index: number }
  | { event: 'step_end'; index: number; toolRound: boolean }
  | { event: 'delta'; text: string }
  | { event: 'reasoning'; text: string }
  | { event: 'tool'; name: string; status: 'start' | 'end'; ok?: boolean; input?: unknown; result?: string };

export interface AssistantTurnDraft extends AssistantTurnTrace {
  content: string;
  /** Distinct tools started, first-use order. */
  toolsUsed: string[];
  startedAt: number;
  /** The open round: where its text starts in `content`, when it first spoke. */
  round: { index: number; from: number; textAt: number | null } | null;
  /** Model rounds seen. Zero = a deterministic reply (local_ops): nothing was thought. */
  rounds: number;
  /** The last step is reasoning of the CURRENT stretch — keep appending to it. */
  reasoningOpen: boolean;
}

/** Shown when a turn worked (steps) but produced no answer text. */
export const NO_ANSWER_FALLBACK = "I couldn't find an answer — see what I tried.";

export function beginTurn(now: number): AssistantTurnDraft {
  return {
    content: '',
    steps: [],
    thinkingMs: null,
    toolsUsed: [],
    startedAt: now,
    round: null,
    rounds: 0,
    reasoningOpen: false,
  };
}

export function applyTurnFrame(d: AssistantTurnDraft, f: AssistantTurnFrame, now: number): AssistantTurnDraft {
  switch (f.event) {
    case 'step':
      return {
        ...d,
        round: { index: f.index, from: d.content.length, textAt: null },
        rounds: d.rounds + 1,
        reasoningOpen: false,
      };

    case 'delta': {
      const round = d.round;
      const opening = round !== null && round.textAt === null;
      // Leading whitespace of an answer is layout noise; the client owns layout.
      const text = d.content.length === 0 || opening ? f.text.replace(/^\s+/, '') : f.text;
      if (!text) return d;
      // A round that speaks after answer text already stands starts a paragraph.
      const sep = opening && d.content.length > 0 ? '\n\n' : '';
      return {
        ...d,
        content: d.content + sep + text,
        round: opening ? { ...round, textAt: now } : round,
      };
    }

    case 'reasoning': {
      const last = d.steps.at(-1);
      if (d.reasoningOpen && last?.kind === 'reasoning') {
        return { ...d, steps: [...d.steps.slice(0, -1), { kind: 'reasoning', text: last.text + f.text }] };
      }
      if (!f.text.trim()) return d;
      return { ...d, steps: [...d.steps, { kind: 'reasoning', text: f.text }], reasoningOpen: true };
    }

    case 'step_end': {
      const round = d.round;
      if (!round) return d;
      if (!f.toolRound) {
        return { ...d, thinkingMs: (round.textAt ?? now) - d.startedAt, round: null };
      }
      const note = d.content.slice(round.from).trim();
      return {
        ...d,
        content: d.content.slice(0, round.from),
        steps: note ? [...d.steps, { kind: 'note', text: note }] : d.steps,
        round: null,
        reasoningOpen: false,
      };
    }

    case 'tool': {
      if (f.status === 'start') {
        return {
          ...d,
          toolsUsed: d.toolsUsed.includes(f.name) ? d.toolsUsed : [...d.toolsUsed, f.name],
          steps: [
            ...d.steps,
            {
              kind: 'tool',
              name: f.name,
              phrase: toolActivityPhrase(f.name),
              status: 'running',
              input: compactToolInput(f.input),
              startedAt: now,
              endedAt: null,
            },
          ],
          reasoningOpen: false,
        };
      }
      const at = d.steps.findLastIndex((s) => s.kind === 'tool' && s.name === f.name && s.status === 'running');
      if (at === -1) return d;
      const steps = d.steps.slice();
      const step = steps[at] as Extract<AssistantStep, { kind: 'tool' }>;
      steps[at] = {
        ...step,
        status: f.ok === false ? 'error' : 'ok',
        endedAt: now,
        ...(f.result ? { result: f.result } : {}),
      };
      return { ...d, steps };
    }
  }
}

/**
 * The stream is over (done, error or abort): a tool still `running` never
 * reported back, so it failed; a model turn that never reached an answer
 * round thought for the whole turn. A turn with no model round at all (the
 * deterministic local_ops reply) keeps `thinkingMs: null` — nothing thought.
 */
export function settleTurn(d: AssistantTurnDraft, now: number): AssistantTurnDraft {
  return {
    ...d,
    steps: d.steps.map((s) => (s.kind === 'tool' && s.status === 'running' ? { ...s, status: 'error', endedAt: now } : s)),
    thinkingMs: d.thinkingMs ?? (d.rounds > 0 || d.steps.length > 0 ? now - d.startedAt : null),
    round: null,
    reasoningOpen: false,
  };
}

/** An SSE frame this reducer folds, or null for every other event. */
export function parseTurnFrame(event: string, payload: Record<string, unknown>): AssistantTurnFrame | null {
  switch (event) {
    case 'step':
      return typeof payload.index === 'number' ? { event, index: payload.index } : null;
    case 'step_end':
      return typeof payload.index === 'number'
        ? { event, index: payload.index, toolRound: payload.toolRound === true }
        : null;
    case 'delta':
    case 'reasoning':
      return typeof payload.text === 'string' ? { event, text: payload.text } : null;
    case 'tool':
      if (typeof payload.name !== 'string' || (payload.status !== 'start' && payload.status !== 'end')) return null;
      return {
        event,
        name: payload.name,
        status: payload.status,
        ...(typeof payload.ok === 'boolean' ? { ok: payload.ok } : {}),
        ...(payload.input !== undefined ? { input: payload.input } : {}),
        ...(typeof payload.result === 'string' && payload.result ? { result: payload.result } : {}),
      };
    default:
      return null;
  }
}

/** Array keys a tool result's items usually live under, most specific first. */
const RESULT_LIST_KEYS = ['results', 'matches', 'items', 'rows', 'orders', 'tickets', 'units', 'records', 'data'] as const;

/**
 * A tool result in a few words for its timeline row — "3 results", "1 result",
 * or null when the shape says nothing countable. A lookup that carried its own
 * table counts its rows by what one row is ("2 bins"); a miss says "nothing
 * found"; a top-level array counts its items; an object counts its first list
 * under {@link RESULT_LIST_KEYS}, else a numeric `count` / `total`. Never the
 * data itself: the row is provenance, not an answer.
 */
export function summarizeToolResult(data: unknown): string | null {
  const noun = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'result' : 'results'}`;
  if (Array.isArray(data)) return noun(data.length);
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  // A lookup that carried its own table: count what one row IS ("2 bins", "1 SKU").
  const artifact = record.artifact as { kind?: unknown; rows?: unknown; entityHint?: unknown } | null | undefined;
  if (artifact && typeof artifact === 'object' && artifact.kind === 'table' && Array.isArray(artifact.rows)) {
    const n = artifact.rows.length;
    const one = typeof artifact.entityHint === 'string' && artifact.entityHint.length <= 24 ? artifact.entityHint : 'row';
    return `${n.toLocaleString('en-US')} ${n === 1 ? one : `${one}s`}`;
  }
  if (record.found === false) return 'nothing found';
  for (const key of RESULT_LIST_KEYS) {
    const value = record[key];
    if (Array.isArray(value)) return noun(value.length);
  }
  for (const key of ['count', 'total'] as const) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return noun(value);
  }
  return null;
}

/** Longest string argument a step keeps — enough to recognise, never a CSV. */
const INPUT_STRING_MAX = 200;
const INPUT_LIST_MAX = 10;

/**
 * A tool's arguments reduced to what the timeline shows: top-level scalars
 * and short scalar lists, strings cut to {@link INPUT_STRING_MAX}. Pasted CSVs
 * and nested payloads would otherwise ride every SSE frame and every persisted
 * row for a footnote nobody reads past the first line.
 */
export function compactToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const cut = (v: string) => (v.length > INPUT_STRING_MAX ? `${v.slice(0, INPUT_STRING_MAX - 1)}…` : v);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = cut(value);
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (Array.isArray(value)) {
      const scalars = value
        .filter((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
        .slice(0, INPUT_LIST_MAX)
        .map((v) => (typeof v === 'string' ? cut(v) : v));
      if (scalars.length > 0) out[key] = scalars;
    }
  }
  return out;
}

/**
 * What one turn cost, as the `done` frame and the persisted row carry it.
 * Token counts are null when the endpoint did not report usage.
 */
export interface TurnUsage {
  provider: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costMicrocents: number | null;
  firstTokenMs: number | null;
  totalMs: number;
  rounds: number;
  /**
   * The thread's context after this turn: the LAST round's prompt plus its
   * completion (`inputTokens` sums every round, so it overcounts the window).
   */
  contextTokens?: number | null;
  /** The serving model's context window in tokens, when the endpoint or the table knows it. */
  contextWindow?: number | null;
}

/** An artifact the turn painted, kept on the row so a reopened thread re-creates its card. */
export interface PersistedTurnArtifact {
  artifact: SessionArtifact;
  producedBy?: string | null;
}

/** The row-level extras beside the thinking history. */
export interface TurnTraceExtras {
  /** The operator stopped the turn; `content` is the partial answer. */
  stopped?: true;
  /** Deterministic next questions shown under the answer (`follow-ups.ts`). */
  suggestions?: string[];
  artifacts?: PersistedTurnArtifact[];
  usage?: TurnUsage;
}

/** What a persisted assistant row carries in `ai_chat_messages.analysis`. */
export interface PersistedTurnTrace extends AssistantTurnTrace, TurnTraceExtras {
  kind: 'turn_trace';
}

/** Persisted artifacts per turn, and table rows per persisted artifact (plan §E). */
export const PERSISTED_ARTIFACTS_MAX = 5;
export const PERSISTED_TABLE_ROWS_MAX = 50;

/**
 * Only table, record and draft cards persist (plan §C.3): they are the
 * kinds a reopened thread must show — and a phone-order / PO draft is also the
 * state `create_manual_order` / `import_purchase_order` reads back on the next turn. A table keeps its
 * first {@link PERSISTED_TABLE_ROWS_MAX} rows — the full set stays live-only.
 */
export function persistableArtifact(artifact: SessionArtifact): SessionArtifact | null {
  if (artifact.kind === 'record' || artifact.kind === 'order_draft' || artifact.kind === 'po_draft') return artifact;
  if (artifact.kind === 'table') {
    return artifact.rows.length > PERSISTED_TABLE_ROWS_MAX
      ? { ...artifact, rows: artifact.rows.slice(0, PERSISTED_TABLE_ROWS_MAX) }
      : artifact;
  }
  return null;
}

export function toPersistedTrace(trace: AssistantTurnTrace, extras: TurnTraceExtras = {}): PersistedTurnTrace {
  return {
    kind: 'turn_trace',
    steps: trace.steps,
    thinkingMs: trace.thinkingMs,
    ...(extras.stopped ? { stopped: true as const } : {}),
    ...(extras.suggestions && extras.suggestions.length > 0 ? { suggestions: extras.suggestions } : {}),
    ...(extras.artifacts && extras.artifacts.length > 0
      ? { artifacts: extras.artifacts.slice(0, PERSISTED_ARTIFACTS_MAX) }
      : {}),
    ...(extras.usage ? { usage: extras.usage } : {}),
  };
}

export type ParsedTurnTrace = AssistantTurnTrace & TurnTraceExtras;

const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function parseUsage(raw: unknown): TurnUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  if (typeof u.provider !== 'string' || typeof u.totalMs !== 'number') return null;
  return {
    provider: u.provider,
    model: typeof u.model === 'string' ? u.model : null,
    inputTokens: numOrNull(u.inputTokens),
    outputTokens: numOrNull(u.outputTokens),
    costMicrocents: numOrNull(u.costMicrocents),
    firstTokenMs: numOrNull(u.firstTokenMs),
    totalMs: u.totalMs,
    rounds: numOrNull(u.rounds) ?? 0,
    ...(numOrNull(u.contextTokens) != null ? { contextTokens: numOrNull(u.contextTokens) } : {}),
    ...(numOrNull(u.contextWindow) != null ? { contextWindow: numOrNull(u.contextWindow) } : {}),
  };
}

function parseArtifacts(raw: unknown): PersistedTurnArtifact[] {
  if (!Array.isArray(raw)) return [];
  const out: PersistedTurnArtifact[] = [];
  for (const entry of raw.slice(0, PERSISTED_ARTIFACTS_MAX)) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const parsed = sessionArtifactSchema.safeParse(e.artifact);
    if (!parsed.success) continue;
    out.push({ artifact: parsed.data, producedBy: typeof e.producedBy === 'string' ? e.producedBy : null });
  }
  return out;
}

/**
 * Read a persisted trace back. `analysis` is shared with legacy rows (an
 * `AiStructuredAnswer` on `local_ops` turns), so anything that is not a
 * `turn_trace` — or a step or extra that does not hold its shape — is ignored.
 */
export function parseTurnTrace(raw: unknown): ParsedTurnTrace | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'turn_trace' || !Array.isArray(r.steps)) return null;
  const steps: AssistantStep[] = [];
  for (const s of r.steps as unknown[]) {
    if (!s || typeof s !== 'object') continue;
    const step = s as Record<string, unknown>;
    if ((step.kind === 'note' || step.kind === 'reasoning') && typeof step.text === 'string') {
      steps.push({ kind: step.kind, text: step.text });
    } else if (step.kind === 'tool' && typeof step.name === 'string') {
      const status = step.status === 'ok' || step.status === 'error' ? step.status : 'error';
      steps.push({
        kind: 'tool',
        name: step.name,
        phrase: toolActivityPhrase(step.name),
        status,
        input: compactToolInput(step.input),
        startedAt: typeof step.startedAt === 'number' ? step.startedAt : 0,
        endedAt: typeof step.endedAt === 'number' ? step.endedAt : null,
        ...(typeof step.result === 'string' && step.result ? { result: step.result } : {}),
      });
    }
  }
  const suggestions = Array.isArray(r.suggestions)
    ? r.suggestions.filter((s): s is string => typeof s === 'string' && s.length > 0).slice(0, 3)
    : [];
  const artifacts = parseArtifacts(r.artifacts);
  const usage = parseUsage(r.usage);
  return {
    steps,
    thinkingMs: typeof r.thinkingMs === 'number' ? r.thinkingMs : null,
    ...(r.stopped === true ? { stopped: true as const } : {}),
    ...(suggestions.length > 0 ? { suggestions } : {}),
    ...(artifacts.length > 0 ? { artifacts } : {}),
    ...(usage ? { usage } : {}),
  };
}
