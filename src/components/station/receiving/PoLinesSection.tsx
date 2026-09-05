'use client';

import { useState } from 'react';
import { Package } from '@/components/Icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatReturnSerialProductTitle } from '@/components/station/receiving-line-serials';
import { Button } from '@/design-system/primitives';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { ItemRecordRow, type ItemRecord } from '@/design-system/components/item-record';
import { receivingQty } from '@/lib/item-record/receiving-qty';
import { deriveReceiveState } from '@/lib/item-record/receive-state';

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
  exception_code?: string | null;
  serials?: Array<{ id?: number; serial_number: string }> | null;
}

interface PoLinesSectionProps {
  receivingId: string;
  trackingNumber?: string;
}

function matchLineToItemRecord(line: ReceivingLine): ItemRecord {
  const serials = Array.isArray(line.serials)
    ? line.serials.map((s) => (s.serial_number || '').trim()).filter(Boolean)
    : [];
  const primarySerial = serials.at(-1) ?? null;
  return {
    id: line.id,
    title: formatReturnSerialProductTitle(
      line.item_name || line.sku || `Line #${line.id}`,
      primarySerial,
    ),
    sku: (line.sku || '').trim() || null,
    quantity: receivingQty(line),
    receiveState: deriveReceiveState({
      counted: line.quantity_received,
      expected: line.quantity_expected,
      exceptionCode: line.exception_code,
    }),
    conditionGrade: String(line.condition_grade ?? '').trim() || null,
    serials,
  };
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
        <div className="space-y-2 py-4 text-center">
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
        <ul className="flex min-w-0 flex-col divide-y divide-border-hairline">
          {lines.map((line) => (
            <li key={line.id} className="min-w-0 py-1">
              <ItemRecordRow item={matchLineToItemRecord(line)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
