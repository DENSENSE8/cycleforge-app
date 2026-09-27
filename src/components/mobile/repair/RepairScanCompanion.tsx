'use client';

/**
 * RepairScanCompanion — the phone's half of the counter tablet's repair visit,
 * on the mobile exoskeleton (`DetailHubScreen`, operator 2026-09-25).
 */

import { useCallback, useMemo, useState } from 'react';
import { Check, Hash, Pin, Plus, ScanBarcode } from '@/components/Icons';
import { DetailHubScreen } from '@/design-system/components/DetailHubScreen';
import { Button } from '@/design-system/primitives/Button';
import type { CompanionVisit } from '@/lib/kiosk/companion-shape';
import { classifySerialRead, findDuplicateSerial, sameSerial, unitHasSerial } from '@/lib/kiosk/serial-read';
import { appendSerial, joinSerials, removeSerial, splitSerials } from '@/lib/kiosk/serial-list';
import type { DetailDoor } from '@/lib/mobile/detail-door';
import { RepairScanDock } from './RepairScanDock';
import { RepairScanReadNotice, type ReadNotice, type UnitName } from './RepairScanReadNotice';
import { RepairScanVisitCard } from './RepairScanVisitCard';
import { repairScanInfoHref, useRepairScanVisit } from './useRepairScanVisit';
import { vibrateRead } from '@/lib/scan-feedback/play';

const serialCount = (n: number) => `${n} ${n === 1 ? 'serial' : 'serials'}`;

