/**
 * One movable rack as the shared desk `RecordCard` reads it
 * (`LOCATIONS_RACKS_VIEW`): `Rack 12 · RK12` → where it stands (derived room)
 * · shelves · arrival shelves; top-right = when it last moved.
 */

import { Warehouse } from '@/components/Icons';
import type { ViewCardModel } from '@/design-system/components/triage-card-list/triage-view';
import type { RecordStateFace } from '@/design-system/tokens/record';
import { rackPlacementText, rackShelfCountText, rackTierSummaryText } from '@/lib/locations/rack-display';
import type { RackSummary } from '@/lib/locations/rack-types';
import { LOCATIONS_RACKS_VIEW } from '@/lib/triage/views/locations-racks';
import { formatDateTimePST, formatMonthDayTimePST } from '@/utils/date';

const RACK_STATE: RecordStateFace = { id: 'rack', code: 'RACK', label: 'Movable rack', tone: 'neutral', icon: 'warehouse' };
const ARRIVAL_RACK_STATE: RecordStateFace = {
  id: 'rack-arrival',
  code: 'ARR',
  label: 'Movable rack with arrival shelves',
  tone: 'info',
  icon: 'warehouse',
};

export type RackCardModel = { key: string; ids: readonly number[]; lead: RackSummary };

export function rackRecordCard(model: RackCardModel): ViewCardModel<typeof LOCATIONS_RACKS_VIEW> {
  const rack = model.lead;
  const placed = rackPlacementText(rack);
  const tiers = rackTierSummaryText(rack.tierCounts);
  const state = rack.tieredShelfCount > 0 ? ARRIVAL_RACK_STATE : RACK_STATE;
  return {
    key: model.key,
    leadId: rack.id,
    state,
    stateIcon: Warehouse,
    stateMeaning: state.label,
    alert: null,
    aria: {
      card: `${rack.name} ${rack.code}, at ${placed}, ${rackShelfCountText(rack.shelfCount)}`,
      open: `Open ${rack.name}`,
      check: `Select ${rack.name}`,
    },
    channel: null,
    person: null,
    chips: [],
    notes: { fixed: null, own: null },
    status: {
      kind: 'date',
      face: formatMonthDayTimePST(rack.lastMovedAt),
      tip: `Last moved ${formatDateTimePST(rack.lastMovedAt)} PT`,
      alert: false,
    },
    next: null,
    lines: [
      {
        id: rack.id,
        title: placed,
        photoUrl: null,
        facts: {
          shelves: { kind: 'text', text: rackShelfCountText(rack.shelfCount) },
          arrival: tiers ? { kind: 'text', text: `Arrival · ${tiers}` } : null,
        },
        alert: false,
        alertNote: null,
      },
    ],
    hiddenAlertLabel: () => '',
  };
}
