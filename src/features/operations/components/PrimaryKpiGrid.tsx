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

/**
 * The four primary KPI tiles, composed from the Monitor {@link KpiStrip} /
 * `KpiTile` registry — eyebrow → hero number → the window-and-unit line.
 *
 * NO delta. The snapshot stopped carrying one on 2026-09-16 (see
 * `operations-kpi-config.ts`), and the type change is what enforces it: there
 * is no `cell.delta` to read. Clicking a tile opens {@link KpiDetailsModal},
 * which lists the rows behind the number — the drill path a scalar needs to be
 * checkable at all.
 */
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
