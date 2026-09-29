/**
 * Local Pickup (`/pickup`) facet counts. The workbench fetches the LCPU lines
 * once (`listLocalPickupLines`, same bounds as `usePickupLines`) and narrows by
 * status in memory with `pickupLineMatchesStatus`; the facet does exactly that
 * — the same read and the same predicate — so its counts are the grid's.
 */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { computeFacets, type FacetCombo } from '@/lib/nav/facets/compute';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import type { LocalPickupLineRow, LocalPickupLinesQuery } from '@/lib/local-pickup/pickup-lines-query';
import {
  parsePickupStatusTab,
  pickupLineMatchesStatus,
  type PickupLineStatusFacts,
} from '@/lib/local-pickup/order-status';
import { parsePickupStageFilters, pickupSeller } from '@/lib/local-pickup/stage-filters';
import { summarizeReceivingUnitStages } from '@/lib/receiving/receiving-unit-stage-summary';
import type { OrgId } from '@/lib/tenancy/constants';

/** The workbench's page when it is not searching (`usePickupLines`). */
const PICKUP_PAGE_LINES = 500;

const STATUS_OPTIONS = [
  { value: 'process', label: 'Need to process' },
  { value: 'draft', label: 'Draft' },
  { value: 'done', label: 'Done' },
] as const;

interface PickupOrderCombo extends FacetCombo {
  status: PickupLineStatusFacts;
  qc: 'failed' | 'pending' | 'retest' | 'passed';
  triage: 'pending' | 'triaged';
  label: 'missing' | 'printed';
  ticket: 'linked' | 'none';
  vendor: string;
  pickupDate: string;
}

export async function pickupFacets(
  orgId: OrgId,
  params: Pick<URLSearchParams, 'get'>,
  listLines: (orgId: OrgId, query: LocalPickupLinesQuery) => Promise<LocalPickupLineRow[]>,
): Promise<NavFacetsResponse> {
  const q = String(params.get('q') ?? '').trim();
  const lines = await listLines(orgId, { status: '', q, limit: PICKUP_PAGE_LINES });
  const byOrder = new Map<number, LocalPickupLineRow[]>();
  for (const line of lines) {
    const bucket = byOrder.get(line.order_id);
    if (bucket) bucket.push(line);
    else byOrder.set(line.order_id, [line]);
  }
  const parsed = parsePickupStageFilters(params);
  const rows: PickupOrderCombo[] = [...byOrder.values()].flatMap((orderLines) => {
    const first = orderLines[0];
    if (!first) return [];
    const pickupDate = String(first.pickup_date || '').slice(0, 10);
    if (parsed.from && (!pickupDate || pickupDate < parsed.from)) return [];
    if (parsed.to && (!pickupDate || pickupDate > parsed.to)) return [];
    const summary = summarizeReceivingUnitStages(orderLines.map((line) => ({
      quantity: line.quantity,
      unitStageFacts: line.unit_stage_facts,
    })));
    return [{
      n: 1,
      status: first,
      qc: summary.strongestQc.toLowerCase().replace('test_again', 'retest') as PickupOrderCombo['qc'],
      triage: summary.units > 0 && summary.triaged === summary.units ? 'triaged' : 'pending',
      label: summary.units > 0 && summary.labelsPrinted === summary.units ? 'printed' : 'missing',
      ticket: summary.tickets > 0 ? 'linked' : 'none',
      vendor: pickupSeller(orderLines) || '',
      pickupDate,
    }];
  });
  const decls = new Map(NAV_FACET_GROUPS.pickup.map((decl) => [decl.id, decl]));
  const statusDecl = decls.get('status')!;
  const qcDecl = decls.get('qc')!;
  const triageDecl = decls.get('triage')!;
  const labelDecl = decls.get('label')!;
  const ticketDecl = decls.get('ticket')!;
  const vendorDecl = decls.get('vendor')!;
  const vendorOptions = [...new Set(rows.map((row) => row.vendor).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
  const { total, groups } = computeFacets(
    rows,
    [
      {
        groupId: statusDecl.id,
        label: statusDecl.label,
        param: statusDecl.param,
        options: STATUS_OPTIONS,
        matches: (row, value) => pickupLineMatchesStatus(row.status, parsePickupStatusTab(value)),
      },
      { groupId: qcDecl.id, label: qcDecl.label, param: qcDecl.param, options: [
        { value: 'failed', label: 'Failed' }, { value: 'pending', label: 'Pending' },
        { value: 'retest', label: 'Retest' }, { value: 'passed', label: 'Passed' },
      ], matches: (row, value) => row.qc === value },
      { groupId: triageDecl.id, label: triageDecl.label, param: triageDecl.param, options: [
        { value: 'pending', label: 'Not triaged' }, { value: 'triaged', label: 'Triaged' },
      ], matches: (row, value) => row.triage === value },
      { groupId: labelDecl.id, label: labelDecl.label, param: labelDecl.param, options: [
        { value: 'missing', label: 'Missing' }, { value: 'printed', label: 'Printed' },
      ], matches: (row, value) => row.label === value },
      { groupId: ticketDecl.id, label: ticketDecl.label, param: ticketDecl.param, options: [
        { value: 'linked', label: 'Linked' }, { value: 'none', label: 'No ticket' },
      ], matches: (row, value) => row.ticket === value },
      { groupId: vendorDecl.id, label: vendorDecl.label, param: vendorDecl.param, options: vendorOptions, matches: (row, value) => row.vendor === value },
    ],
    {
      status: parsed.status === 'all' ? null : parsed.status,
      qc: parsed.qc,
      triage: parsed.triage,
      label: parsed.label,
      ticket: parsed.ticket,
      vendor: parsed.vendor,
    },
  );
  return { context: 'pickup', total, groups };
}
