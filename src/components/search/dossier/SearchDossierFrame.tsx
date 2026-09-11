'use client';

/**
 * FIND confirmation column: status pin → outline → chronology → sticky handoff.
 * One chrome tree for every ?sel= type. Outline chips filter the same stream
 * (Overview = all kinds). Density is stack vs column — not a dual tree.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/design-system/primitives';
import { StatusBadge } from '@/design-system/components/StatusBadge';
import { cn } from '@/utils/_cn';
import {
  FIND_OUTLINE_LABEL,
  filterEventsByKind,
  type FindEvent,
  type FindEventKind,
  type FindOutlineEntry,
} from '@/lib/search/find-dossier-model';
import { SearchFindStream } from '@/components/search/dossier/SearchFindStream';
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

  const outlineKindButtons =
    outline.length > 0 ? (
      <div
        className="flex min-w-0 flex-wrap gap-1.5 md:flex-col md:flex-nowrap"
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
          className="md:w-full md:justify-start"
          onClick={() => setKindFilter(null)}
        >
          Overview
        </Button>
        {outline.map((entry) => {
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
              className="md:w-full md:justify-start"
              onClick={() => setKindFilter(entry.kind)}
            >
              {FIND_OUTLINE_LABEL[entry.kind]}
              <span className="text-role-data text-text-default">{entry.count}</span>
            </Button>
          );
        })}
      </div>
    ) : null;

  return (
    <article
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-surface-card"
      data-testid="search-dossier"
      data-entity={entity}
      aria-label={`${entity} ${title}`}
    >
      <div
        className="flex shrink-0 flex-col gap-2 border-b border-border-hairline inset-field"
        data-testid="search-dossier-status-row"
      >
        <div className="flex min-w-0 items-center gap-3">
          {onBack ? (
            <Button variant="ghost" size="sm" onClick={onBack}>
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
          className="shrink-0 border-b border-border-hairline bg-surface-warning px-4 py-3"
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
        className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row"
        data-testid="search-dossier-investigation"
      >
        <section
          className={cn(
            'shrink-0 border-b border-border-hairline inset-field',
            'md:w-1/3 md:max-w-xs md:border-b-0 md:border-r',
          )}
          data-testid="search-dossier-outline"
        >
          {outlineKindButtons}
          {otherFacts.length > 0 ? (
            <div
              className={outlineKindButtons ? 'mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1' : 'flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1'}
              data-testid="search-dossier-facts"
            >
              {otherFacts.map((fact) => (
                <span key={fact.id} className="flex shrink-0 items-baseline gap-1.5">
                  <span className="text-role-caption text-text-faint">{fact.label}</span>
                  <span className="text-role-data text-text-default">{fact.value}</span>
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <section
            className="border-t border-border-hairline md:border-t-0"
            data-testid="search-dossier-chronology"
          >
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
                <ul className="divide-y divide-border-hairline">
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
        <div className="shrink-0 border-t border-border-hairline inset-field">{handoffButtons}</div>
      ) : null}
    </article>
  );
}
