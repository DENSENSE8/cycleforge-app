'use client';

import { useState } from 'react';
import { Check, Monitor, Printer } from '@/components/Icons';
import { DetailAck, DetailNav, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import type { SerialUnitRead } from '@/lib/serial/use-serial-unit';
import { Button } from '@/design-system/primitives';
import { usePrintStations, type PrintStationEntry } from '@/hooks/usePrintStations';
import { printQcLabelStationJob } from '@/lib/print/printQcLabel';
import { qcLabelWireKey } from '@/lib/print/staff-print-bridge';
import { safeRandomUUID } from '@/lib/safe-uuid';

const PANEL = 'flex flex-col gap-3 bg-mode-panel px-mode-page py-3';
const ERROR = 'bg-rose-50 px-mode-page py-3 text-role-caption font-semibold text-rose-700';

/** Why a station cannot take a label right now; null when it can. */
function stationBlocked(station: PrintStationEntry): string | null {
  if (station.thisComputer) return null;
  if (!station.live) return 'Offline';
  if (!station.label.ready) return 'No label printer';
  return null;
}

/**
 * A passed unit's QC / pre-box sticker, sent from the phone to any of the
 * org's print stations (`usePrintStations` → `qc_label` job; the station
 * resolves the unit and logs the print). "This device" prints here.
 */
export function QcLabelPrintPanel({ unit }: { unit: SerialUnitRead }) {
  const stations = usePrintStations();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unitKey = qcLabelWireKey(unit);

  // A phone prints at a station: the pick › the org's label station › the first ready one › this device.
  const orgLabel = stations.target.label && !stations.target.label.thisComputer ? stations.target.label : null;
  const chosen =
    stations.stations.find((s) => s.stationId === chosenId) ??
    orgLabel ??
    stations.stations.find((s) => !s.thisComputer && stationBlocked(s) == null) ??
    stations.stations.find((s) => s.thisComputer) ??
    null;
  const blocked = chosen ? stationBlocked(chosen) : 'No print station';
  const where = chosen ? (chosen.thisComputer ? 'this device' : chosen.stationName) : null;

  const print = async () => {
    if (!chosen || blocked || sending) return;
    if (!unitKey) {
      setError(`SN ${unit.serial_number} cannot ride a print job — print it from Inventory › QC labels.`);
      return;
    }
    setSending(true);
    setSent(null);
    setError(null);
    if (chosen.thisComputer) {
      const failure = await printQcLabelStationJob({ unitKey }, safeRandomUUID());
      setSending(false);
      if (failure) setError(failure);
      else setSent('QC label printed here — stick it on the unit to prepack.');
      return;
    }
    const acked = await stations.sendQcLabel(chosen.stationId, unitKey);
    setSending(false);
    if (acked) setSent(`${chosen.stationName} is printing the QC label — stick it on the unit to prepack.`);
    else setError(`${chosen.stationName} did not answer — is CycleForge open there? Nothing was printed.`);
  };

  return (
    <section aria-labelledby="qc-label" className="divide-y divide-mode-rule" data-testid="qc-label-print">
      <DetailSectionHeading id="qc-label">QC label · prepack</DetailSectionHeading>
      <DetailNav
        label="Print station"
        rows={[
          {
            id: 'station',
            title: where ? `Print at ${where}` : 'Choose a print station',
            icon: <Printer />,
            meta: chosen ? (blocked ?? 'Ready') : 'No computer has CycleForge open with a label printer',
            onSelect: () => setPicking((open) => !open),
          },
        ]}
      />
      {picking ? (
        <DetailNav
          label="Print stations"
          rows={stations.stations.map((station) => ({
            id: station.stationId,
            title: station.thisComputer ? 'This device' : station.stationName,
            icon: station.stationId === chosen?.stationId ? <Check /> : station.thisComputer ? <Monitor /> : <Printer />,
            meta: stationBlocked(station) ?? (station.label.printer || 'Ready'),
            onSelect: () => {
              setChosenId(station.stationId);
              setPicking(false);
            },
          }))}
        />
      ) : null}
      <div className={PANEL}>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          icon={<Printer />}
          loading={sending}
          disabled={Boolean(blocked) || !chosen}
          onClick={() => void print()}
          data-testid="qc-label-print-send"
        >
          Print QC label
        </Button>
      </div>
      {sent ? <DetailAck onDismiss={() => setSent(null)}>{sent}</DetailAck> : null}
      {error ? (
        <p role="alert" className={ERROR}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
