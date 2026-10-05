'use client';

/**
 * Location labels — ONE tree for the phone (`/m/labels`) and the desk
 * (`/inventory/locations?tab=labels`, inside `MobileFirstFrame`).
 *
 *   How many  Single (live preview) · Bulk (per bay, odd / even, one axis, parts drawers)
 *   Address  scan a sticker (camera, wedge or typed) — or Zone › Aisle › Bay › Level › Position
 *   Printer   the remembered label station; a sheet changes it
 *   Print     the one primary in the dock; disabled, it names what is missing
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer } from '@/components/Icons';
import { LocationLabelFacePreview } from '@/components/labels/LocationLabelFacePreview';
import { DetailNav } from '@/components/mobile/detail/DetailParts';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';
import { DetailDock } from '@/design-system/components/DetailDock';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import type { ExpandedPrintRunRow } from '@/lib/locations/expand-print-run';
import { vibrateScan } from '@/lib/scan-feedback/play';
import { LabelStationSheet, labelStationBlocked, labelStationName } from './LabelStationSheet';
import { LocationLabelRun, type LabelRunFreeze } from './LocationLabelRun';
import { NumberTiles } from './NumberTiles';
import { RoomPicker } from './RoomPicker';
import { StepPills } from './StepPills';
import { labelFace, parseLabelCode, printVerb, type LabelKind } from './location-label-model';
import { useLocationLabelBuilder } from './useLocationLabelBuilder';

type QuantityMode = 'single' | 'bulk';

const QUANTITY_TABS = [
  { id: 'single', label: 'Single', testId: 'label-how-single' },
  { id: 'bulk', label: 'Bulk', testId: 'label-how-bulk' },
];

/** Tiles shown before More, per step (a row is five). */
const TILE_COUNT = { aisle: 10, bay: 15, level: 5, position: 20 } as const;

const SECTION_HEADING = 'px-mode-page pb-1 pt-4 text-role-caption font-semibold text-text-muted';

