'use client';

/**
 * Triage health strip in the right-pane workbench body (Monitor eyebrow).
 * Formerly lived in the Arrival sidebar; content chrome owns it now.
 */

import { useQuery } from '@tanstack/react-query';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

interface TriageMetrics {
  save_without_pair_rate: number | null;
}

function formatRate(r: number | null): string {
  if (r == null) return '—';
  return `${Math.round(r * 100)}%`;
}

export function TriageKpiStrip() {
  const { data } = useQuery<TriageMetrics>({
    queryKey: ['receiving', 'triage', 'metrics'] as const,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch('/api/receiving/triage/metrics', { cache: 'no-store' });
      if (!res.ok) return { save_without_pair_rate: null };
      return (await res.json()) as TriageMetrics;
    },
  });

  if (!data || data.save_without_pair_rate == null) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <HoverTooltip label="Share of cartons saved for unbox while still unpaired (B5)">
        <span className="inline-flex items-center gap-1 rounded bg-surface-sunken inset-chip text-role-eyebrow uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft">
          Saved unpaired {formatRate(data.save_without_pair_rate)}
        </span>
      </HoverTooltip>
    </div>
  );
}
