'use client';

/**
 * Dashboard · cross-domain attention band.
 *
 * The actual answer to "condense the dashboard into one surface":
 * **the glance is cross-domain; the work surface stays domain-scoped.** This
 * band sits above the domain-specific KPI tiles and reads across BOTH domains at
 * once — cartons piling up at the dock are the operator's problem whether or not
 * they happen to be looking at the outbound board. Below it, `OutboundKpiStrip`
 * / `DashboardReceivingKpiStrip` stay exactly as they were: the domain you are
 * standing in, in detail.
 *
 * Before this, "context-aware KPI strip" meant *swap the whole rollup when the
 * domain switches* — which is not a cross-domain read, it is the same
 * single-domain read behind a different switch. You had to leave a domain to
 * learn whether it needed you.
 *
 * Archetype: **Monitor** (`contextual-display.md`) — read-only, org-scoped, no
 * durable selection, no mutation. Composes the house `KpiTile` anatomy from
 * `@/design-system/components/monitor`; there is no second gauge language here.
 *
 * Interaction is filter-only (C6): a tile is a LINK that applies an **ephemeral
 * URL facet** — it switches the domain and/or the lifecycle tab of the grid
 * below. A tile never selects a row and never mutates. Every facet it writes is
 * a param `/dashboard` actually owns (`DASHBOARD_ROUTE_PARAMS`), so a later mode
 * switch can construct cleanly over it.
 *
 * Cost: both sources are the SAME query keys the receiving KPI band and the
 * outbound queue counts already use, so mounting this adds cache readers, not
 * endpoints. It deliberately sets `refetchInterval: false` — the sidebar's own
 * 30s poll keeps the shared entry warm where it exists, and the default outbound
 * dashboard must not acquire a new poll just to render a glance.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle } from '@/components/Icons';
import {
  KpiTile,
  MONITOR_KPI_TILE_CLASS,
  metricIntentTextClass,
  type MetricIntent,
} from '@/design-system/components/monitor';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import type { IncomingSummary } from '@/components/sidebar/receiving/incoming/incoming-summary-types';
import type { DashboardDomain } from '@/lib/dashboard/dashboard-domains';
import { cn } from '@/utils/_cn';

const BAND_CLASS = 'flex flex-wrap gap-3';
const CELL_CLASS = 'min-w-0 grow basis-40';

/** Facet hrefs — only params `/dashboard` owns, so a mode switch constructs cleanly. */
const INBOUND_TRIAGE_HREF = '/dashboard?mode=inbound&sort=scanned_newest';
const INBOUND_UNBOX_HREF = '/dashboard?mode=inbound&sort=unboxed_newest';
const OUTBOUND_PENDING_HREF = '/dashboard?unshipped=';

interface AttentionFact {
  id: string;
  domain: DashboardDomain;
  label: string;
  value: number;
  intent: MetricIntent;
  href: string;
  tooltip: string;
  /** Higher wins the left-most slot. Zero-count facts never render at all. */
  severity: number;
}

/**
 * Shares the receiving summary's cache entry, but never installs a poll of its
 * own — see the file header.
 */
function useIncomingSummarySnapshot(): { data: IncomingSummary | null; isPending: boolean } {
  const { data, isPending } = useQuery<{ success: true } & IncomingSummary>({
    queryKey: ['receiving-lines-incoming-summary'],
    queryFn: async () => {
      const res = await fetch('/api/receiving-lines/incoming/summary', { cache: 'no-store' });
      if (!res.ok) throw new Error('summary fetch failed');
      return res.json();
    },
    refetchInterval: false,
    staleTime: 60_000,
  });
  return { data: data ?? null, isPending };
}

