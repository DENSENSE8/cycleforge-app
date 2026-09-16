'use client';

/**
 * FIND confirmation column: status pin → outline → chronology → sticky handoff.
 * One chrome tree for every ?sel= type. Outline chips filter the same stream
 * (Overview = all kinds).
 *
 * ## Layout is one tree at two DENSITIES — and density is not the viewport
 *
 * The outline rail sits BESIDE the stream when there is measure for it, and
 * ABOVE it when there is not. That was five `md:` breakpoints until
 * 2026-09-13, which made this file disagree with `SearchResultRow` — the row
 * that shares its surface and has refused a viewport query since 2026-09-12:
 * "a desktop sidebar rail is narrow too, and a viewport query corrupts it."
 *
 * `SearchFindPreviewEmbed` is that corruption, live: it paints this frame in a
 * scan-station preview pane a few hundred px wide on a 1440px monitor, where
 * every `md:` fires and reserves a 224px outline gutter the pane cannot spare.
 * The viewport was never the fact anyone wanted.
 *
 * So the gate is {@link useFindDensity} — declared by the route (or by the
 * embedding pane), the row's own axis, the row's own two names. Still ONE
 * tree: `compact` stacks the same nodes, it does not mount a second flow.
 * Never reintroduce a `md:` / `lg:` gate here, and never a pair of
 * breakpoint-hidden trees — the guard in `SearchDossierFrame.test.ts` greps
 * this file for exactly that, which is why it is described and not spelled.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/design-system/primitives';
import { ChevronLeft } from '@/components/Icons';
import { StatusBadge } from '@/design-system/components/StatusBadge';
import { cn } from '@/utils/_cn';
import {
  FIND_OUTLINE_CHIPLESS_KINDS,
  FIND_OUTLINE_LABEL,
  filterEventsByKind,
  type FindEvent,
  type FindEventKind,
  type FindOutlineEntry,
} from '@/lib/search/find-dossier-model';
import { SearchFindStream } from '@/components/search/dossier/SearchFindStream';
import { useFindDensity } from '@/components/search/find-density-context';
import type {
  SearchDossierFact,
  SearchDossierFinding,
  SearchDossierHandoff,
  SearchDossierLine,
} from '@/lib/search/search-dossier-model';

export function SearchDossierFrame({
  entity,
  title,
  findings,
  facts,
  outline = [],
  events = [],
  lines = [],
  emptyLines,
  handoffs,
  onBack,
}: {
  entity: string;
  title: string;
  findings: SearchDossierFinding[];
  facts: SearchDossierFact[];
  outline?: readonly FindOutlineEntry[];
  events?: readonly FindEvent[];
  lines?: SearchDossierLine[];
  emptyLines: string;
  handoffs: SearchDossierHandoff[];
  onBack?: () => void;
}) {
  const density = useFindDensity();
  /** Rail beside the stream, or stacked above it. One tree, two arrangements. */
  const railBeside = density === 'comfortable';
  const statusFact = facts.find((fact) => fact.id === 'status');
  const otherFacts = facts.filter((fact) => fact.id !== 'status');
  const statusValue = statusFact?.value?.trim() || 'unknown';
  const exceptionHref = handoffs.find((h) => h.primary)?.href ?? handoffs[0]?.href;
  const [kindFilter, setKindFilter] = useState<FindEventKind | null>(null);

  useEffect(() => {
    setKindFilter(null);
  }, [entity, title]);

  useEffect(() => {
    if (kindFilter && !outline.some((entry) => entry.kind === kindFilter)) {
      setKindFilter(null);
    }
  }, [kindFilter, outline]);

  const visibleEvents = useMemo(
    () => filterEventsByKind(events, kindFilter),
    [events, kindFilter],
  );

  const handoffButtons =
    handoffs.length > 0 ? (
      <div
        className="flex min-w-0 flex-wrap items-center justify-end gap-2"
        data-testid="search-dossier-handoff"
      >
        {handoffs.map((handoff) => (
          <Link key={handoff.href + handoff.label} href={handoff.href}>
            <Button variant={handoff.primary ? (findings.length > 0 ? 'warning' : 'primary') : 'secondary'}>
              {handoff.label}
            </Button>
          </Link>
        ))}
      </div>
    ) : null;

  // The rail paints CHIPS, not a table of contents: `qty` and `custody` are
  // chipless by law (FIND_OUTLINE_CHIPLESS_KINDS) and `hop` self-gates on a
  // zero count, so "Hops" appears only when a unit actually came back.
  const chips = outline.filter(
    (entry) => !FIND_OUTLINE_CHIPLESS_KINDS.includes(entry.kind),
  );

  // Beside the stream the chips are a vertical, full-width rail; stacked above
  // it they are a wrapping chip row. Same buttons, same order, same pressed
  // state — only the flow direction moves.
  const outlineFaceClass = railBeside ? 'w-full justify-start' : undefined;
  const outlineKindButtons =
    chips.length > 0 ? (
      <div
        className={cn(
          'flex min-w-0 gap-1.5',
          railBeside ? 'flex-col flex-nowrap' : 'flex-wrap',
        )}
        data-testid="search-dossier-outline-kinds"
        role="toolbar"
        aria-label="Investigation outline"
      >
        <Button
          type="button"
          size="sm"
          radius="flush"
          variant={kindFilter == null ? 'secondary' : 'ghost'}
          aria-pressed={kindFilter == null}
          data-testid="search-dossier-outline-overview"
          className={outlineFaceClass}
          onClick={() => setKindFilter(null)}
        >
          Overview
        </Button>
        {chips.map((entry) => {
          const pressed = kindFilter === entry.kind;
          return (
            <Button
              key={entry.kind}
              type="button"
              size="sm"
              radius="flush"
              variant={pressed ? 'secondary' : 'ghost'}
              aria-pressed={pressed}
              data-kind={entry.kind}
              className={outlineFaceClass}
              onClick={() => setKindFilter(entry.kind)}
            >
              {FIND_OUTLINE_LABEL[entry.kind]}
              <span className="text-role-data text-text-default">{entry.count}</span>
            </Button>
          );
        })}
      </div>
    ) : null;

  // Order-level facts (Order id · Tracking · Qty) moved OUT of the rail and
  // into the centre (operator, 2026-09-12): the rail is navigation, the centre
  // is the record. A dense multi-column band uses the full measure instead of
  // leaving a dead right-hand gutter — but only where there IS measure. The
  // 3/4-up ladder is gated on density for the same reason the rail is: at
  // `compact` a four-column band truncates every value it prints.
  const factsBand =
    otherFacts.length > 0 ? (
      <dl
        className={cn(
          'grid grid-cols-2 gap-x-6 gap-y-2 inset-field',
          railBeside && 'sm:grid-cols-3 xl:grid-cols-4',
        )}
        data-testid="search-dossier-facts"
      >
        {otherFacts.map((fact) => (
          <div key={fact.id} className="flex min-w-0 flex-col">
            <dt className="text-role-caption text-text-faint">{fact.label}</dt>
            <dd className="truncate text-role-data text-text-default">{fact.value}</dd>
          </div>
        ))}
      </dl>
    ) : null;

  return (
    <article
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-surface-card"
      data-testid="search-dossier"
      data-entity={entity}
      aria-label={`${entity} ${title}`}
    >
      <div
        className="flex shrink-0 flex-col gap-2 inset-field"
        data-testid="search-dossier-status-row"
      >
        <div className="flex min-w-0 items-center gap-3">
          {/* A back affordance says which direction it goes BEFORE it is read.
              A bare word "Results" is a label with no direction, and it sat
              beside a status badge and a title, which is exactly where a page
              puts its nouns — so it read as a heading, not a control. The
              leading chevron is the whole difference. */}
          {onBack ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronLeft />}
              onClick={onBack}
              data-testid="search-dossier-back"
              aria-label="Back to results"
            >
              Results
            </Button>
          ) : null}
          <StatusBadge status={statusValue} />
          <h1
            className="min-w-0 flex-1 truncate text-role-title text-text-default"
            data-testid="search-dossier-entity"
          >
            {title}
          </h1>
        </div>
      </div>

      {findings.length > 0 ? (
        <section
          className="shrink-0 bg-surface-warning px-4 py-3"
          data-testid="search-dossier-findings"
        >
          <ul className="space-y-2">
            {findings.map((finding) => (
              <li key={finding.key}>
                <p className="text-role-body font-semibold text-text-default">{finding.label}</p>
                <p className="text-role-caption text-text-soft">{finding.hint}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden',
          railBeside && 'flex-row',
        )}
        data-testid="search-dossier-investigation"
      >
        {/* The rail band ALWAYS mounts: `search-dossier-outline` is part of the
            one chrome tree, and the contract test pins an identical band order
            across order / unit / carton / SKU. What is conditional is only its
            WIDTH — a chipless entity (custody-only stream) reserves no 224px
            gutter, and a compact measure reserves none either, because 224 of
            390 is the record. */}
        <section
          className={cn(
            'shrink-0',
            outlineKindButtons && 'inset-field',
            outlineKindButtons && railBeside && 'w-56',
          )}
          data-testid="search-dossier-outline"
        >
          {outlineKindButtons}
        </section>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {factsBand}
          <section data-testid="search-dossier-chronology">
            <div data-testid="search-dossier-contents">
              {events.length > 0 ? (
                <SearchFindStream
                  events={visibleEvents}
                  empty={emptyLines}
                  exceptionHref={exceptionHref}
                />
              ) : lines.length === 0 ? (
                <p className="px-4 py-6 text-role-caption text-text-soft">{emptyLines}</p>
              ) : (
                <ul>
                  {lines.map((line) => (
                    <li key={line.id} className="px-4 py-3">
                      <p className="text-role-body text-text-default">{line.title}</p>
                      {line.meta ? (
                        <p className="text-role-caption text-text-soft">{line.meta}</p>
                      ) : null}
                      {line.finding ? (
                        <p className="text-role-caption text-text-danger">{line.finding}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      {handoffButtons ? (
        <div className="shrink-0 inset-field">{handoffButtons}</div>
      ) : null}
    </article>
  );
}
