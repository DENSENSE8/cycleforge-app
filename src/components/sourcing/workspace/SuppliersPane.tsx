import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { Link2, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { jsonFetch, formatCents, SUPPLIER_TYPE_LABEL } from '../sourcing-shared';
import type { SupplierStats } from './sourcing-workspace-types';
import { Centered, Empty } from './WorkspaceShared';

/** Suppliers — rollup of sellers/distributors with spend stats + the editor door. */
export function SuppliersPane() {
  const searchParams = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();
  const type = searchParams.get('type') ?? '';

  const { data, isLoading } = useQuery<{ items: SupplierStats[] }>({
    queryKey: qk.suppliers.list(`stats:${q}`, type || 'all'),
    queryFn: () => {
      const params = new URLSearchParams({ stats: '1' });
      if (q) params.set('q', q);
      if (type) params.set('type', type);
      return jsonFetch(`/api/suppliers?${params.toString()}`);
    },
  });

  // Editor door (admin dissolution): `?supplier=<id|new>` swaps the rollup for
  // the CRUD card in SourcingWorkspace. Keeps the facet params so Back returns
  // to the same filtered list.
  const supplierHref = (id: number | 'new') => {
    const params = new URLSearchParams({ mode: 'suppliers', supplier: String(id) });
    if (q) params.set('q', q);
    if (type) params.set('type', type);
    return `/sourcing?${params.toString()}`;
  };

  const rows = useMemo(() => data?.items ?? [], [data]);
  if (isLoading) return <Centered>Loading suppliers…</Centered>;
  if (rows.length === 0) {
    return (
      <Empty
        icon={<Link2 className="h-6 w-6" />}
        title="No suppliers yet"
        hint="eBay sellers are auto-created when you import a candidate. Add distributors and salvage sources here."
        action={
          <Link href={supplierHref('new')}>
            <Button type="button" size="sm">
              <Plus className="h-3.5 w-3.5" />
              Add supplier
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-default">Suppliers <span className="text-text-faint">({rows.length})</span></h1>
        <Link href={supplierHref('new')}>
          <Button type="button" size="sm">
            <Plus className="h-3.5 w-3.5" />
            Add supplier
          </Button>
        </Link>
      </div>
      <ul className="space-y-2">
        {rows.map((s) => (
          <li key={s.id}>
            <Link
              href={supplierHref(s.id)}
              className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface-card p-3 transition-colors hover:border-border-default hover:bg-surface-hover"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text-default">{s.name}</p>
                <p className="truncate text-role-caption text-text-soft">
                  {SUPPLIER_TYPE_LABEL[s.supplier_type] ?? s.supplier_type}
                  {s.lead_time_days != null ? ` · ${s.lead_time_days}d lead` : ''}
                  {s.rating != null ? ` · ${s.rating}★` : ''}
                  {s.last_ordered_at ? ` · last order ${new Date(s.last_ordered_at).toLocaleDateString()}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-right">
                <Stat label="watch" value={s.candidate_count} />
                <Stat label="acq" value={s.acquisition_count} />
                <div className="w-20">
                  <p className="text-sm font-semibold text-text-default">{formatCents(s.spend_cents)}</p>
                  <p className="text-role-micro font-semibold uppercase tracking-wide text-text-faint">spend</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="w-12">
      <p className="text-sm font-semibold text-text-default">{value}</p>
      <p className="text-role-micro font-semibold uppercase tracking-wide text-text-faint">{label}</p>
    </div>
  );
}
