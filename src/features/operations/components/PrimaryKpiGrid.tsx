'use client';

import { KpiStrip } from '@/design-system/components/monitor';
import { PRIMARY_KPI_CARDS } from './operations-kpi-config';
import type { DashboardData } from '@/features/operations/types';
import type { KpiKind } from './KpiDetailsModal';

export interface PrimaryKpiGridProps {
  summary?: DashboardData['summary'];
  onOpen: (kind: KpiKind) => void;
  /** The kind whose details modal is open (lights the tile). */
  activeKind?: KpiKind | null;
}

/** The four primary KPI tiles, composed from the Monitor {@link KpiStrip} / `KpiTile` registry — eyebrow → hero number → the… */
export function PrimaryKpiGrid({ summary, onOpen, activeKind }: PrimaryKpiGridProps) {
  return (
    <KpiStrip
      items={PRIMARY_KPI_CARDS.map((card) => {
        const cell = summary?.[card.summaryKey];
        return {
          label: card.title,
          value: cell?.value ?? 0,
          meta: card.meta,
          onOpen: () => onOpen(card.kind),
          active: activeKind === card.kind,
        };
      })}
    />
  );
}
