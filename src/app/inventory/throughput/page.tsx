import { requirePermission } from '@/lib/auth/page-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/pane-header';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  KpiTile,
  OpsKpiBand,
  OpsKpiBandCell,
  OpsKpiBandEmpty,
} from '@/design-system/components/monitor';
import { Panel } from '@/design-system/primitives';


export const dynamic = 'force-dynamic';

/** /inventory/throughput */

type Range = '24h' | '72h' | '7d';

const RANGE_HOURS: Record<Range, number> = {
  '24h': 24,
  '72h': 72,
  '7d': 168,
};

interface Totals {
  events: number;
  actors: number;
  units: number;
}

interface ByTypeRow {
  event_type: string;
  count: number;
}

interface ByActorRow {
  actor_staff_id: number | null;
  actor_name: string | null;
  count: number;
  last_active: Date | null;
}

interface HourlyRow {
  station: string;
  hour_bucket: Date;
  count: number;
}

async function loadTotals(hours: number, orgId: OrgId): Promise<Totals> {
  try {
    const r = await tenantQuery<Totals>(
      orgId,
      `SELECT COUNT(*)::int AS events,
              COUNT(DISTINCT actor_staff_id)::int AS actors,
              COUNT(DISTINCT serial_unit_id)::int AS units
         FROM inventory_events
        WHERE occurred_at > NOW() - ($1::int * INTERVAL '1 hour')
          AND organization_id = $2`,
      [hours, orgId],
    );
    return r.rows[0] ?? { events: 0, actors: 0, units: 0 };
  } catch {
    return { events: 0, actors: 0, units: 0 };
  }
}

