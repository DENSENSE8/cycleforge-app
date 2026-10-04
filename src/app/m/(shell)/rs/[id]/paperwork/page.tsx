'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { DetailAck, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { RepairDocumentRow, RepairPrintLogList } from '@/components/mobile/repair/RepairPaperworkParts';
import { StaffPrintStationPicker } from '@/components/ui/StaffPrintStationPicker';
import { useRepairPaperwork, type RepairPaperDoc } from '@/components/mobile/repair/useRepairPaperwork';
import { useStaffPrintBridgeClient } from '@/hooks/useStaffPrintBridgeClient';
import { repairDocumentRole, staffPrintBlockedReason } from '@/lib/print/staff-print-bridge';

/** How long after an ack the station's own print-log write is expected to land. */
const LOG_SETTLE_MS = 4_000;

type SendResult = { doc: RepairPaperDoc; stationName: string; acked: boolean };

/** `/m/rs/[id]/paperwork` — every printable document for the repair (repair receipt, 2×1 label, the SKU's manuals). */
function RepairPaperworkInner() {
  const params = useParams<{ id: string }>();
  const repairId = Number(params?.id);
  const rsCode = `RS-${repairId}`;
  const { repair, documents, log, manualsLoading, loading, error, logError, reloadLog } =
    useRepairPaperwork(repairId);
  const bridge = useStaffPrintBridgeClient();
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  useEffect(() => {
    if (!result?.acked) return;
    const timer = window.setTimeout(() => void reloadLog(), LOG_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [result, reloadLog]);

  const print = async (doc: RepairPaperDoc) => {
    const stationName = bridge.target?.status.stationName ?? 'The printer';
    setSendingKey(doc.key);
    setResult(null);
    const acked = await bridge.sendJob({
      grain: 'repair',
      role: repairDocumentRole(doc.job.document),
      repair: doc.job,
    });
    setSendingKey(null);
    setResult({ doc, stationName, acked });
  };

  return (
    <div className="flex min-h-screen flex-col bg-mode-panel">
      <MobileV2DetailTopBar
        backHref={`/m/rs/${repairId}`}
        subtitle="Paperwork"
        title={rsCode}
        mono
        meta={repair?.product_title || undefined}
      />

      <div className="flex-1 divide-y divide-mode-rule">
        {loading && <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>}
        {error && <div className="bg-rose-50 px-mode-page py-3 text-mode-body font-semibold text-rose-700">{error}</div>}

        {result ? (
          result.acked ? (
            <DetailAck onDismiss={() => setResult(null)}>
              <span>
                {result.doc.title} sent to {result.stationName}.
              </span>
            </DetailAck>
          ) : (
            <div role="alert" className="bg-rose-50 px-mode-page py-3 text-role-caption font-semibold text-rose-700">
              {result.stationName} didn&apos;t respond. Try again.
            </div>
          )
        ) : null}

        {repair ? (
          <>
            <section className="divide-y divide-mode-rule">
              <DetailSectionHeading>Printer</DetailSectionHeading>
              <StaffPrintStationPicker
                stations={bridge.stations}
                target={bridge.target}
                now={bridge.now}
                onPick={bridge.pickStation}
              />
            </section>

            <section className="divide-y divide-mode-rule">
              <DetailSectionHeading>Documents</DetailSectionHeading>
              <ul className="bg-mode-panel">
                {documents.map((doc) => (
                  <RepairDocumentRow
                    key={doc.key}
                    doc={doc}
                    printBlockedReason={staffPrintBlockedReason(
                      bridge.target,
                      repairDocumentRole(doc.job.document),
                      bridge.now,
                    )}
                    printing={sendingKey === doc.key}
                    onPrint={() => void print(doc)}
                  />
                ))}
              </ul>
              {manualsLoading || !documents.some((d) => d.job.document === 'manual') ? (
                <p className="bg-mode-panel px-mode-page py-3 text-role-caption text-mode-muted">
                  {manualsLoading
                    ? 'Looking up manuals…'
                    : repair.source_sku
                      ? `No manual on file for ${repair.source_sku}.`
                      : 'No SKU on this repair, so no manual.'}
                </p>
              ) : null}
            </section>

            <section className="divide-y divide-mode-rule">
              <DetailSectionHeading>Print log</DetailSectionHeading>
              <div className="bg-mode-panel px-mode-page py-3">
                {logError ? (
                  <p className="text-role-caption text-rose-700">{logError}</p>
                ) : log ? (
                  <RepairPrintLogList entries={log.entries} documents={documents} />
                ) : (
                  <p className="text-role-caption text-mode-muted">Loading…</p>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function RepairPaperworkPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <RepairPaperworkInner />
    </Suspense>
  );
}
