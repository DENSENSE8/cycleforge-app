'use client';

import { useState } from 'react';
import { Package } from '@/components/Icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatReturnSerialProductTitle } from '@/components/station/receiving-line-serials';
import {
  SkuScanRefChip,
  SerialChip,
  getLast8,
} from '@/components/ui/CopyChip';
import {
  conditionGradeTableLabel,
  workflowStatusTableLabel,
  WORKFLOW_BADGE,
} from '@/components/station/receiving-constants';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Panel, Button } from '@/design-system/primitives';
import { ItemRecordQtyBadge } from '@/design-system/components/item-record';
import { receivingQty } from '@/lib/item-record/receiving-qty';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';

interface ReceivingLine {
  id: number;
  item_name: string | null;
  sku: string | null;
  zoho_purchaseorder_id: string | null;
  quantity_expected: number | null;
  quantity_received: number;
  workflow_status: string;
  qa_status: string;
  condition_grade: string;
  needs_test: boolean;
  assigned_tech_name: string | null;
  notes: string | null;
  /** Optional serials when the /api/receiving/match payload includes them. */
  serials?: Array<{ id?: number; serial_number: string }> | null;
}

interface PoLinesSectionProps {
  receivingId: string;
  trackingNumber?: string;
}

/**
 * Per-line row in the PO LINES details card. Two-row stacked layout to fit
 * the narrow side panel:
 *   - Row 1: PO + tracking copy chips (left) and qty pill (right).
 *   - Row 2: full-width item title, then condition + workflow status badges.
 *
 * The shared `ReceivingLineOrderRow` is built for the wider main table and
 * its single-row chip grid truncates badly inside this card.
 */
function PoLineRow({ line }: { line: ReceivingLine }) {
  const badgeCls = WORKFLOW_BADGE[line.workflow_status] ?? 'bg-surface-sunken text-text-soft';
  const conditionLabel = conditionGradeTableLabel(line.condition_grade);
  const condGrade = (line.condition_grade || '').toUpperCase();
  const skuValue = (line.sku || '').trim();
  const serialsCsv = Array.isArray(line.serials)
    ? line.serials.map((s) => (s.serial_number || '').trim()).filter(Boolean).join(', ')
    : '';

  // Row 1 — full-width product title. No truncation; wraps as needed.
  // Return-serial titles paint last-8 from the live unit when present.
  const primarySerial = serialsCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .at(-1) ?? null;
  const displayTitle = formatReturnSerialProductTitle(
    line.item_name || line.sku || `Line #${line.id}`,
    primarySerial,
  );
  const titleNode = (
    <p className="text-role-caption font-semibold text-text-default leading-snug">
      {displayTitle}
    </p>
  );

  return (
    <div className="border-b border-border-hairline last:border-b-0 px-3 py-2.5">
      {line.item_name ? (
        <HoverTooltip label={line.item_name} asChild>
          {titleNode}
        </HoverTooltip>
      ) : (
        titleNode
      )}

      {/* Row 2 — bottom strip:
            LEFT  → qty + workflow / condition / needs-test badges
            RIGHT → SKU + serial copy chips */}
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <ItemRecordQtyBadge quantity={receivingQty(line)} />
          <span
            className={`rounded px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest ${badgeCls}`}
          >
            {workflowStatusTableLabel(line.workflow_status)}
          </span>
          {condGrade && condGrade !== 'PENDING' ? (
            <span
              className={`rounded px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest ring-1 ring-inset ring-border-soft ${conditionGradeTextClass(condGrade)}`}
            >
              {conditionLabel}
            </span>
          ) : null}
          {line.needs_test ? (
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest text-orange-700">
              Test
            </span>
          ) : null}
          {line.assigned_tech_name ? (
            <span className="truncate text-role-eyebrow text-text-faint">
              → {line.assigned_tech_name}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {skuValue ? (
            <SkuScanRefChip value={skuValue} display={getLast8(skuValue)} />
          ) : null}
          {serialsCsv ? (
            <SerialChip value={serialsCsv} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PoLinesSection({ receivingId, trackingNumber }: PoLinesSectionProps) {
  const [markingReceived, setMarkingReceived] = useState(false);
  const [markResult, setMarkResult] = useState<'idle' | 'ok' | 'err'>('idle');
  const queryClient = useQueryClient();

  const { data, isFetching, refetch } = useQuery<{ lines: ReceivingLine[]; matched: boolean }>({
    queryKey: ['receiving-match', receivingId],
    queryFn: async () => {
      const res = await fetch(`/api/receiving/match?receiving_id=${receivingId}`);
      if (!res.ok) return { lines: [], matched: false };
      const json = await res.json();
      const lines: ReceivingLine[] = Array.isArray(json?.matched_lines) ? json.matched_lines : [];
      return { lines, matched: lines.length > 0 };
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const lines = data?.lines ?? [];

  const handleSearchAndLink = async () => {
    if (!trackingNumber?.trim()) return;
    setMarkingReceived(true);
    setMarkResult('idle');
    try {
      const res = await fetch('/api/receiving/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiving_id: Number(receivingId) }),
      });
      if (!res.ok) throw new Error('Match failed');
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['receiving-pending-unboxing'] });
      setMarkResult('ok');
    } catch {
      setMarkResult('err');
    } finally {
      setMarkingReceived(false);
    }
  };

  return (
    <div className="space-y-2">
      {isFetching && lines.length === 0 ? (
        <UniversalLoader isLoading label="Loading PO lines" className="min-h-20" />
      ) : null}

      {lines.length === 0 ? (
        <div className="text-center py-4 space-y-2">
          <p className="text-role-micro text-text-faint">No items linked yet.</p>
          <Button
            variant="primary"
            size="sm"
            icon={<Package />}
            loading={markingReceived}
            onClick={handleSearchAndLink}
          >
            Search purchase order
          </Button>
          {markResult === 'err' && (
            <p className="text-role-eyebrow text-red-500">Search failed — try again</p>
          )}
        </div>
      ) : (
        <Panel radius="xl" padding="none" className="overflow-hidden">
          {lines.map((line) => (
            <PoLineRow key={line.id} line={line} />
          ))}
        </Panel>
      )}
    </div>
  );
}
