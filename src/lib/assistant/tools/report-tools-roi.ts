/**
 * ROI report tools — the two owner questions about where the money is stuck and
 * who can go get it.
 *
 * Both return a `ToolArtifactEnvelope`: the validated report goes to the panel,
 * the one-sentence summary goes to the model (see `tool-artifact.ts`). The model
 * never retypes a KPI, so the panel always shows the exact numbers the SQL
 * produced.
 *
 * The builders live in `src/lib/reports/` and are pure apart from the injected
 * `deps.query` seam, so their arithmetic is unit-tested without a database.
 */

import { buildRoiRankReport, roiRankInput } from '@/lib/reports/roi-rank';
import { buildDelegationPlanReport, delegationPlanInput } from '@/lib/reports/delegation-plan';
import type { AssistantToolDef } from './types';
import type { ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';

export const getRoiRankTool: AssistantToolDef<typeof roiRankInput, ToolArtifactEnvelope> = {
  name: 'get_roi_rank',
  description:
    'Renders the ROI report: "what are the highest ROIs right now", "where are we leaking", "what should we fix first", "what are our biggest gaps", "how long to clear the backlog". Ranks the six operating gaps (received-but-unlisted units, dead stock, open order exceptions, open receiving exceptions, units on hold, unfinished repairs) by a printed formula — priority = units × ageWeight, ageWeight = 1 + min(oldestDays, 60) / 30 — and shows effort to clear from declared minutes-per-unit standards, in minutes and person-days. It attaches NO dollar value to any gap, because this schema holds no reliable per-unit price: never state or imply a revenue figure from this report. The report is already on screen; answer with the top gap, its size, its age and the effort to clear it.',
  permission: 'operations.view',
  inputSchema: roiRankInput,
  run: (input, ctx, deps) => buildRoiRankReport(input, ctx, deps),
};

export const getDelegationPlanTool: AssistantToolDef<typeof delegationPlanInput, ToolArtifactEnvelope> = {
  name: 'get_delegation_plan',
  description:
    'Renders the delegation report: "which staff can I delegate to attack the highest ROIs", "who should attack the highest ROIs", "who is free", "who has the most pending tasks", "roster load". Takes the top ROI gaps, maps each to the station that clears it, and names the eligible staff least-loaded first, with free capacity, pending floor and desk task counts, urgent and overdue counts, today\'s scans, and every pending item that has no owner at all. Optional `gapId` or `station` narrows it to one gap or one station. Free capacity assumes 20 minutes per pending task — an assumption printed on the report, not a measurement. This report only NAMES who; making the assignment is a separate action the operator takes.',
  permission: 'work_orders.view',
  inputSchema: delegationPlanInput,
  run: (input, ctx, deps) => buildDelegationPlanReport(input, ctx, deps),
};
