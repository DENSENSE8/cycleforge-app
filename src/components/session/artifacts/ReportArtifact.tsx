'use client';

/**
 * ReportArtifact — the operator report on the assistant view panel.
 *
 * One named operating question, answered once, read standing up: the headline
 * number first, the judged KPIs next, the rows that back them, and then the
 * arithmetic the report used so the owner can audit it instead of phoning
 * someone. Every display string arrives pre-formatted from the tool
 * (ui-artifacts.ts contract) — this file does zero math and mutates nothing.
 *
 * `status` drives a colour accent ONLY: each accent is paired with a word and
 * a glyph so the verdict survives greyscale and colour-blindness. Every
 * `definition` is visible small print, never a hover-only tooltip.
 *
 * The one sanctioned interaction is the follow-up: it seeds the composer with
 * the sentence the report carries (`requestComposerSeed`, the same bus the
 * table/record renderers use). Data, never behavior.
 */

import type { ComponentType } from 'react';
import { AlertCircle, AlertTriangle, Check, Sparkles } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { cornerClass } from '@/design-system/tokens/radius';
import { requestComposerSeed } from '@/lib/assistant/composer-seed-store';
import { cn } from '@/utils/_cn';
import type {
  ArtifactReport,
  ArtifactReportKpi,
  ArtifactReportSection,
} from '@/lib/assistant/ui-artifacts';

/** Em dash — a `null` cell is a fact the report did not have, not a blank. */
const EMPTY_CELL = '—';

type KpiStatus = ArtifactReportKpi['status'];

/**
 * The verdict vocabulary. `word` + `Glyph` carry the signal; `ink` / `edge`
 * only reinforce it. `neutral` is a fact with no direction — it gets no
 * accent at all, because a report that paints every tile green teaches an
 * owner to stop reading the colours.
 */
const VERDICT: Record<
  KpiStatus,
  { word: string; ink: string; edge: string; Glyph: ComponentType<{ className?: string }> | null }
> = {
  good: { word: 'on target', ink: 'text-text-success', edge: 'border-l-border-success', Glyph: Check },
  watch: { word: 'watch', ink: 'text-text-warning', edge: 'border-l-border-warning', Glyph: AlertTriangle },
  bad: { word: 'off target', ink: 'text-text-danger', edge: 'border-l-border-danger', Glyph: AlertCircle },
  /** No word, no glyph, no edge — a direction-free fact is not a verdict. */
  neutral: { word: '', ink: '', edge: '', Glyph: null },
};

function cellText(value: string | number | null | undefined): string {
  if (value == null) return EMPTY_CELL;
  if (typeof value === 'number') return String(value);
  return value.length === 0 ? EMPTY_CELL : value;
}

/**
 * A cell only renders when the row actually OWNS the key: a column keyed
 * `toString` (or `constructor`, or `valueOf`) must resolve to an em dash, never
 * to `Object.prototype.toString` — which is a function, and took the whole
 * session view down with it.
 */
function ownCell(row: Record<string, string | number | null>, key: string): string {
  return Object.hasOwn(row, key) ? cellText(row[key]) : EMPTY_CELL;
}

