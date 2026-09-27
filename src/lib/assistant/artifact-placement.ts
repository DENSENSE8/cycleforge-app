/**
 * Where an artifact is shown — the display rule (operator, 2026-09-27).
 *
 *  - DATA renders INLINE in the chat column, under the answer that produced
 *    it: tables, records, charts, timelines, reports (KPIs). A table of at
 *    most {@link INLINE_TABLE_FULL_ROWS} rows shows whole; a longer one shows
 *    {@link INLINE_TABLE_PREVIEW_ROWS} rows and a "Show all" that opens the
 *    right panel.
 *  - DOCUMENTS (and the conversations / drafts / imports the operator works
 *    through like one) open in the RIGHT RAIL, with a compact card in the chat
 *    that re-opens them. A live turn's rail artifact opens the rail on arrival;
 *    inline data never does.
 *
 * Shared by the client (what renders where, what auto-opens) and the agent
 * loop (whether the answer may point at the right side at all).
 */

import type { SessionArtifact } from './ui-artifacts';

export type ArtifactPlacement = 'inline' | 'rail';

/** A table this long or shorter shows every row inline. */
export const INLINE_TABLE_FULL_ROWS = 8;
/** A longer table previews this many rows inline, then "Show all N rows". */
export const INLINE_TABLE_PREVIEW_ROWS = 5;

export function artifactPlacement(kind: SessionArtifact['kind']): ArtifactPlacement {
  switch (kind) {
    case 'table':
    case 'record':
    case 'chart':
    case 'timeline':
    case 'report':
      return 'inline';
    case 'document':
    case 'ticket_thread':
    case 'ticket_reply_draft':
    case 'import_triage':
      return 'rail';
    default:
      return assertNeverKind(kind);
  }
}

/** The data kinds that render inline — the narrowing twin of {@link artifactPlacement}. */
export type InlineArtifactData = Extract<SessionArtifact, { kind: 'table' | 'record' | 'chart' | 'timeline' | 'report' }>;

export function isInlineArtifact(artifact: SessionArtifact): artifact is InlineArtifactData {
  return artifactPlacement(artifact.kind) === 'inline';
}

function assertNeverKind(kind: never): never {
  throw new Error(`artifact kind without a placement: ${String(kind)}`);
}
