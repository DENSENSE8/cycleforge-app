'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { DetailAck, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import {
  RepairDocumentRow,
  RepairPrintLogList,
  RepairStationCard,
} from '@/components/mobile/repair/RepairPaperworkParts';
import { useRepairPaperwork, type RepairPaperDoc } from '@/components/mobile/repair/useRepairPaperwork';
import { useStaffPrintBridgeClient } from '@/hooks/useStaffPrintBridgeClient';
import { repairDocumentRole, staffPrintBlockedReason } from '@/lib/print/staff-print-bridge';
import { Panel } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/** How long after an ack the station's own print-log write is expected to land. */
const LOG_SETTLE_MS = 4_000;

type SendResult = { doc: RepairPaperDoc; stationName: string; acked: boolean };

/**
 * `/m/rs/[id]/paperwork` — every printable document for the repair (repair
 * receipt, 2×1 label, the SKU's manuals). Open views it here; Print to station
 * sends it over the staff print bridge to the ONE picked print station (a named
 * computer signed in as this staffer), which prints and records it
 * (`POST /print-log`). The log below is the server's.
 */
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
    const stationName = bridge.target?.status.stationName ?? 'The print station';
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
    <ModeRegion mode="triage" className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar
        backHref={`/m/rs/${repairId}`}
        subtitle="Paperwork"
        title={rsCode}
        mono
        meta={repair?.product_title || undefined}
      />

      <div className="flex-1 space-y-5 px-mode-page py-mode-page">
        {loading && <p className="py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>}
        {error && (
          <div className="rounded-mode border border-rose-200 bg-rose-50 p-mode-page text-mode-body font-semibold text-rose-700">
            {error}
          </div>
        )}

        {result ? (
          result.acked ? (
            <DetailAck onDismiss={() => setResult(null)}>
              <span>
                {result.doc.title} sent to {result.stationName} — it prints and logs it.
              </span>
            </DetailAck>
          ) : (
            <div
              role="alert"
              className="rounded-mode border border-rose-200 bg-rose-50 px-mode-page py-2.5 text-role-caption font-semibold text-rose-700"
            >
              {result.stationName} did not answer. Keep the desk app open on it, signed in as {bridge.staffName} with
              a printer paired, then Print again.
            </div>
          )
        ) : null}

        {repair ? (
          <>
            <section className="space-y-2">
              <DetailSectionHeading>Print station</DetailSectionHeading>
              <RepairStationCard
                staffName={bridge.staffName}
                stations={bridge.stations}
                target={bridge.target}
                now={bridge.now}
                onPick={bridge.pickStation}
                onPatch={(patch) => void bridge.patchStation(patch)}
                onRefresh={() => void bridge.requestStatus()}
              />
            </section>

            <section className="space-y-2">
              <DetailSectionHeading>Documents</DetailSectionHeading>
              <Panel radius="none" padding="none" elevation="none" className="rounded-mode">
                <ul>
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
              </Panel>
              <p className="text-role-caption text-mode-muted">
                {manualsLoading
                  ? 'Looking up manuals…'
                  : documents.some((d) => d.job.document === 'manual')
                    ? null
                    : repair.source_sku
                      ? `No manual on file for ${repair.source_sku}.`
                      : 'No SKU on this repair, so no manual.'}
              </p>
            </section>

            <section className="space-y-2">
              <DetailSectionHeading>Print log</DetailSectionHeading>
              <div className="rounded-mode border border-mode-edge bg-mode-panel p-mode-page">
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
    </ModeRegion>
  );
}

export default function RepairPaperworkPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <RepairPaperworkInner />
    </Suspense>
  );
}
