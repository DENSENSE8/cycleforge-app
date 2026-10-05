'use client';

/**
 * Print station › **Stations** — the managing mode (owner 2026-10-04; `G S`
 * from anywhere on the Print station, `G F` back to FNSKU labels). One line
 * per org print station, read left to right:
 *
 *   Online / Offline / Paused · name · its label and paper printers · what it
 *   prints for the org by default · who was last at it (or Enrolled) · its
 *   last job · when it was last heard
 *
 * This computer leads, then the org defaults, then live stations, then the
 * rest. Find (`?q=`) narrows by name or printer. The header's **Add print
 * station** enrols an org-owned computer (a name → a pairing code + QR). The
 * open station (`?station=`) is the control plane for one computer: rename,
 * org defaults, test print, pause / resume, revoke (enrolled) or forget
 * (browser), and its job log. Everything but reading and test-printing needs
 * Hardware settings.
 */

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Plus } from '@/components/Icons';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { useSearchParams } from 'next/navigation';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { TriageRow, type TriageRowFace } from '@/design-system/components/triage-card-list/TriageRow';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { usePrintStations, type PrintStationEntry } from '@/hooks/usePrintStations';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import type { RowGroup } from '@/lib/group-rows';
import type { PrintStationAssignment } from '@/lib/print/print-station-registry-contracts';
import { PRINT_STATIONS_PATH, PRINT_STATIONS_STATION_PARAM } from '@/lib/print-station/stations';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { PRINT_STATIONS_VIEW } from '@/lib/triage/views';
import { PrintStationEnrollPopover } from './PrintStationEnrollPopover';
import { PrintStationRecord } from './PrintStationRecord';
import { STATION_RECORD_ROOT_CLASS, STOCK_TERM, defaultsOf, lastJobLine, printersLine, seenLine, stationHandle, stationState } from './station-faces';

const VIEW = PRINT_STATIONS_VIEW;
/** No chips: Find is the sidebar's. */
const NO_CHIPS: readonly never[] = [];
/** The open station is not in the roster (a stale link, or a computer no longer listed). */
const NOT_LOADED_ID = -1;
/** One roster entry with its 1-based place: the list family keys records by number, the URL by station id. */
type StationItem = PrintStationEntry & { ordinal: number };
type StationModel = { key: string; ids: readonly number[]; lead: StationItem };
type StationFaceProps = TriageCardSlotProps<StationItem, StationModel> & { assignment: PrintStationAssignment };

const stationRowId = (row: StationItem): number => row.ordinal;

