'use client';

/**
 * The package record's JOURNEY RAIL (operator 2026-10-05) — where did it go
 * wrong, and by how much: Handed off · Carrier scan · Delivered · Check-in
 * sent · Customer replied · Outcome on the shared `StepRail`, each reached
 * node with its PT instant and the gap from the node before. The gap that
 * broke its threshold paints in the danger tone; the live node is ringed and
 * its gap runs to now. Nodes and thresholds: `shipmentJourneyNodes`.
 */

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Package, PackageCheck, Reply, ScanBarcode, Send, ThumbsUp } from '@/components/Icons';
import { LatestEdgeScroller } from '@/design-system/components/record-ledger/LatestEdgeScroller';
import { StepRail, type RailStep } from '@/design-system/components/record-ledger/StepRail';
import { STATE_TONE_CLASSES, type StateName } from '@/design-system/tokens/lifecycle';
import { shipmentJourneyNodes, type JourneyNode, type JourneyNodeKey, type JourneyOutcome } from '@/lib/shipments/shipment-journey';
import type { ShipmentRecordJourney } from '@/lib/shipments/shipment-record-types';
import { formatDateKeyShort, formatMonthDayTimePST, toPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';

const NODE_ICON: Readonly<Record<JourneyNodeKey, ReactNode>> = {
  handed_off: <Package />,
  carrier_scan: <ScanBarcode />,
  delivered: <PackageCheck />,
  check_in_sent: <Send />,
  customer_replied: <Reply />,
  outcome: <CheckCircle />,
};

/** How a closed check-in reads: its glyph and, where it says something, its tone. */
const OUTCOME_FACE: Readonly<Record<JourneyOutcome, { icon: ReactNode; tone?: StateName }>> = {
  happy: { icon: <ThumbsUp />, tone: 'success' },
  issue: { icon: <AlertTriangle />, tone: 'danger' },
  closed: { icon: <CheckCircle /> },
  no_reply: { icon: <CheckCircle /> },
};

const OVER_CLASS = STATE_TONE_CLASSES.danger.text;

/** Line 3 — the gap from the node before (over-tone when it broke its threshold), then Delivered's promise; null when there is none. */
function nodeDetail(node: JourneyNode): ReactNode {
  const lines: ReactNode[] = [];
  if (node.gap) {
    lines.push(
      <span
        key="gap"
        className={cn('tabular-nums', node.gap.over ? cn('font-semibold', OVER_CLASS) : 'text-mode-muted')}
        title={node.gap.limit ? `Threshold: ${node.gap.limit}` : undefined}
        data-journey-gap={node.gap.over ? 'over' : 'within'}
      >
        {node.gap.span}
        {node.gap.running ? ' so far' : ''}
      </span>,
    );
  }
  if (node.silence) {
    lines.push(
      <span key="silence" className={cn('font-semibold', OVER_CLASS)}>
        carrier silent {node.silence}
      </span>,
    );
  }
  if (node.promisedAt) {
    lines.push(
      <span key="promise" className="text-mode-muted">
        promised {formatDateKeyShort(toPSTDateKey(node.promisedAt))}
      </span>,
    );
  }
  if (node.late) {
    lines.push(
      <span key="late" className={cn('font-semibold', OVER_CLASS)}>
        {node.late}
      </span>,
    );
  }
  if (lines.length === 0) return null;
  return <span className="flex flex-col">{lines}</span>;
}

function nodeMeta(node: JourneyNode): string {
  if (node.at) return formatMonthDayTimePST(node.at);
  if (node.noCheckIn) return 'No check-in';
  return node.state === 'current' ? 'Waiting' : 'Not yet';
}

export function ShipmentJourneyRail({
  journey,
  carrierEventAts,
  nowMs,
  testId = 'record-journey',
}: {
  journey: ShipmentRecordJourney;
  /** The package's carrier event instants (any order). */
  carrierEventAts: readonly string[];
  /** The instant the live node's gap runs to. */
  nowMs: number;
  testId?: string;
}) {
  const nodes = shipmentJourneyNodes(journey, carrierEventAts, nowMs);
  const steps = nodes.map((node): RailStep => {
    const outcome = node.outcome ? OUTCOME_FACE[node.outcome] : null;
    return {
      id: `journey:${node.key}`,
      icon: outcome?.icon ?? NODE_ICON[node.key],
      state: node.state,
      // The gap that broke its threshold names where it went wrong; a closed check-in says how it ended.
      tone: node.gap?.over ? 'danger' : outcome?.tone,
      title: node.label,
      meta: nodeMeta(node),
      detail: nodeDetail(node),
      testId: `${testId}-${node.key}`,
    };
  });
  const latest = steps.findLast((step) => step.state !== 'pending') ?? steps[0];

  return (
    <div className="min-w-0 px-4 py-3" data-testid={testId}>
      <LatestEdgeScroller latestKey={latest?.id ?? null} testId={`${testId}-scroll`}>
        <StepRail steps={steps} size="lg" label="Package journey" orientation="horizontal" horizontalScroll />
      </LatestEdgeScroller>
    </div>
  );
}