/** Pure zoning — severity DESC, zero counts dropped. Testable without React. */
export function buildAttentionFacts(input: {
  inbound: Pick<IncomingSummary, 'delivered_unopened' | 'delivered_not_unboxed'> | null;
  outbound: { urgent: number; pending: number } | null;
}): AttentionFact[] {
  const facts: AttentionFact[] = [];
  const { inbound, outbound } = input;

  if (inbound?.delivered_unopened) {
    facts.push({
      id: 'inbound-at-dock',
      domain: 'inbound',
      label: 'At the dock',
      value: inbound.delivered_unopened,
      intent: 'bad',
      href: INBOUND_TRIAGE_HREF,
      tooltip: 'Delivered cartons nobody has scanned in yet — open Receiving › Triage.',
      severity: 90,
    });
  }
  if (outbound?.urgent) {
    facts.push({
      id: 'outbound-urgent',
      domain: 'outbound',
      label: 'Urgent to ship',
      value: outbound.urgent,
      intent: 'bad',
      href: OUTBOUND_PENDING_HREF,
      tooltip: 'Pending orders past or near their ship-by date.',
      severity: 85,
    });
  }
  if (inbound?.delivered_not_unboxed) {
    facts.push({
      id: 'inbound-to-unbox',
      domain: 'inbound',
      label: 'To unbox',
      value: inbound.delivered_not_unboxed,
      intent: 'warn',
      href: INBOUND_UNBOX_HREF,
      tooltip: 'Scanned-in cartons still waiting to be unboxed.',
      severity: 60,
    });
  }
  if (outbound?.pending) {
    facts.push({
      id: 'outbound-pending',
      domain: 'outbound',
      label: 'To ship',
      value: outbound.pending,
      intent: 'neutral',
      href: OUTBOUND_PENDING_HREF,
      tooltip: 'Everything in the Pending queue.',
      severity: 20,
    });
  }

  return facts.sort((a, b) => b.severity - a.severity);
}

/**
 * Typed LOADING (3.3): a reserved skeleton at the tile's real geometry, so the
 * band never reflows when the two sources settle at different moments.
 */
function AttentionSkeleton() {
  return (
    <div className={cn(BAND_CLASS, 'animate-pulse')} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading cross-domain attention metrics…</span>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className={cn(MONITOR_KPI_TILE_CLASS, CELL_CLASS, 'h-24')}>
          <div className="h-2.5 w-16 rounded-full bg-surface-strong" />
          <div className="mt-2 h-7 w-14 rounded bg-surface-strong" />
          <div className="mt-2.5 h-2.5 w-20 rounded-full bg-surface-strong" />
        </div>
      ))}
    </div>
  );
}

/**
 * Typed EMPTY (3.3): settled with nothing to raise is an all-clear, which is a
 * real answer — distinct from "still loading" above and from a source failure,
 * which degrades to rendering nothing rather than taking down the dashboard.
 */
function AttentionAllClear() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-field">
      <CheckCircle className="h-3.5 w-3.5 text-text-success" />
      <p className="text-role-caption font-semibold text-text-muted">
        Nothing needs you across inbound or outbound right now.
      </p>
    </div>
  );
}

function AttentionTile({ fact, activeDomain }: { fact: AttentionFact; activeDomain: DashboardDomain }) {
  const tone = metricIntentTextClass(fact.intent);
  const crossDomain = fact.domain !== activeDomain;
  return (
    <HoverTooltip label={fact.tooltip} focusable className={cn('block', CELL_CLASS)}>
      <Link href={fact.href} className="block h-full">
        <KpiTile
          label={fact.label}
          value={fact.value.toLocaleString()}
          valueClassName={fact.intent === 'warn' || fact.intent === 'bad' ? tone : undefined}
          footer={
            <span
              className={cn(
                'mt-1.5 inline-flex items-center gap-1.5 text-role-eyebrow uppercase tracking-widest',
                // The cross-domain half is the whole point of the band, so it is
                // the half that gets marked — a fact from the domain you are
                // already standing in needs no "go here" cue.
                crossDomain ? tone : 'text-text-faint',
              )}
            >
              {crossDomain ? <AlertTriangle className="h-3 w-3" aria-hidden /> : null}
              {fact.domain === 'inbound' ? 'Inbound' : 'Outbound'}
            </span>
          }
          className="h-full"
        />
      </Link>
    </HoverTooltip>
  );
}

export function DashboardAttentionStrip({ domain }: { domain: DashboardDomain }) {
  const inbound = useIncomingSummarySnapshot();
  const outboundCounts = useQuery({ ...unshippedQueueCountsQuery(), refetchInterval: false });

  // ONE combined gate — the two sources must arrive together or the band
  // reflows mid-load (the same contract OutboundKpiStrip holds).
  if (inbound.isPending || outboundCounts.isPending) return <AttentionSkeleton />;

  const facts = buildAttentionFacts({
    inbound: inbound.data,
    // `byStage.pending` is the queue tally the sidebar legend and nav badge
    // already read — the same number, not a second derivation.
    outbound: outboundCounts.data
      ? {
          urgent: outboundCounts.data.urgent ?? 0,
          pending: outboundCounts.data.byStage?.pending ?? 0,
        }
      : null,
  });

  if (facts.length === 0) return <AttentionAllClear />;

  return (
    <div className={BAND_CLASS} aria-label="Cross-domain attention">
      {facts.map((fact) => (
        <AttentionTile key={fact.id} fact={fact} activeDomain={domain} />
      ))}
    </div>
  );
}
