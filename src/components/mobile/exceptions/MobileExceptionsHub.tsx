'use client';

/**
 * `/m/exceptions` — the phone Exceptions hub (owner 2026-09-28): every kind
 * (Fulfillment · Inventory · Receiving) over the ONE list `GET /api/exceptions`
 * the desk paints. A segment rail picks the kind (counts are the list's own
 * `counts`); with no kind picked the rows fall under a band per domain. A row
 * is tag · entity · the direct resolve verb, and opens the exception's record
 * `/m/exceptions/[key]`, where the phone resolver for that kind completes it.
 *
 * `lockDomain` renders the same list locked to one domain — the phone Orders
 * "Exceptions" view is Fulfillment, exactly as the desk's FBM › Exceptions.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, RefreshCw } from '@/components/Icons';
import { DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { ExceptionTag } from '@/components/mobile/exceptions/ExceptionTag';
import { mobileExceptionHref } from '@/components/mobile/exceptions/mobile-exception-href';
import { TriageRow } from '@/components/mobile/triage/TriageRow';
import { useTriageSelection } from '@/components/mobile/triage/useTriageSelection';
import { DESK_BAR_SEGMENT_CLASS, deskBarSegmentTone } from '@/design-system/components/DeskActionSlot';
import { Button, Inset, SearchField } from '@/design-system/primitives';
import { useExceptionsInfinite } from '@/hooks/exceptions';
import {
  EXCEPTION_DOMAIN_LABEL,
  EXCEPTION_DOMAIN_PARAM,
  EXCEPTION_DOMAINS,
  EXCEPTION_KIND_PARAM,
  EXCEPTION_KIND_SPEC,
  EXCEPTION_KINDS,
  MOBILE_EXCEPTIONS_PATH,
  parseExceptionDomain,
  parseExceptionKind,
  type ExceptionDomain,
  type ExceptionKind,
  type ExceptionRow,
} from '@/lib/exceptions/types';
import { cn } from '@/utils/_cn';

function ExceptionListRow({
  row,
  selected,
  onOpen,
}: {
  row: ExceptionRow;
  selected: boolean;
  onOpen: () => void;
}) {
  const entity = row.entity.label;
  const title = row.title || entity;
  return (
    <TriageRow
      title={title}
      meta={
        <>
          <ExceptionTag row={row} />
          <span className="min-w-0 truncate text-role-caption text-text-soft">
            {title !== entity ? <span className="font-mono">{entity}</span> : null}
            {title !== entity && row.detail ? ' · ' : null}
            {row.detail}
          </span>
        </>
      }
      selected={selected}
      actionLabel={row.resolveVerb}
      actionName={`${row.resolveVerb} — ${entity}: ${row.tag.label}`}
      inspectName={`Open exception ${entity}: ${row.tag.label}`}
      onInspect={onOpen}
      onAction={onOpen}
    />
  );
}

export function MobileExceptionsHub({ lockDomain }: { lockDomain?: ExceptionDomain } = {}) {
  const router = useRouter();
  const pathname = usePathname() ?? MOBILE_EXCEPTIONS_PATH;
  const searchParams = useSearchParams();
  const domain = lockDomain ?? parseExceptionDomain(searchParams?.get(EXCEPTION_DOMAIN_PARAM));
  const urlKind = parseExceptionKind(searchParams?.get(EXCEPTION_KIND_PARAM));
  // A kind outside the locked / chosen domain is not a filter this list can honour.
  const kind = urlKind && (!domain || EXCEPTION_KIND_SPEC[urlKind].domain === domain) ? urlKind : null;

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const list = useExceptionsInfinite({
    ...(domain ? { domain } : {}),
    ...(kind ? { kind } : {}),
    ...(debounced ? { q: debounced } : {}),
  });
  const pages = list.data?.pages;
  const rows = useMemo(() => (pages ?? []).flatMap((page) => page.rows), [pages]);
  const counts = pages?.[0]?.counts;

  /** Kinds in scope that the caller may see and that hold rows — plus the picked one, so it never vanishes. */
  const railKinds = useMemo<ExceptionKind[]>(
    () =>
      EXCEPTION_KINDS.filter((k) => {
        if (domain && EXCEPTION_KIND_SPEC[k].domain !== domain) return false;
        return k === kind || (counts?.[k] ?? 0) > 0;
      }),
    [counts, domain, kind],
  );
  const total = useMemo(
    () =>
      EXCEPTION_KINDS.reduce(
        (sum, k) => (domain && EXCEPTION_KIND_SPEC[k].domain !== domain ? sum : sum + (counts?.[k] ?? 0)),
        0,
      ),
    [counts, domain],
  );

  const setKind = (next: ExceptionKind | null) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (next) params.set(EXCEPTION_KIND_PARAM, next);
    else params.delete(EXCEPTION_KIND_PARAM);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const [selected, select] = useTriageSelection('exceptions');
  const here = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;
  const open = (row: ExceptionRow) => {
    select(row.key);
    router.push(mobileExceptionHref(row.key, here));
  };

  const renderRows = (slice: ExceptionRow[]): ReactNode => (
    <ul className="flex flex-col divide-y divide-border-hairline border-b border-border-hairline">
      {slice.map((row) => (
        <ExceptionListRow key={row.key} row={row} selected={selected === row.key} onOpen={() => open(row)} />
      ))}
    </ul>
  );

  /** No kind picked: one band per domain, rows in the list's own order under it. */
  const sections = useMemo(
    () =>
      kind
        ? null
        : EXCEPTION_DOMAINS.map((d) => ({ domain: d, rows: rows.filter((row) => row.domain === d) })).filter(
            (section) => section.rows.length > 0,
          ),
    [kind, rows],
  );

  const scopeLabel = kind
    ? EXCEPTION_KIND_SPEC[kind].label
    : domain
      ? EXCEPTION_DOMAIN_LABEL[domain]
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card" data-testid="mobile-exceptions-hub">
      <div className="shrink-0 bg-mode-bar">
        <div
          role="tablist"
          aria-label="Exception kinds"
          data-testid="mobile-exception-kinds"
          className="flex min-h-11 min-w-0 items-stretch overflow-x-auto border-b-2 border-mode-ink"
        >
          <button
            type="button"
            role="tab"
            aria-selected={kind === null}
            data-testid="mobile-exception-kind-all"
            onClick={() => setKind(null)}
            className={cn(DESK_BAR_SEGMENT_CLASS, 'border-r border-mode-edge', deskBarSegmentTone(kind === null))}
          >
            <span>All</span>
            {counts ? <span className="tabular-nums">{total > 99 ? '99+' : total}</span> : null}
          </button>
          {railKinds.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              data-testid={`mobile-exception-kind-${k}`}
              onClick={() => setKind(k)}
              className={cn(DESK_BAR_SEGMENT_CLASS, 'border-r border-mode-edge', deskBarSegmentTone(kind === k))}
            >
              <span className="whitespace-nowrap">{EXCEPTION_KIND_SPEC[k].label}</span>
              {counts ? <span className="tabular-nums">{(counts[k] ?? 0) > 99 ? '99+' : (counts[k] ?? 0)}</span> : null}
            </button>
          ))}
        </div>
        <div className="border-b border-border-hairline bg-surface-card">
          <Inset space="chip">
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Search order, SKU, PO, bin or tag…"
              tone="neutral"
              hideUnderline
              isSearching={list.isFetching && Boolean(debounced)}
            />
          </Inset>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.isError ? (
          <div className="flex flex-col items-start gap-3 border-b border-border-hairline px-3 py-5">
            <p className="flex items-center gap-2 text-role-caption font-semibold text-text-danger">
              <AlertTriangle className="h-4 w-4" /> Couldn&apos;t load exceptions.
            </p>
            <Button variant="secondary" radius="flush" size="sm" icon={<RefreshCw />} onClick={() => void list.refetch()}>
              Retry
            </Button>
          </div>
        ) : list.isPending ? (
          <p className="border-b border-border-hairline px-3 py-2 text-role-caption text-text-muted">Loading exceptions…</p>
        ) : rows.length === 0 ? (
          <div className="border-b border-border-hairline px-3 py-8 text-center" data-testid="mobile-exceptions-empty">
            <p className="text-role-data font-semibold text-text-default">
              {debounced ? 'Nothing matches this search.' : scopeLabel ? `No ${scopeLabel} exceptions.` : 'No exceptions.'}
            </p>
            <p className="mt-1 text-role-caption text-text-muted">
              {debounced ? 'Clear the search to see the full list.' : 'Nothing is blocked right now.'}
            </p>
          </div>
        ) : sections ? (
          sections.map((section) => (
            <section key={section.domain} aria-label={EXCEPTION_DOMAIN_LABEL[section.domain]}>
              {/* The band names the domain only when the list spans more than one. */}
              {domain ? null : (
                <DetailSectionHeading>{EXCEPTION_DOMAIN_LABEL[section.domain]}</DetailSectionHeading>
              )}
              {renderRows(section.rows)}
            </section>
          ))
        ) : (
          renderRows(rows)
        )}

        {list.hasNextPage ? (
          <div className="px-3 py-3">
            <Button
              variant="secondary"
              radius="flush"
              size="lg"
              className="w-full"
              loading={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
