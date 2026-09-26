'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, ScanBarcode } from '@/components/Icons';
import { printStationState } from '@/components/mobile/print/StaffPrintStationPicker';
import { FnskuStationSheet } from '@/components/mobile/fnsku/FnskuStationSheet';
import { FnskuSummaryCard } from '@/components/mobile/fnsku/FnskuSummaryCard';
import { FnskuCopiesStepper } from '@/components/mobile/fnsku/FnskuCopiesStepper';
import { useFnskuRecord } from '@/components/mobile/fnsku/useFnskuRecord';
import type { FnskuRecord } from '@/components/mobile/fnsku/useFnskuRecord';
import { DetailDock } from '@/design-system/components/DetailDock';
import { DetailHubScreen } from '@/design-system/components/DetailHubScreen';
import { useStaffPrintBridgeClient } from '@/hooks/useStaffPrintBridgeClient';
import { toast } from '@/lib/toast';

type FnskuVerb = 'reprint' | 'scan';

/**
 * `/m/fnsku/[fnsku]` — a scanned Amazon FBA unit label (FNSKU `X00…`) as a
 * full-screen record on {@link DetailHubScreen}. The packer scans the unit
 * from the top-right Scan; `/m/scan` lands the FNSKU here with an X back to
 * the scan loop.
 *
 * The card is the org's FBA catalog row (title, ASIN · SKU, condition) and
 * opens `/info`. Under it, how many labels (1–99). The one door picks the
 * printer (the staff print bridge). The dock's Reprint sends the label and
 * the count there; that computer prints that many Code 128 FNSKU stickers
 * and ledgers them (`printFnskuStationJob`). With no printer able to take
 * it, Reprint opens the picker instead.
 */
function FnskuHubInner() {
  const router = useRouter();
  const rec = useFnskuRecord();
  const bridge = useStaffPrintBridgeClient();
  const [stationOpen, setStationOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [copies, setCopies] = useState(1);
  const labels = `${copies} ${copies === 1 ? 'label' : 'labels'}`;
  const printer = bridge.target;
  const printerState = printer ? printStationState(printer, 'label', bridge.now) : null;

  const reprint = async (fnsku: string) => {
    if (printerState !== 'Ready') {
      setStationOpen(true);
      return;
    }
    const stationName = printer?.status.stationName ?? 'The printer';
    setSending(true);
    setSent(null);
    const acked = await bridge.sendJob({ grain: 'fnsku', role: 'label', fnsku: { fnsku, copies } });
    setSending(false);
    if (acked) {
      setSent(`Sent ${labels} to ${stationName}.`);
    } else {
      toast.error(`${stationName} didn't respond. Try again.`);
    }
  };

  return (
    <DetailHubScreen<FnskuRecord>
      record={rec.record}
      state={rec.state}
      bar={{
        title: rec.fnsku,
        mono: true,
        subtitle: 'FBA label',
        backHref: rec.back ?? undefined,
        close: rec.back != null,
      }}
      card={(r) => <FnskuSummaryCard record={r} href={rec.link(`${rec.base}/info`)} />}
      ack={sent}
      onAckDismiss={() => setSent(null)}
      content={() => <FnskuCopiesStepper copies={copies} onCopies={setCopies} />}
      rowsLabel="FBA label screens"
      rows={() => [
        {
          id: 'printer',
          title: 'Printer',
          icon: <Printer />,
          meta: printer ? `${printer.status.stationName} · ${printerState}` : 'Choose a printer',
          onSelect: () => setStationOpen(true),
        },
      ]}
      dock={(r) => (
        <DetailDock<FnskuVerb>
          label="FBA label actions"
          verbs={[
            {
              id: 'reprint',
              label: sending ? 'Sending…' : copies > 1 ? `Reprint ${labels}` : 'Reprint label',
              icon: <Printer />,
              primary: true,
              disabled: sending,
            },
            { id: 'scan', label: 'Scan next', icon: <ScanBarcode /> },
          ]}
          onVerb={(verb) => {
            if (verb === 'scan') router.push('/m/scan');
            else void reprint(r.fnsku);
          }}
        />
      )}
    >
      {() => (
        <FnskuStationSheet
          open={stationOpen}
          onClose={() => setStationOpen(false)}
          stations={bridge.stations}
          target={bridge.target}
          now={bridge.now}
          onPick={bridge.pickStation}
        />
      )}
    </DetailHubScreen>
  );
}

export default function FnskuHubPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <FnskuHubInner />
    </Suspense>
  );
}
