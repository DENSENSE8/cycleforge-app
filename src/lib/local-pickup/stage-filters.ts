import {
  parsePickupStatusTab,
  pickupLineMatchesStatus,
  type PickupLineStatusFacts,
  type PickupStatusTab,
} from './order-status';
import type { ReceivingUnitStageFactView } from '@/lib/receiving/receiving-line-row';
import { summarizeReceivingUnitStages } from '@/lib/receiving/receiving-unit-stage-summary';

export type PickupQcFilter = 'failed' | 'pending' | 'retest' | 'passed';
export type PickupTriageFilter = 'pending' | 'triaged';
export type PickupLabelFilter = 'missing' | 'printed';
export type PickupTicketFilter = 'linked' | 'none';

export interface PickupStageFilterLine extends PickupLineStatusFacts {
  quantity: number | null | undefined;
  pickup_date: string | null;
  customer_name: string | null;
  zoho_vendor_name: string | null;
  unit_stage_facts?: readonly ReceivingUnitStageFactView[] | null;
}

export interface PickupStageFilters {
  status: PickupStatusTab;
  qc: PickupQcFilter | null;
  triage: PickupTriageFilter | null;
  label: PickupLabelFilter | null;
  ticket: PickupTicketFilter | null;
  vendor: string | null;
  from: string | null;
  to: string | null;
}

const oneOf = <T extends string>(raw: string | null | undefined, values: readonly T[]): T | null => {
  const value = String(raw ?? '').trim().toLowerCase();
  return values.includes(value as T) ? value as T : null;
};

const civilDate = (raw: string | null | undefined): string | null => {
  const value = String(raw ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
};

export function parsePickupStageFilters(params: Pick<URLSearchParams, 'get'>): PickupStageFilters {
  return {
    status: parsePickupStatusTab(params.get('status')),
    qc: oneOf(params.get('qc'), ['failed', 'pending', 'retest', 'passed'] as const),
    triage: oneOf(params.get('triage'), ['pending', 'triaged'] as const),
    label: oneOf(params.get('label'), ['missing', 'printed'] as const),
    ticket: oneOf(params.get('ticket'), ['linked', 'none'] as const),
    vendor: String(params.get('vendor') ?? '').trim() || null,
    from: civilDate(params.get('pickupFrom')),
    to: civilDate(params.get('pickupTo')),
  };
}

export function pickupSeller(lines: readonly PickupStageFilterLine[]): string | null {
  for (const line of lines) {
    const seller = (line.customer_name || line.zoho_vendor_name || '').trim();
    if (seller) return seller;
  }
  return null;
}

/** One shared order-level predicate for the card feed and contextual facets. */
export function pickupOrderMatchesStageFilters(
  lines: readonly PickupStageFilterLine[],
  filters: PickupStageFilters,
  skip: keyof PickupStageFilters | null = null,
): boolean {
  if (lines.length === 0) return false;
  const first = lines[0];
  const summary = summarizeReceivingUnitStages(lines.map((line) => ({
    quantity: line.quantity,
    unitStageFacts: line.unit_stage_facts,
  })));
  if (skip !== 'status' && filters.status !== 'all' && !pickupLineMatchesStatus(first, filters.status)) return false;
  if (skip !== 'qc' && filters.qc && summary.strongestQc.toLowerCase().replace('test_again', 'retest') !== filters.qc) return false;
  if (skip !== 'triage' && filters.triage) {
    const triaged = summary.units > 0 && summary.triaged === summary.units;
    if ((filters.triage === 'triaged') !== triaged) return false;
  }
  if (skip !== 'label' && filters.label) {
    const printed = summary.units > 0 && summary.labelsPrinted === summary.units;
    if ((filters.label === 'printed') !== printed) return false;
  }
  if (skip !== 'ticket' && filters.ticket) {
    if ((filters.ticket === 'linked') !== (summary.tickets > 0)) return false;
  }
  if (skip !== 'vendor' && filters.vendor) {
    if ((pickupSeller(lines) || '').toLocaleLowerCase() !== filters.vendor.toLocaleLowerCase()) return false;
  }
  const date = String(first.pickup_date || '').slice(0, 10);
  if (skip !== 'from' && filters.from && (!date || date < filters.from)) return false;
  if (skip !== 'to' && filters.to && (!date || date > filters.to)) return false;
  return true;
}
