'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import { MONITOR_SECTION_CARD_CLASS } from '@/design-system/components/monitor';
import { cn } from '@/utils/_cn';

interface FbaStageCountsResponse {
  success?: boolean;
  counts?: {
    PLANNED?: number;
    TESTED?: number;
    PACKED?: number;
    OUT_OF_STOCK?: number;
    LABEL_ASSIGNED?: number;
  };
}

interface RmaListResponse {
  ok?: boolean;
  authorizations?: { status: string }[];
}

async function safeJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface StageBarProps {
  title: string;
  href: string;
  stages: { label: string; count: number; color: string }[];
  isLoading?: boolean;
  empty?: boolean;
}

function StageBar({ title, href, stages, isLoading, empty }: StageBarProps) {
  const total = stages.reduce((s, x) => s + x.count, 0);

  return (
    <motion.a
      href={href}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className={cn('block', MONITOR_SECTION_CARD_CLASS, 'p-5 transition-shadow hover:shadow-md')}
    >
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-role-data font-semibold text-text-default tracking-tight">{title}</p>
        <div className="text-2xl font-semibold text-text-default tabular-nums leading-none">
          {isLoading ? '–' : total}
        </div>
      </div>

      {empty ? (
        <div className="text-role-caption text-text-muted py-3">
          Source unavailable — check feature flag / permissions.
        </div>
      ) : (
        <>
          {/* Stacked bar */}
          <div className="h-3 w-full rounded-full bg-surface-canvas overflow-hidden flex">
            {stages.map((s) => (
              <motion.div
                key={s.label}
                initial={{ width: 0 }}
                animate={{ width: total > 0 ? `${(s.count / total) * 100}%` : '0%' }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                className={`h-full ${s.color}`}
                title={`${s.label}: ${s.count}`}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            {stages.map((s) => (
              <div key={s.label} className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.color}`} />
                <span className="text-role-micro uppercase tracking-[0.12em] text-text-muted truncate">
                  {s.label}
                </span>
                <span className="ml-auto text-role-caption font-semibold text-text-default tabular-nums">
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.a>
  );
}

export function PipelineRow() {
  const fba = useQuery({
    queryKey: ['ops-fba-stages'],
    queryFn: () => safeJson<FbaStageCountsResponse>('/api/fba/stage-counts'),
    refetchInterval: 120000,
    retry: false,
  });

  const rma = useQuery({
    queryKey: ['ops-rma-list'],
    queryFn: () => safeJson<RmaListResponse>('/api/rma'),
    refetchInterval: 120000,
    retry: false,
  });

  const fbaCounts = fba.data?.counts ?? {};
  const fbaStages = [
    { label: 'Planned',      count: fbaCounts.PLANNED       ?? 0, color: 'bg-surface-strong' },
    { label: 'Tested',       count: fbaCounts.TESTED        ?? 0, color: 'bg-fill-success' },
    { label: 'Packed',       count: fbaCounts.PACKED        ?? 0, color: 'bg-fill-warning' },
    { label: 'Out of stock', count: fbaCounts.OUT_OF_STOCK  ?? 0, color: 'bg-fill-danger' },
  ];

  const rmaList = rma.data?.authorizations ?? [];
  const rmaByStatus = rmaList.reduce<Record<string, number>>((acc, r) => {
    const key = (r?.status ?? 'OTHER').toUpperCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const rmaStages = [
    { label: 'Authorized',    count: rmaByStatus['AUTHORIZED']    ?? 0, color: 'bg-fill-info' },
    { label: 'Received',      count: rmaByStatus['RECEIVED']      ?? 0, color: 'bg-fill-warning' },
    { label: 'Dispositioned', count: rmaByStatus['DISPOSITIONED'] ?? 0, color: 'bg-fill-success' },
  ];

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <span className={`${sectionLabel} !text-text-muted`}>Pipelines</span>
          <h2 className="text-role-title sm:text-xl tracking-tight text-text-default mt-0.5">
            FBA + RMA at a glance
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StageBar
          title="FBA pipeline"
          href="/fba"
          stages={fbaStages}
          isLoading={fba.isLoading}
          empty={fba.data === null}
        />
        <StageBar
          title="RMA pipeline"
          href="/support"
          stages={rmaStages}
          isLoading={rma.isLoading}
          empty={rma.data === null}
        />
      </div>
    </section>
  );
}