export function LocationLabelBuilder({
  initialKind,
  initialCode = null,
  armScan = false,
  dock,
}: {
  initialKind: LabelKind;
  /** A location or bay code to start from (the record the operator came from). */
  initialCode?: string | null;
  /** Mount the camera up — a phone with nothing prefilled scans first. */
  armScan?: boolean;
  /** `dock` on the phone (the shell's floor); `float` inside the desk frame. */
  dock: 'dock' | 'float';
}) {
  const c = useLocationLabelBuilder({ initialKind, initialCode });
  const [quantityMode, setQuantityMode] = useState<QuantityMode>('single');
  const [runRows, setRunRows] = useState<ExpandedPrintRunRow[]>([]);
  const [stationOpen, setStationOpen] = useState(false);

  const { applyCode } = c;
  const onCode = useCallback(
    (raw: string) => {
      const applied = applyCode(raw);
      vibrateScan(applied ? 'success' : 'reject');
    },
    [applyCode],
  );

  // A desk wedge / ring scan of a location sticker fills the address instead of opening that location.
  useEffect(() => {
    const onWedge = (event: Event) => {
      const value = (event as CustomEvent<{ value?: string }>).detail?.value;
      if (!value || !parseLabelCode(value)) return;
      event.preventDefault();
      onCode(value);
    };
    window.addEventListener('wedge-scan', onWedge);
    return () => window.removeEventListener('wedge-scan', onWedge);
  }, [onCode]);

  const bulk = quantityMode === 'bulk';
  const { room, aisle, bay, level, position } = c.selection;
  const rack = c.kind === 'rack';
  // Stable per address: the bulk planner re-derives its rows from this object.
  const freeze = useMemo<LabelRunFreeze | null>(
    () =>
      room && c.zoneLetter && aisle != null
        ? { roomName: room, zoneLetter: c.zoneLetter, aisle, bay, level, position: rack ? undefined : position, rack }
        : null,
    [room, c.zoneLetter, aisle, bay, level, position, rack],
  );

  const verb = printVerb({
    kind: c.kind,
    run: bulk,
    printing: c.printing,
    selection: c.selection,
    missingLetter: c.missingLetter,
    single: c.single,
    runCount: freeze ? runRows.length : 0,
    printerBlocked: c.printerBlocked,
  });

  const { print, single } = c;
  const commit = useCallback(() => {
    if (verb.needsPrinter) {
      setStationOpen(true);
      return;
    }
    if (!verb.ready) return;
    const labels = bulk ? runRows.map((row) => row.segments) : single ? [single] : [];
    return print(labels);
  }, [bulk, print, runRows, single, verb.needsPrinter, verb.ready]);

  // ⌘/Ctrl+P prints what the dock would print.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'p' || !verb.ready) return;
      event.preventDefault();
      void commit();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [commit, verb.ready]);

  const station = c.station;
  const stationMeta = station ? (labelStationBlocked(station) ?? (station.label.printer || 'Ready')) : 'No computer with CycleForge open';

  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="location-label-builder" data-kind={c.kind}>
      {dock === 'dock' ? (
        <MobileCaptureWindow
          label="Location sticker camera"
          collapsedLabel="Scan a location sticker"
          status={c.scanNote ?? 'Scan a location or bay sticker'}
          statusAlert={c.scanNote != null}
          initiallyArmed={armScan}
          onDecode={onCode}
        />
      ) : null}
      {c.scanNote ? (
        <p role="alert" className="break-words px-mode-page pt-2 text-role-caption font-semibold text-text-danger" data-testid="label-scan-note">
          {c.scanNote}
        </p>
      ) : null}

      <StepPills kind={c.kind} step={c.step} zoneLetter={c.zoneLetter} selection={c.selection} onOpen={c.openStep} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" data-testid="location-label-workspace">
        <section aria-label="Select location" className="min-w-0 lg:sticky lg:top-0 lg:self-start">
          <div className="px-mode-page pb-2 pt-2">
            <TabSwitch
              tabs={QUANTITY_TABS}
              activeTab={quantityMode}
              onTabChange={(id) => setQuantityMode(id as QuantityMode)}
            />
          </div>
          <div className="border-y border-mode-rule" data-testid={`label-step-body-${c.step}`}>
            {c.step === 'zone' ? (
              <RoomPicker rooms={c.rooms} zoneMap={c.zoneMap} loading={c.loading} selectedRoom={c.selection.room} onSelect={c.pickRoom} />
            ) : c.step === 'position' ? (
              <NumberTiles
                key="position"
                label="Position"
                value={c.selection.position}
                onPick={(n) => c.pickNumber('position', n)}
                count={TILE_COUNT.position}
                none={{ label: 'No position', selected: c.selection.position == null, onPick: c.clearPosition }}
                testId="label-tiles-position"
              />
            ) : (
              <NumberTiles
                key={c.step}
                label={c.step === 'aisle' ? 'Aisle' : c.step === 'bay' ? 'Bay' : 'Level'}
                value={c.selection[c.step]}
                onPick={(n) => c.pickNumber(c.step as 'aisle' | 'bay' | 'level', n)}
                count={TILE_COUNT[c.step]}
                pad={c.step !== 'level'}
                testId={`label-tiles-${c.step}`}
              />
            )}
          </div>
        </section>

        <section aria-label={bulk ? 'Bulk labels' : 'Selected label'} className="flex min-w-0 flex-col border-t border-mode-rule lg:min-h-full lg:border-l lg:border-t-0">
          {bulk ? (
            freeze ? (
              <LocationLabelRun freeze={freeze} gln={c.gln} disabled={c.printing} onRowsChange={setRunRows} />
            ) : (
              <p className="px-mode-page py-4 text-role-caption text-text-muted">Pick a room and an aisle to plan a bulk print.</p>
            )
          ) : (
            <div className="px-mode-page pb-3 pt-3" data-testid="label-single-preview">
              <LocationLabelFacePreview segments={c.single} roomName={c.selection.room} gln={c.gln} fit="host" />
              {c.single ? (
                <p className="pt-2 text-center font-mono text-sm font-semibold tabular-nums text-text-default">{labelFace(c.single)}</p>
              ) : null}
            </div>
          )}

          <h2 className={SECTION_HEADING}>Printer</h2>
          <DetailNav
            label="Printer"
            rows={[
              {
                id: 'station',
                title: station ? `Print at ${labelStationName(station)}` : 'Choose a printer',
                icon: <Printer />,
                meta: stationMeta,
                onSelect: () => setStationOpen(true),
              },
            ]}
          />
          {c.error ? (
            <p role="alert" className="break-words bg-surface-danger px-mode-page py-3 text-role-caption font-semibold text-text-danger" data-testid="label-print-error">
              {c.error}
            </p>
          ) : null}

          <div className="flex-1" />
          <DetailDock
            label="Print labels"
            placement={dock}
            verbs={[
              {
                id: 'print',
                label: verb.label,
                icon: <Printer />,
                primary: true,
                disabled: !verb.ready,
                loading: c.printing,
                testId: 'label-print',
              },
            ]}
            onVerb={commit}
          />
        </section>
      </div>

      <LabelStationSheet
        open={stationOpen}
        onClose={() => setStationOpen(false)}
        stations={c.stations.stations}
        chosenId={station?.stationId ?? null}
        onPick={(id) => c.stations.pick('label', id)}
      />
    </div>
  );
}