export function PrintStationsDesk() {
  const searchParams = useSearchParams();
  const port = usePrintStations();
  const { stations, orgAssignment: assignment } = port;
  const query = searchParams.get('q')?.trim().toLowerCase() ?? '';

  const items = useMemo<StationItem[]>(() => {
    const rank = (station: PrintStationEntry) =>
      station.thisComputer ? 0 : defaultsOf(station, assignment).length ? 1 : station.live ? 2 : 3;
    // Stable: the roster's name order holds inside each rank.
    return [...stations].sort((a, b) => rank(a) - rank(b)).map((station, index) => ({ ...station, ordinal: index + 1 }));
  }, [stations, assignment]);
  const found = useMemo(
    () =>
      query
        ? items.filter((station) =>
            [station.stationName, station.label.printer, station.paper.printer].some((text) => text?.toLowerCase().includes(query)),
          )
        : items,
    [items, query],
  );

  const writeOpen = useCallback(
    (stationId: string | null) => {
      const params = readLiveSearchParams(searchParams.toString());
      if (stationId) params.set(PRINT_STATIONS_STATION_PARAM, stationId);
      else params.delete(PRINT_STATIONS_STATION_PARAM);
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `${PRINT_STATIONS_PATH}?${qs}` : PRINT_STATIONS_PATH);
    },
    [searchParams],
  );

  const cut = useTriageCut({ statusKeys: NO_CHIPS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const { filterBands } = cut;
  const allBands = useMemo<[string, RowGroup<StationItem>[]][]>(
    () => (found.length ? [['stations', found.map((row) => ({ key: row.stationId, rows: [row] }))]] : []),
    [found],
  );
  const bands = useMemo(() => filterBands(allBands, (group) => group.key, () => NO_CHIPS), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

  const openKey = searchParams.get(PRINT_STATIONS_STATION_PARAM)?.trim() || null;
  const openRecord = useMemo(() => (openKey ? (items.find((row) => row.stationId === openKey) ?? null) : null), [openKey, items]);
  const openId = openRecord ? openRecord.ordinal : openKey ? NOT_LOADED_ID : null;
  const openRow = useCallback((row: StationItem) => writeOpen(row.stationId), [writeOpen]);
  const closeRecord = useCallback(() => writeOpen(null), [writeOpen]);

  usePublishRecordCursor({
    surfaceId: 'print-station-rows',
    scope: 'record',
    enabled: true,
    order: bands,
    openId,
    getId: stationRowId,
    onOpen: openRow,
    onClose: closeRecord,
  });

  const selection = useLocalTriageSelection(stationRowId);
  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId: stationRowId,
        groupKey: (group: RowGroup<StationItem>) => group.key,
        cardModel: (group: RowGroup<StationItem>): StationModel => {
          const lead = group.rows[0]!;
          return { key: group.key, ids: [lead.ordinal], lead };
        },
        exactFind: (text: string, model: StationModel) => model.lead.stationName.toLowerCase() === text,
        renderCard: (props: TriageCardSlotProps<StationItem, StationModel>) => <StationRow {...props} assignment={assignment} />,
      }),
    [assignment],
  );

  const feed: TriageFeed<StationItem> = {
    bands,
    allBands,
    painted,
    sectioned: false,
    loading: stations.length === 0,
    fetching: false,
    search: { value: query, pending: false },
    selection,
    open: { id: openId, open: openRow, close: closeRecord },
  };

  const [enrolling, setEnrolling] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const toggleEnroll = useCallback(() => setEnrolling((open) => !open), []);
  const enrollAction = useMemo(
    () =>
      port.canManage ? (
        <DeskHeaderAction
          ref={addRef}
          type="button"
          variant="primary"
          size="md"
          icon={<Plus aria-hidden />}
          aria-haspopup="dialog"
          aria-expanded={enrolling}
          onClick={toggleEnroll}
          data-testid="print-station-add"
        >
          Add print station
        </DeskHeaderAction>
      ) : null,
    [port.canManage, enrolling, toggleEnroll],
  );

  return (
    <>
      {enrollAction ? <DeskActionSlotRegistrar role="primary">{enrollAction}</DeskActionSlotRegistrar> : null}
      {enrolling ? (
        <PrintStationEnrollPopover
          anchorRef={addRef}
          port={port}
          onClose={() => setEnrolling(false)}
          onEnrolled={(stationId) => {
            setEnrolling(false);
            writeOpen(stationId);
          }}
        />
      ) : null}
      <TriageCardList
        family={family}
        feed={feed}
        cut={cut}
        density="row"
        summary={null}
        bulk={null}
        searchEmpty={query ? <p className="text-sm text-text-muted">No station matches “{query}” — try its name or its printer.</p> : null}
        allClear={
          <TriageAllClear
            title="No print stations yet"
            detail="A computer becomes a station the first time it opens CycleForge signed in — or add an org-owned one with Add print station."
          />
        }
        record={{
          title: openRecord ? stationHandle(openRecord) : 'Not in this list',
          subtitle: openRecord ? printersLine(openRecord) : undefined,
          noun: 'station',
          testId: 'print-station-record',
          summary: null,
          strip: null,
          view: openRecord ? (
            <PrintStationRecord key={openRecord.stationId} station={openRecord} port={port} onRevoked={closeRecord} />
          ) : openKey ? (
            <div className={STATION_RECORD_ROOT_CLASS}>
              <DeskRecordLayout
                main={<EvidenceNotice>This station is not listed — it was revoked or forgotten, has been offline a long time, or its browser storage was cleared.</EvidenceNotice>}
              />
            </div>
          ) : null,
        }}
      />
    </>
  );
}

/** One station on one line: state · name · printers · defaults · who · last job · when. */
const StationRow = memo(function StationRow({ assignment, ...props }: StationFaceProps) {
  const station = props.model.lead;
  const { getStaffName } = useStaffNameMap();
  const who = station.thisComputer
    ? 'This computer'
    : station.kind === 'enrolled'
      ? 'Enrolled'
      : station.lastSeenStaffId
        ? getStaffName(station.lastSeenStaffId)
        : null;
  const face = useMemo<TriageRowFace>(() => {
    const defaults = defaultsOf(station, assignment);
    const handle = stationHandle(station);
    return {
      state: stationState(station),
      identity: handle,
      identityWidth: 'long',
      title: printersLine(station),
      facts: [
        { id: 'default', value: defaults.length ? `Default · ${defaults.map((stock) => STOCK_TERM[stock]).join(' · ')}` : null, width: 'long' },
        { id: 'who', value: who, width: 'short', tone: 'muted' },
        { id: 'last-job', value: lastJobLine(station), width: 'short', tone: 'muted' },
        { id: 'seen', value: seenLine(station), width: 'short', tone: 'muted' },
      ],
      next: null,
      aria: { row: `Print station ${handle}`, open: `Open ${handle}`, check: `Select ${handle}` },
    };
  }, [station, who, assignment]);
  return <TriageRow {...props} face={face} testIdPrefix={VIEW.testIdPrefix} rowAttrs={{ 'data-station-id': station.stationId }} />;
});