async function loadByType(hours: number, orgId: OrgId): Promise<ByTypeRow[]> {
  try {
    const r = await tenantQuery<ByTypeRow>(
      orgId,
      `SELECT event_type, COUNT(*)::int AS count
         FROM inventory_events
        WHERE occurred_at > NOW() - ($1::int * INTERVAL '1 hour')
          AND organization_id = $2
        GROUP BY event_type
        ORDER BY count DESC, event_type ASC`,
      [hours, orgId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function loadByActor(hours: number, orgId: OrgId): Promise<ByActorRow[]> {
  try {
    const r = await tenantQuery<ByActorRow>(
      orgId,
      `SELECT ie.actor_staff_id, s.name AS actor_name,
              COUNT(*)::int AS count,
              MAX(ie.occurred_at) AS last_active
         FROM inventory_events ie
         LEFT JOIN staff s ON s.id = ie.actor_staff_id AND s.organization_id = $2
        WHERE ie.occurred_at > NOW() - ($1::int * INTERVAL '1 hour')
          AND ie.organization_id = $2
        GROUP BY ie.actor_staff_id, s.name
        ORDER BY count DESC, last_active DESC NULLS LAST
        LIMIT 50`,
      [hours, orgId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function loadHourly(hours: number, orgId: OrgId): Promise<HourlyRow[]> {
  try {
    const r = await tenantQuery<HourlyRow>(
      orgId,
      `SELECT COALESCE(station, 'UNKNOWN') AS station,
              date_trunc('hour', occurred_at) AS hour_bucket,
              COUNT(*)::int AS count
         FROM inventory_events
        WHERE occurred_at > NOW() - ($1::int * INTERVAL '1 hour')
          AND organization_id = $2
        GROUP BY station, hour_bucket
        ORDER BY hour_bucket DESC, station ASC`,
      [hours, orgId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

function isValidRange(value: string | undefined): value is Range {
  return value === '24h' || value === '72h' || value === '7d';
}

export default async function ThroughputPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requirePermission('admin.view', { enforce: true });
  const orgId = user.organizationId;

  const params = await searchParams;
  const range: Range = isValidRange(params.range) ? params.range : '24h';
  const hours = RANGE_HOURS[range];

  const [totals, byType, byActor, hourly] = await Promise.all([
    loadTotals(hours, orgId),
    loadByType(hours, orgId),
    loadByActor(hours, orgId),
    loadHourly(hours, orgId),
  ]);

  const maxTypeCount = byType[0]?.count ?? 1;
  const maxHourly = hourly.reduce((m, r) => Math.max(m, r.count), 1);
  const hourlyStations = Array.from(new Set(hourly.map((r) => r.station))).sort();
  const hourlyByCell = new Map(hourly.map((r) => [`${r.station}|${r.hour_bucket.toISOString()}`, r.count]));
  const hourlyBuckets = Array.from(new Set(hourly.map((r) => r.hour_bucket.toISOString()))).sort();

  return (
    <div className="min-h-screen bg-surface-canvas">
      <PageHeader
        backHref="/inventory/health"
        title="Throughput"
        rightSlot={
          <nav className="flex items-center gap-1 text-xs">
            {(['24h', '72h', '7d'] as const).map((r) => (
              <Link
                key={r}
                href={`/inventory/throughput?range=${r}`}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  range === r
                    ? 'bg-blue-600 text-white'
                    : 'border border-border-default bg-surface-card text-text-muted hover:bg-surface-hover'
                }`}
              >
                {r}
              </Link>
            ))}
          </nav>
        }
      />
      <div className="space-y-6 p-8">
        <p className="text-sm text-text-muted">
          Aggregations over <code className="rounded bg-surface-sunken px-1 py-0.5 text-xs">inventory_events</code>.
          Numbers stay sparse until the flagged paths start emitting.
        </p>

        {/* Totals */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Tile label="Events" value={totals.events.toLocaleString()} accent="text-blue-700" />
          <Tile label="Distinct actors" value={totals.actors.toLocaleString()} accent="text-emerald-700" />
          <Tile label="Distinct units touched" value={totals.units.toLocaleString()} accent="text-purple-700" />
        </section>

        {/* By event type */}
        <Panel radius="lg" padding="none">
          <header className="border-b border-border-hairline px-6 py-3">
            <h2 className="text-lg font-medium text-text-default">By event type</h2>
          </header>
          {byType.length === 0 ? (
            <p className="px-6 py-8 text-sm text-text-muted">No events in this range.</p>
          ) : (
            <ul className="divide-y divide-border-hairline">
              {byType.map((t) => (
                <li key={t.event_type} className="flex items-center gap-4 px-6 py-2">
                  <code className="w-44 shrink-0 font-mono text-xs text-text-muted">{t.event_type}</code>
                  <div className="flex-1">
                    <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${(t.count / maxTypeCount) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-text-default">{t.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Station × hour heatmap */}
        {hourly.length > 0 ? (
          <Panel radius="lg" padding="none">
            <header className="border-b border-border-hairline px-6 py-3">
              <h2 className="text-lg font-medium text-text-default">Station × hour</h2>
              <p className="mt-1 text-xs text-text-soft">
                Heatmap intensity ∝ count. Hover for tooltip; cells with 0 events are blank.
              </p>
            </header>
            {/*
              Intentional non-collection <table>: station × hour heatmap cells are a
              matrix visualization (dynamic hour columns + intensity tiles), not a
              row/column collection list. AdminTable is the wrong primitive here.
            */}
            <div className="overflow-x-auto px-6 py-4">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left font-medium text-text-soft">Station</th>
                    {hourlyBuckets.map((iso) => (
                      <th key={iso} className="px-1 py-1 text-center font-normal text-role-micro text-text-faint">
                        {new Date(iso).toLocaleTimeString([], { hour: 'numeric', hour12: true })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hourlyStations.map((station) => (
                    <tr key={station}>
                      <td className="px-2 py-1 font-mono text-role-caption text-text-muted">{station}</td>
                      {hourlyBuckets.map((iso) => {
                        const count = hourlyByCell.get(`${station}|${iso}`) ?? 0;
                        const intensity = count === 0 ? 0 : Math.max(0.1, count / maxHourly);
                        return (
                          <td key={iso} className="p-0.5">
                            <HoverTooltip label={`${station} @ ${new Date(iso).toLocaleString()}: ${count}`} asChild>
                              <div
                                className="h-6 w-6 rounded"
                                style={{
                                  backgroundColor: count === 0 ? '#f1f5f9' : `rgba(37, 99, 235, ${intensity.toFixed(2)})`,
                                }}
                              />
                            </HoverTooltip>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}

        {/* By actor */}
        <section className="space-y-3">
          <header>
            <h2 className="text-lg font-medium text-text-default">By actor</h2>
          </header>
          {byActor.length === 0 ? (
            <OpsKpiBandEmpty title="No actors in this range." description={`Last ${range}`} />
          ) : (
            <OpsKpiBand aria-label="Events by actor">
              {byActor.map((a) => (
                <OpsKpiBandCell key={a.actor_staff_id === null ? 'actor:system' : `actor:${a.actor_staff_id}`}>
                  <KpiTile
                    label={a.actor_name ?? (a.actor_staff_id ? `#${a.actor_staff_id}` : 'system')}
                    labelClassName="normal-case tracking-normal truncate"
                    value={
                      <>
                        {a.count.toLocaleString()}
                        <span className="ml-2 align-middle text-role-caption font-normal tracking-normal text-text-soft">
                          {a.last_active ? new Date(a.last_active).toLocaleString() : '—'}
                        </span>
                      </>
                    }
                  />
                </OpsKpiBandCell>
              ))}
            </OpsKpiBand>
          )}
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <Panel radius="lg" padding="none" className="px-6 py-4">
      <p className="text-xs text-text-soft">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${accent}`}>{value}</p>
    </Panel>
  );
}
