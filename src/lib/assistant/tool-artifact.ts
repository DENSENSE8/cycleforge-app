/**
 * Tool-carried artifacts — the report goes to the PANEL, the summary goes to
 * the MODEL.
 *
 * ## The problem this removes
 *
 * `render_artifact` is a UI tool: the model calls it with a payload it typed
 * itself. For a table of five rows the model already read, that is fine. For an
 * operator report it is not — the model would have to retype every KPI, every
 * row and every standard out of a read-tool result, in JSON, at 17 tok/s on the
 * local box. Measured consequences of asking a model to copy a report:
 *
 *   - the numbers change. A digit drops, a total stops matching its column, and
 *     the owner is reading a report that no longer reconciles with the database
 *     it came from. A packing report whose weighted minutes do not add up is
 *     worse than no report.
 *   - the tokens are spent twice — once reading the result, once retyping it.
 *
 * So a report tool returns BOTH halves: the validated artifact for the panel,
 * and a short prose summary for the model to talk about. The loop splits them.
 * The model never sees the payload, so it cannot corrupt it, and the panel gets
 * the exact bytes the SQL produced.
 *
 * ## Why this is still law-abiding
 *
 * Law 1 (artifacts carry data, never behavior) holds: the payload is validated
 * against `sessionArtifactSchema` here, at the boundary, exactly as it is when
 * the model types it. Law 3 (every verb is a registered tool) holds: the verb IS
 * a registered read tool, gated by its own `permission`. The only thing that
 * changed is who typed the JSON — and the answer is now "Postgres did".
 */

import { sessionArtifactSchema, type SessionArtifact } from './ui-artifacts';

/**
 * What a report tool returns. `summary` is what the model reads and speaks; it
 * must be short and must not restate the whole table, or the retyping cost
 * comes back through the other door.
 */
export interface ToolArtifactEnvelope {
  artifact: SessionArtifact;
  summary: string;
  /**
   * The operator-facing one-liner, built from the same data. A turn that runs
   * the tool WITHOUT a model (the scan / pasted-id fast path) shows it as the
   * answer; the model never reads it (it reads `summary`).
   */
  answer?: string;
}

/**
 * The opt-in brand (angle 4): an envelope is recognized by a non-enumerable
 * symbol stamped by `reportEnvelope()`, never by shape. Any tool (or injected
 * document) can return `{ artifact, summary }` — without the brand it is an
 * ordinary result and never takes the panel.
 */
export const REPORT_ENVELOPE_TOOL = Symbol('cycleforge.reportEnvelope.tool');

/** Stamp an envelope as report-tool output and name the producing tool. */
export function brandReportEnvelope(env: ToolArtifactEnvelope, tool: string): ToolArtifactEnvelope {
  Object.defineProperty(env, REPORT_ENVELOPE_TOOL, { value: tool, enumerable: false });
  return env;
}

export interface SplitToolArtifact {
  /** Validated, ready for `ui_tool` → SESSION_ARTIFACT_EVENT. */
  artifact: SessionArtifact;
  /** The registered tool that produced the artifact — the panel's provenance. */
  tool: string;
  /** What goes back to the model in the `role: 'tool'` echo. */
  modelData: { rendered: true; kind: SessionArtifact['kind']; summary: string };
}

/**
 * Recognize a tool result that carries an artifact, and split it.
 *
 * Returns `null` for every ordinary tool result — including one that merely has
 * an `artifact`-shaped field that does not validate, and one that hand-rolls
 * the envelope shape without the `reportEnvelope()` brand. A malformed payload
 * is NOT rendered and NOT silently dropped either: the caller falls through to
 * the normal path, so the model still receives the raw result and can answer in
 * prose. Painting a half-parsed report would be the one failure an owner cannot
 * detect by looking at it.
 */
export function splitToolArtifact(data: unknown): SplitToolArtifact | null {
  if (data === null || typeof data !== 'object') return null;
  if (!('artifact' in data) || !('summary' in data)) return null;
  const tool = (data as Record<symbol, unknown>)[REPORT_ENVELOPE_TOOL];
  if (typeof tool !== 'string' || tool.length === 0) return null;

  const summary = data.summary;
  if (typeof summary !== 'string' || summary.trim().length === 0) return null;

  const parsed = sessionArtifactSchema.safeParse(data.artifact);
  if (!parsed.success) return null;

  return {
    artifact: parsed.data,
    tool,
    modelData: {
      rendered: true,
      kind: parsed.data.kind,
      summary: summary.trim().slice(0, 1200),
    },
  };
}

// ─── Per-turn render cap (angle 15) ──────────────────────────────────────────

/**
 * A turn may paint the panel at most this many times. The client store already
 * bounds the STACK; this bounds the WIRE, so a looping model cannot spend the
 * turn re-rendering the same payload — the third artifact is the last one the
 * operator gets before the loop insists on prose.
 */
export const RENDER_ARTIFACT_CAP_PER_TURN = 3;

/** Per-turn gate — create one per assistant turn, call before every emission. */
export function makeRenderArtifactCap(): () => boolean {
  let used = 0;
  return () => {
    if (used >= RENDER_ARTIFACT_CAP_PER_TURN) return false;
    used += 1;
    return true;
  };
}
