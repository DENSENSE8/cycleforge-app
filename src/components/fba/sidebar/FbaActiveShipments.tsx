'use client';

/**
 * FBA active-shipments rail — thin composition shell. The fetch + bundle
 * transform, editor-mode event wiring, and refresh subscription live in
 * {@link useFbaActiveShipments}; the shipment card + tracking group are
 * presentational components under `./active-shipments/`.
 */

import { LayoutGroup } from '@/design-system/motion';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { FbaShipmentEditorForm } from '@/components/fba/sidebar/FbaShipmentEditorForm';
import { sectionLabel, SkeletonList } from '@/design-system';
import { EmptyState } from '@/design-system/primitives';
import type { StationTheme } from '@/utils/staff-colors';
import { useFbaActiveShipments } from './active-shipments/useFbaActiveShipments';
import { ActiveShipmentCard } from './active-shipments/ActiveShipmentCard';

export type FbaShipmentRailScope = 'all' | 'active' | 'shipped';

export function FbaActiveShipments({
  stationTheme = 'green',
  scope = 'all',
}: {
  stationTheme?: StationTheme;
  /** `shipped` is the desktop History projection; it shares this controller and card face. */
  scope?: FbaShipmentRailScope;
}) {
  const {
    shipments, recentShipped, loading,
    expandedIds, toggleExpand,
    editingShipment, setEditingShipment,
    emitChanged,
  } = useFbaActiveShipments();

  if (loading) {
    return (
      <div className={`space-y-3 ${SIDEBAR_GUTTER} py-4`}>
        <div className="h-4 w-32 bg-surface-sunken rounded animate-pulse mb-3" />
        <SkeletonList count={3} type="card" />
      </div>
    );
  }

  const visibleActive = scope === 'shipped' ? [] : shipments;
  const visibleShipped = scope === 'active' ? [] : recentShipped;

  if (visibleActive.length === 0 && visibleShipped.length === 0 && !editingShipment) {
    return (
      <EmptyState
        title={scope === 'shipped' ? 'No shipped FBA plans' : 'No active FBA plans'}
        description={scope === 'shipped'
          ? 'Completed plans with carrier tracking will appear here.'
          : 'Plans with tracking will appear here as work advances.'}
      />
    );
  }

  // ── Editor form (replaces the card list while active) ──
  if (editingShipment) {
    return (
      <FbaShipmentEditorForm
        shipment={editingShipment}
        stationTheme={stationTheme}
        onClose={() => setEditingShipment(null)}
        onChanged={() => {
          setEditingShipment(null);
          emitChanged();
        }}
      />
    );
  }

  return (
    <div className="pb-4">
      <LayoutGroup id="fba-active-shipments">
        {visibleActive.map((shipment) => (
          <ActiveShipmentCard
            key={shipment.id}
            shipment={shipment}
            stationTheme={stationTheme}
            editable
            isExpanded={expandedIds.has(shipment.id)}
            onToggleExpand={() => toggleExpand(shipment.id)}
            onChanged={emitChanged}
          />
        ))}

        {visibleShipped.length > 0 && (
          <div className="mt-6">
            <p className={`mb-3 px-4 ${sectionLabel} text-text-soft`}>
              {scope === 'shipped' ? 'Shipped FBA plans' : 'Recent shipments'}
            </p>
            {visibleShipped.map((shipment) => (
              <ActiveShipmentCard
                key={shipment.id}
                shipment={shipment}
                stationTheme={stationTheme}
                editable={false}
                isExpanded={expandedIds.has(shipment.id)}
                onToggleExpand={() => toggleExpand(shipment.id)}
                onChanged={emitChanged}
              />
            ))}
          </div>
        )}
      </LayoutGroup>
    </div>
  );
}