export function RepairScanCompanion({ token }: { token: string }) {
  const { visit, ended, loading, error, reload, writeSerial } = useRepairScanVisit(token);
  /** The unit the staffer tapped; reads stay aimed at it until Release. */
  const [picked, setPicked] = useState<string | null>(null);
  /** The unit the last read went to — the aim once every unit has a serial. */
  const [touched, setTouched] = useState<string | null>(null);
  /** Each tap on a unit row re-arms the lens if the staffer had pressed Done. */
  const [armRequest, setArmRequest] = useState(0);
  const [notice, setNotice] = useState<ReadNotice | null>(null);
  /**
   * The last write: which unit and the serial it added (for Undo), and whether
   * a re-read of that serial is still taken as the camera's echo — until the
   * staffer taps a unit, which makes the next read deliberate.
   */
  const [lastWrite, setLastWrite] = useState<{ target: UnitName; serial: string; echo: boolean } | null>(null);
  const [pending, setPending] = useState(0);
  const [undoing, setUndoing] = useState(false);

  const devices = useMemo(() => visit?.devices ?? [], [visit]);
  const names = useMemo(
    () => new Map<string, UnitName>(devices.map((d, i) => [d.lineId, { lineId: d.lineId, unit: i + 1, title: d.title }])),
    [devices],
  );
  const pickedId = picked && names.has(picked) ? picked : null;
  const focusId =
    pickedId ??
    devices.find((d) => !d.serialNumber.trim())?.lineId ??
    (touched && names.has(touched) ? touched : (devices.at(-1)?.lineId ?? null));
  const focus = focusId ? (names.get(focusId) ?? null) : null;
  const focusSerials = splitSerials(devices.find((d) => d.lineId === focusId)?.serialNumber);
  const filled = devices.filter((d) => d.serialNumber.trim()).length;
  /** Every unit has a serial and nobody aimed: the read is going to the fallback unit. */
  const fallback = pickedId == null && devices.length > 0 && filled === devices.length;

  const commit = useCallback(
    async (serial: string, via: 'scan' | 'link') => {
      if (!focus) return;
      // The camera still pointed at the label it just read re-reads it after its dedup window.
      if (lastWrite?.echo && sameSerial(lastWrite.serial, serial)) {
        if (!notice) setNotice({ kind: 'already', target: lastWrite.target, serial });
        return;
      }
      const had = devices.find((d) => d.lineId === focus.lineId)?.serialNumber ?? '';
      if (unitHasSerial(had, serial)) {
        setNotice({ kind: 'already', target: focus, serial });
        return;
      }
      const other = findDuplicateSerial(devices, focus.lineId, serial);
      // Nobody aimed and every unit has a serial: a read already on the visit
      // is the camera catching an earlier label, not a new serial.
      if (fallback && other) {
        setNotice({ kind: 'already', target: names.get(other.lineId) ?? focus, serial });
        return;
      }
      const duplicateOf = other ? (names.get(other.lineId) ?? null) : null;
      // A tapped unit with no serial yet takes this one read; then focus moves
      // on to the next gap. One that already had serials stays aimed.
      if (!had.trim()) setPicked(null);
      setTouched(focus.lineId);
      setPending((n) => n + 1);
      const { status, serialNumber } = await writeSerial(focus.lineId, (current) => appendSerial(current, serial));
      setPending((n) => n - 1);
      if (status === 'saved') {
        vibrateRead(duplicateOf ? 'duplicate' : 'saved');
        setLastWrite({ target: focus, serial, echo: true });
        setNotice({ kind: 'saved', target: focus, serial, duplicateOf, via, count: splitSerials(serialNumber).length });
      } else if (status === 'failed') {
        vibrateRead('refused');
        setPicked(focus.lineId);
        setNotice({ kind: 'failed', target: focus });
      }
    },
    [devices, fallback, focus, lastWrite, names, notice, writeSerial],
  );

  const onDecode = useCallback(
    (raw: string) => {
      const read = classifySerialRead(raw);
      if (read.kind === 'reject') {
        vibrateRead('refused');
        setNotice({ kind: 'rejected', value: raw.trim().slice(0, 40), reason: read.reason });
      } else if (read.kind === 'url') {
        vibrateRead('refused');
        setNotice({ kind: 'link', url: read.url });
      } else {
        void commit(read.serial, read.kind === 'url-serial' ? 'link' : 'scan');
      }
    },
    [commit],
  );

  const undo = useCallback(async () => {
    if (!lastWrite || undoing) return;
    setUndoing(true);
    const { status, serialNumber } = await writeSerial(lastWrite.target.lineId, (current) =>
      removeSerial(current, lastWrite.serial),
    );
    setUndoing(false);
    if (status === 'saved') {
      setLastWrite(null);
      // The undone unit takes focus: the next read is its re-scan.
      setPicked(lastWrite.target.lineId);
      setNotice({ kind: 'undone', target: lastWrite.target, restored: serialNumber });
    } else if (status === 'failed') {
      setNotice({ kind: 'failed', target: lastWrite.target });
    }
  }, [lastWrite, undoing, writeSerial]);

  const rows = (v: CompanionVisit): DetailDoor[] =>
    v.devices.map((d, i) => {
      const serials = splitSerials(d.serialNumber);
      const inFocus = d.lineId === focusId;
      const aimed = d.lineId === pickedId;
      const twin = serials.map((s) => findDuplicateSerial(v.devices, d.lineId, s)).find((u) => u != null);
      const justScanned = notice?.kind === 'saved' && notice.target.lineId === d.lineId;
      return {
        id: d.lineId,
        title: d.title,
        icon: aimed ? <Pin /> : inFocus ? (serials.length ? <Plus /> : <ScanBarcode />) : serials.length ? <Check /> : <Hash />,
        meta: (
          <>
            {`Unit ${i + 1} · `}
            {serials.length ? (
              <>
                <span className="font-mono text-mode-ink">{serials[0]}</span>
                {serials.length > 1 ? <span className="font-semibold text-mode-ink">{` +${serials.length - 1}`}</span> : null}
              </>
            ) : inFocus ? (
              'Next read lands here'
            ) : (
              'Needs serial'
            )}
            {aimed ? <span className="font-semibold text-mode-ink"> · Selected</span> : null}
            {serials.length && inFocus ? ' · next read adds here' : ''}
            {justScanned ? ' · just now' : ''}
            {twin ? <span className="text-amber-700">{` · same serial as Unit ${names.get(twin.lineId)?.unit ?? 0}`}</span> : null}
          </>
        ),
        onSelect: () => {
          setPicked(d.lineId);
          setLastWrite((w) => (w ? { ...w, echo: false } : w));
          setArmRequest((n) => n + 1);
        },
      };
    });

  const cameraAlert = notice?.kind === 'rejected' || notice?.kind === 'failed' || notice?.kind === 'link';

  return (
    <DetailHubScreen<CompanionVisit>
      record={visit}
      state={{
        loading,
        error,
        onRetry: reload,
        notice: ended
          ? 'This phone link has ended. Tap “Scan serials with phone” on the tablet and scan the new QR.'
          : undefined,
      }}
      bar={{
        title: visit?.cart ? `Cart #${visit.cart.id}` : 'Repair visit',
        mono: Boolean(visit?.cart),
        subtitle: 'Repair serials',
        backHref: '/m',
        meta: (v) => `${filled} of ${v.devices.length} units with serials`,
      }}
      card={(v) => <RepairScanVisitCard visit={v} href={repairScanInfoHref(token)} />}
      content={() => (
        <>
          {notice ? (
            <RepairScanReadNotice
              notice={notice}
              onUndo={lastWrite ? () => void undo() : null}
              undoing={undoing}
              onDismiss={() => setNotice(null)}
            />
          ) : null}
          {focus ? (
            <section
              aria-label="Next read"
              data-testid="repair-scan-target"
              data-aimed={pickedId ? 'selected' : fallback ? 'last' : 'next-gap'}
              className="relative flex items-center gap-3 bg-mode-panel px-mode-page py-2.5"
            >
              {/* Selected: an ink bar on the leading edge (a border would lose to the column's divide colour). */}
              {pickedId ? <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-mode-ink" /> : null}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-mode-well text-mode-muted [&>svg]:h-5 [&>svg]:w-5">
                {pickedId ? <Pin /> : focusSerials.length ? <Plus /> : <ScanBarcode />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-role-caption font-semibold text-mode-muted">
                  {pickedId
                    ? 'Selected — every read adds here'
                    : fallback
                      ? 'Every unit has a serial — next read adds to the last one'
                      : focusSerials.length
                        ? 'Next read adds to'
                        : 'Next read'}
                </p>
                <p className="truncate text-mode-body font-semibold text-mode-ink">{`Unit ${focus.unit} · ${focus.title}`}</p>
                <p className="break-words text-role-caption text-mode-muted">
                  {focusSerials.length ? (
                    <>
                      {`${serialCount(focusSerials.length)}: `}
                      <span className="font-mono text-mode-ink">{joinSerials(focusSerials)}</span>
                    </>
                  ) : (
                    'No serial yet'
                  )}
                </p>
              </div>
              {pickedId ? (
                <Button variant="secondary" size="md" onClick={() => setPicked(null)}>
                  Release
                </Button>
              ) : null}
            </section>
          ) : null}
        </>
      )}
      rowsLabel="Units"
      rows={rows}
      dock={() => (
        <RepairScanDock
          label="Serial number camera"
          collapsedLabel="Scan a serial"
          status={
            focus
              ? focusSerials.length
                ? `Adds to Unit ${focus.unit} · ${serialCount(focusSerials.length)}`
                : `Unit ${focus.unit} · first serial`
              : 'No units yet'
          }
          statusAlert={cameraAlert}
          pending={pending}
          onDecode={onDecode}
          armRequest={armRequest}
        />
      )}
    />
  );
}