export function ReportArtifact({ artifact }: { artifact: ArtifactReport }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-artifact-report>
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2.5"
        aria-label={artifact.title}
        tabIndex={0}
      >
        {/* ── header: what this is, the sentence it answers, what it counted ── */}
        <header className="min-w-0">
          <h2 className="text-role-title text-text-default">{artifact.title}</h2>
          <p className="mt-0.5 text-role-caption text-text-muted">{artifact.question}</p>
          <p className="mt-1 text-role-eyebrow text-text-faint">
            {artifact.scope} · as of {artifact.asOf}
          </p>
        </header>

        {/* ── headline: the number the question asked for ── */}
        <div
          className={cn(
            'mt-3 border border-border-hairline bg-surface-sunken px-3 py-2.5',
            cornerClass('surface'),
          )}
        >
          <p className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-role-display tabular-nums text-text-default">
              {artifact.headline.value}
            </span>
            {artifact.headline.unit ? (
              <span className="text-role-body text-text-muted">{artifact.headline.unit}</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-role-caption font-semibold text-text-default">
            {artifact.headline.label}
          </p>
          {artifact.headline.hint ? (
            <p className="mt-0.5 text-role-micro text-text-faint">{artifact.headline.hint}</p>
          ) : null}
        </div>

        {/* ── KPI grid: 2 narrow / 4 wide ── */}
        {artifact.kpis.length > 0 ? (
          <ul className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
            {artifact.kpis.map((kpi) => (
              <KpiCell key={kpi.id} kpi={kpi} />
            ))}
          </ul>
        ) : null}

        {/* ── sections: the rows behind the numbers ── */}
        {artifact.sections.map((section, i) => (
          <ReportSection key={`${section.title}-${i}`} section={section} />
        ))}

        {/* ── standards: the report's own arithmetic, on its face ── */}
        {artifact.standards.length > 0 ? (
          <section className="mt-4 min-w-0">
            <h3 className="text-role-caption font-semibold text-text-default">Standards used</h3>
            <dl className="mt-1 divide-y divide-border-hairline border-t border-border-hairline">
              {artifact.standards.map((standard, i) => (
                <div key={`${standard.label}-${i}`} className="flex gap-3 py-1.5">
                  <dt className="w-40 shrink-0 text-role-eyebrow text-text-faint">
                    {standard.label}
                  </dt>
                  <dd className="min-w-0 text-role-caption text-text-default">
                    <span className="tabular-nums font-semibold">{standard.value}</span>
                    {standard.unit ? (
                      <span className="ml-1 text-text-muted">{standard.unit}</span>
                    ) : null}
                    {standard.note ? (
                      <span className="block text-role-micro text-text-faint">{standard.note}</span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {/* ── notes: caveats and blind spots, never truncated ── */}
        {artifact.notes.length > 0 ? (
          <section className="mt-4 min-w-0">
            <h3 className="text-role-caption font-semibold text-text-default">Notes</h3>
            <ul className="mt-1 space-y-1">
              {artifact.notes.map((note, i) => (
                <li key={i} className="flex gap-1.5 text-role-caption text-text-muted">
                  <span aria-hidden="true" className="text-text-faint">
                    ·
                  </span>
                  <span className="min-w-0">{note}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {/* ── follow-ups: seed the composer with the next sentence ── */}
      {artifact.followUps.length > 0 ? (
        <div className="shrink-0 border-t border-border-hairline px-3 py-1.5">
          <p className="text-role-eyebrow text-text-faint">Ask next</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {artifact.followUps.map((followUp, i) => (
              <Button
                key={`${followUp.label}-${i}`}
                variant="ghost"
                size="sm"
                icon={<Sparkles />}
                ariaLabel={`Ask: ${followUp.question}`}
                onClick={() => requestComposerSeed({ text: followUp.question, autoSend: false })}
              >
                {followUp.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One judged number. The definition rides visibly under the value — an owner
 * auditing the math must not have to find a hover target to read it.
 */
function KpiCell({ kpi }: { kpi: ArtifactReportKpi }) {
  const verdict = VERDICT[kpi.status];
  const accented = kpi.status !== 'neutral';
  const Glyph = verdict.Glyph;

  return (
    <li
      className={cn(
        'min-w-0 border border-border-hairline bg-surface-card px-2.5 py-2',
        accented && cn('border-l-2', verdict.edge),
        cornerClass('row'),
      )}
    >
      <p className="text-role-eyebrow text-text-faint">{kpi.label}</p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-1">
        <span className="text-role-data tabular-nums text-text-default">{kpi.value}</span>
        {kpi.unit ? <span className="text-role-micro text-text-muted">{kpi.unit}</span> : null}
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-role-micro">
        {accented ? (
          <span className={cn('inline-flex items-center gap-1 font-semibold', verdict.ink)}>
            {Glyph ? <Glyph className="h-3 w-3" /> : null}
            {verdict.word}
          </span>
        ) : null}
        {kpi.delta ? (
          <span className="tabular-nums font-semibold text-text-muted">{kpi.delta}</span>
        ) : null}
        {kpi.target ? (
          <span className="tabular-nums text-text-faint">target {kpi.target}</span>
        ) : null}
      </p>
      <p className="mt-1 text-role-micro text-text-faint">{kpi.definition}</p>
    </li>
  );
}

/** A section table: semantic thead/tbody/tfoot, sticky header, own scroll. */
function ReportSection({ section }: { section: ArtifactReportSection }) {
  return (
    <section className="mt-4 min-w-0">
      <h3 className="text-role-caption font-semibold text-text-default">{section.title}</h3>
      {section.note ? (
        <p className="mt-0.5 text-role-micro text-text-faint">{section.note}</p>
      ) : null}
      <div
        className="mt-1 max-h-96 min-w-0 overflow-auto border border-border-hairline"
        role="region"
        aria-label={`${section.title} table`}
        tabIndex={0}
      >
        <table className="w-full border-collapse text-left text-role-caption">
          <thead className="sticky top-0 bg-surface-canvas">
            <tr>
              {section.columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'border-b border-border-hairline px-2.5 py-1.5 text-role-eyebrow text-text-faint',
                    col.align === 'right' && 'text-right',
                  )}
                >
                  {col.label}
                  {col.unit ? <span className="ml-1 normal-case">({col.unit})</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, i) => (
              <tr key={i} className="hover:bg-surface-sunken">
                {section.columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'border-b border-border-hairline px-2.5 py-1.5 text-text-default',
                      col.align === 'right' && 'text-right tabular-nums',
                    )}
                  >
                    {ownCell(row, col.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {section.totals ? (
            <tfoot className="sticky bottom-0 bg-surface-sunken">
              <tr>
                {section.columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'border-t border-border-default px-2.5 py-1.5 font-semibold text-text-default',
                      col.align === 'right' && 'text-right tabular-nums',
                    )}
                  >
                    {ownCell(section.totals ?? {}, col.key)}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {section.rows.length === 0 ? (
        <p className="mt-1 text-role-micro text-text-faint">No rows in this window.</p>
      ) : null}
    </section>
  );
}
