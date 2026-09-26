'use client';

/**
 * A {@link RecordLedger}'s list read as a whole — ONE set of counts, two
 * faces (operator 2026-09-25):
 *
 * - split view, nothing open → {@link RecordLedgerSummaryPane} fills the
 *   record pane (what the old evidence column showed when empty);
 * - in place → {@link RecordLedgerTally} tallies the facts the page does not
 *   already show at the toolbar's right end.
 *
 * The page supplies the numbers; these parts only paint them, so the two faces
 * can never disagree.
 */

import { RECORD_LABEL_CLASS } from '../../tokens/industrial-record';
import { cn } from '@/utils/_cn';
import { EvidenceNotice, EvidenceSection, EvidenceTitle } from './RecordEvidence';

/** One count of the list read as a whole. */
export interface RecordLedgerFact {
  label: string;
  value: number;
  /** Needs a decision now (past due, no photo) — tinted. The page sets it only for a non-zero count. */
  warn?: boolean;
  /** Also tallied on the toolbar in place — only a fact the page does not already show. */
  toolbar?: boolean;
}

/** The list read as a whole: the split pane with nothing open, and the in-place toolbar tally. */
export interface RecordLedgerSummary {
  title: string;
  sub?: string;
  facts: readonly RecordLedgerFact[];
  /** What opening a record gives the staffer. */
  note?: string;
}

/** The split pane with nothing open. */
export function RecordLedgerSummaryPane({ summary }: { summary: RecordLedgerSummary }) {
  return (
    <div className="flex min-h-full flex-col bg-mode-panel text-mode-ink" data-testid="record-ledger-summary">
      <EvidenceTitle sub={summary.sub}>{summary.title}</EvidenceTitle>
      {summary.facts.length > 0 ? (
        <EvidenceSection label="On this view">
          <dl className="flex flex-col">
            {summary.facts.map((fact) => (
              <div
                key={fact.label}
                className="flex items-center gap-3 border-b border-mode-rule py-1.5 last:border-b-0"
              >
                <dt className={cn(RECORD_LABEL_CLASS, 'flex-1', fact.warn ? 'text-mode-warn' : 'text-mode-ink')}>
                  {fact.label}
                </dt>
                <dd className="font-mono text-role-data font-bold tabular-nums text-mode-ink">
                  {fact.value.toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
        </EvidenceSection>
      ) : null}
      {summary.note ? <EvidenceNotice>{summary.note}</EvidenceNotice> : null}
      <p className={cn(RECORD_LABEL_CLASS, 'mt-auto border-t border-mode-rule px-4 py-2 text-mode-muted')}>
        Open a record · J / K step · Esc closes
      </p>
    </div>
  );
}

/** In place: the toolbar-flagged facts at the toolbar's right end. Nothing flagged, nothing painted. */
export function RecordLedgerTally({ summary }: { summary: RecordLedgerSummary }) {
  const facts = summary.facts.filter((fact) => fact.toolbar);
  if (facts.length === 0) return null;
  return (
    <dl
      aria-label={`${summary.title} totals`}
      data-testid="record-ledger-tally"
      className="flex shrink-0 items-center gap-3 border-l border-mode-edge px-3"
    >
      {facts.map((fact) => (
        <div key={fact.label} className="flex items-baseline gap-1.5">
          <dt className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>{fact.label}</dt>
          <dd
            className={cn(
              'font-mono text-role-data font-bold tabular-nums',
              fact.warn ? 'text-mode-warn' : 'text-mode-ink',
            )}
          >
            {fact.value.toLocaleString()}
          </dd>
        </div>
      ))}
    </dl>
  );
}
