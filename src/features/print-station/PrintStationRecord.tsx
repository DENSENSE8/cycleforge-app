'use client';

/**
 * Print station › Stations › **one station** (`?station=`, owner 2026-10-04):
 * the control plane for one computer — rename it for the whole org, make it
 * (or stop it being) the org's label / paperwork station, send one test
 * label, pause / resume it, revoke it (enrolled) or forget it (browser), and
 * read its kind, printers, state, who was last at it and its job log (with a
 * reprint per job). Defaults, pause, revoke and other computers' names need
 * Hardware settings; without it this reads (and test-prints) only.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from '@/components/Icons';
import { CopyChip } from '@/components/ui/CopyChip';
import { requestConfirm } from '@/design-system/components/confirm';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { InlineEditableValue } from '@/design-system/components/InlineEditableValue';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import type { PrintStationEntry, PrintStations } from '@/hooks/usePrintStations';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import type { PrintStock } from '@/lib/label-prints/print-route';
import { PRINT_STATION_NAME_MAX } from '@/lib/print/print-station';
import { STAFF_PRINT_STATUS_POLL_MS, UNNAMED_PRINT_STATION } from '@/lib/print/staff-print-bridge';
import { fetchPrintStationJobs, printStationJobsKey } from '@/lib/print/print-station-registry-client';
import type { PrintStationEnrollment, PrintStationJob } from '@/lib/print/print-station-registry-contracts';
import { fetchPrintStationFnskus, printStationFnskusKey } from '@/lib/print-station/fnsku-client';
import { formatRelativeTime } from '@/lib/search/search-recents';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import {
  STATION_RECORD_ROOT_CLASS,
  STOCKS,
  STOCK_TERM,
  lastJobLine,
  printerFace,
  seenLine,
  stationHandle,
  stationKindLabel,
  stationState,
} from './station-faces';
import { stationBlocked } from './StationPicker';

/** The FBA unit label's template — the one job a station's log can reprint. */
const FNSKU_TEMPLATE_ID = 'fba_fnsku';

const FACTS_BODY_CLASS = 'flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0';

/** One station's record body — its header (name · printers) is the list's record slot. */
export function PrintStationRecord({
  station,
  port,
  onRevoked,
}: {
  station: PrintStationEntry;
  port: PrintStations;
  /** It left the list (revoked / forgotten): close the record. */
  onRevoked: () => void;
}) {
  const { getStaffName } = useStaffNameMap();
  const enrolled = station.kind === 'enrolled';
  const canRename = station.thisComputer || port.canManage;
  const saved = station.stationName === UNNAMED_PRINT_STATION ? '' : station.stationName;
  const [draft, setDraft] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [assigning, setAssigning] = useState<PrintStock | null>(null);
  const [testing, setTesting] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [rePairEnrollment, setRePairEnrollment] = useState<PrintStationEnrollment | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [reprinting, setReprinting] = useState<number | null>(null);
  const jobs = useQuery({
    queryKey: printStationJobsKey(station.stationId),
    queryFn: () => fetchPrintStationJobs(station.stationId),
    refetchInterval: STAFF_PRINT_STATUS_POLL_MS,
  });
  // A test label needs a real FNSKU to draw: the catalog's first, the one FNSKU labels leads with.
  const sample = useQuery({
    queryKey: printStationFnskusKey('', 'all', ''),
    queryFn: ({ signal }) => fetchPrintStationFnskus('', 'all', '', signal),
    staleTime: 60_000,
  });
  const testFnsku = sample.data?.rows[0]?.fnsku ?? null;
  const testBlocked = testFnsku ? stationBlocked(station) : sample.isPending ? 'Loading an FNSKU to test with' : 'No FNSKU in the catalog to test with';
  const name = stationHandle(station);

  const rename = async () => {
    const next = (draft ?? saved).trim().slice(0, PRINT_STATION_NAME_MAX);
    if (draft === null || next === saved) {
      setDraft(null);
      return;
    }
    setRenaming(true);
    try {
      await port.rename(station.stationId, next);
      toast.success(next ? `Renamed to ${next} for everyone` : 'Name cleared');
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : 'The station name was not saved.');
    } finally {
      setRenaming(false);
      setDraft(null);
    }
  };

  const assign = async (stock: PrintStock, stationId: string | null) => {
    setAssigning(stock);
    try {
      await port.setOrgAssignment(stock, stationId);
      toast.success(stationId ? `${name} now prints ${STOCK_TERM[stock].toLowerCase()} for the org` : `No org default for ${STOCK_TERM[stock].toLowerCase()}`);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : 'The default station was not saved.');
    } finally {
      setAssigning(null);
    }
  };

  /** FNSKU stickers at this station. Null when they went out; a string is why they did not. */
  const printAtStation = async (fnsku: string, copies: number, test: boolean): Promise<string | null> => {
    if (station.thisComputer) {
      // Lazy, as every FNSKU print here: the local print driver stays out of the page bundle until it prints.
      const { printFnskuStationJob } = await import('@/lib/print/printFnskuStationJob');
      const job = test ? { fnsku, copies, test: true as const } : { fnsku, copies };
      const outcome = await printFnskuStationJob(job, safeRandomUUID()).catch(() => null);
      if (!outcome) return 'The label did not print.';
      if (outcome.failure) return outcome.failure;
      if (outcome.printed === 0) return outcome.cancelled ? 'Cancelled.' : 'Nothing printed.';
      return null;
    }
    return port.sendFnsku(station.stationId, fnsku, copies, test ? { test: true } : undefined);
  };

  const testPrint = async () => {
    if (!testFnsku || testBlocked) return;
    setTesting(true);
    const reason = await printAtStation(testFnsku, 1, true);
    setTesting(false);
    if (!reason) toast.success(station.thisComputer ? 'Test label printed here' : `Test label sent to ${name}`);
    else toast.error(reason);
  };

  const reprint = async (job: PrintStationJob) => {
    setReprinting(job.id);
    const reason = await printAtStation(job.payload, job.copies, false);
    setReprinting(null);
    if (!reason) toast.success(station.thisComputer ? `${job.payload} reprinted here` : `${job.payload} × ${job.copies} sent to ${name}`);
    else toast.error(reason);
  };

  const togglePause = async () => {
    setPausing(true);
    try {
      await port.setPaused(station.stationId, !station.paused);
      toast.success(station.paused ? `${name} takes jobs again` : `${name} is paused — it refuses jobs until resumed`);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : 'The station was not paused.');
    } finally {
      setPausing(false);
    }
  };

  const rePair = async () => {
    const confirmed = await requestConfirm({
      title: `Re-pair ${name}?`,
      description: `Its current device credential stops working immediately. The station, name, defaults and job history stay in place.`,
      confirmLabel: 'Generate new code',
    });
    if (!confirmed) return;
    setRepairing(true);
    setRePairEnrollment(null);
    try {
      const enrollment = await port.rePair(station.stationId);
      setRePairEnrollment(enrollment);
      toast.success(`New pairing code created for ${name}`);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : 'A new pairing code could not be created.');
    } finally {
      setRepairing(false);
    }
  };

  const revoke = async () => {
    const confirmed = await requestConfirm(
      enrolled
        ? {
            title: `Revoke ${name}?`,
            description: `${name} stops printing at once and leaves every list. Its pairing is gone — to print there again, add a new print station.`,
            confirmLabel: 'Revoke station',
            tone: 'danger',
          }
        : {
            title: `Forget ${name}?`,
            description: `${name} leaves every list and loses its org defaults. It comes back the next time someone opens CycleForge signed in on that computer.`,
            confirmLabel: 'Forget station',
            tone: 'danger',
          },
    );
    if (!confirmed) return;
    setRevoking(true);
    try {
      await port.revoke(station.stationId);
      toast.success(enrolled ? `${name} revoked` : `${name} forgotten`);
      onRevoked();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : 'The station was not removed.');
      setRevoking(false);
    }
  };

  const main = (
    <div className="flex min-w-0 flex-col gap-4">
      <RecordGroup title="Prints for the org" testId="print-station-defaults">
        <div className={FACTS_BODY_CLASS}>
          {STOCKS.map((stock) => {
            const current = port.orgAssignment[stock];
            const isDefault = current === station.stationId;
            const other = current && !isDefault ? port.stations.find((s) => s.stationId === current) : null;
            return (
              <EvidenceFactRow key={stock} label={STOCK_TERM[stock]}>
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2 py-1.5" data-testid={`print-station-default-${stock}`}>
                  <span className="truncate text-role-data text-mode-ink">
                    {isDefault
                      ? 'This station — the org default'
                      : other
                        ? `${stationHandle(other)} is the default`
                        : current
                          ? 'An unlisted station is the default'
                          : 'No org default'}
                  </span>
                  {port.canManage ? (
                    isDefault ? (
                      <Button variant="ghost" size="sm" loading={assigning === stock} onClick={() => void assign(stock, null)} data-testid={`print-station-clear-${stock}`}>
                        Clear
                      </Button>
                    ) : enrolled && stock === 'paper' ? (
                      <span className="shrink-0 text-role-caption text-text-muted">Prints FBA labels only</span>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={assigning === stock}
                        onClick={() => void assign(stock, station.stationId)}
                        data-testid={`print-station-make-${stock}`}
                      >
                        Make default
                      </Button>
                    )
                  ) : null}
                </span>
              </EvidenceFactRow>
            );
          })}
        </div>
        {port.canManage ? null : (
          <p className="px-4 pb-3 text-role-caption text-text-muted">Org defaults and other computers’ names need Hardware settings.</p>
        )}
      </RecordGroup>

      <RecordGroup title="Test print" testId="print-station-test">
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-1">
          <p className={cn('min-w-0 text-role-caption', testBlocked ? 'text-text-warning' : 'text-text-muted')}>
            {testBlocked ?? `One label of ${testFnsku}, the real face. Never logged as a reprint.`}
          </p>
          <Button
            variant="secondary"
            size="md"
            icon={<Printer />}
            loading={testing}
            disabled={Boolean(testBlocked)}
            onClick={() => void testPrint()}
            data-testid="print-station-test-print"
          >
            Test print
          </Button>
        </div>
      </RecordGroup>

      <RecordGroup title="Job log" testId="print-station-jobs">
        {jobs.data?.length ? (
          <ol className="flex flex-col px-4 pb-2">
            {jobs.data.map((job) => (
              <li
                key={job.id}
                className="flex min-w-0 items-center gap-3 border-b border-border-hairline py-1.5 last:border-b-0"
                data-testid="print-station-job"
              >
                <span className={cn(RECORD_ID_CLASS, 'min-w-0 flex-1 truncate')}>{job.payload}</span>
                <span className="shrink-0 text-role-caption tabular-nums text-text-muted">× {job.copies}</span>
                <span className="w-16 shrink-0 text-right text-role-caption text-text-muted" title={new Date(job.createdAt).toLocaleString()}>
                  {formatRelativeTime(job.createdAt)} ago
                </span>
                {job.templateId === FNSKU_TEMPLATE_ID ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={reprinting === job.id}
                    disabled={reprinting != null || stationBlocked(station) != null}
                    onClick={() => void reprint(job)}
                    aria-label={`Reprint ${job.payload} × ${job.copies} at ${name}`}
                    data-testid="print-station-job-reprint"
                  >
                    Reprint
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-4 pb-3 pt-1 text-role-caption text-text-muted">
            {jobs.isPending ? 'Loading its jobs…' : jobs.isError ? 'Its job log did not load.' : 'No jobs logged at this station yet.'}
          </p>
        )}
      </RecordGroup>

      {port.canManage && !station.thisComputer ? (
        <RecordGroup title="Manage" testId="print-station-manage">
          <div className="flex flex-col gap-3 px-4 pb-3 pt-1">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-role-caption text-text-muted">
                {station.paused ? 'Paused — senders see Paused and it refuses jobs.' : 'Pause it to stop jobs without removing it.'}
              </p>
              <Button variant="secondary" size="md" loading={pausing} onClick={() => void togglePause()} data-testid="print-station-pause">
                {station.paused ? 'Resume' : 'Pause'}
              </Button>
            </div>
            {enrolled ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 text-role-caption text-text-muted">
                    Replace its device credential without removing the station, defaults or history.
                  </p>
                  <Button variant="secondary" size="md" loading={repairing} onClick={() => void rePair()} data-testid="print-station-re-pair">
                    Re-pair
                  </Button>
                </div>
                {rePairEnrollment ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border-hairline py-3" data-testid="print-station-re-pair-code">
                    <div>
                      <p className="text-role-caption text-text-muted">New pairing code</p>
                      <p className="font-mono text-3xl font-semibold tracking-[0.18em] text-text-default">{rePairEnrollment.code}</p>
                      <p className="mt-1 text-role-caption text-text-muted">
                        Expires {new Date(rePairEnrollment.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    <CopyChip value={rePairEnrollment.code} display="Copy code" />
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-role-caption text-text-muted">
                {enrolled ? 'Revoke its pairing: it stops printing and leaves every list.' : 'Forget it until that computer is used again.'}
              </p>
              <Button variant="danger" size="md" loading={revoking} onClick={() => void revoke()} data-testid="print-station-revoke">
                {enrolled ? 'Revoke' : 'Forget'}
              </Button>
            </div>
          </div>
        </RecordGroup>
      ) : null}
    </div>
  );

  const aside = (
    <div className="flex min-w-0 flex-col gap-4">
      <RecordGroup title="Station details" testId="print-station-details">
        <div className={FACTS_BODY_CLASS}>
          <EvidenceFactRow label="Name" wide>
            {canRename ? (
              <InlineEditableValue
                value={draft ?? saved}
                placeholder={UNNAMED_PRINT_STATION}
                onChange={setDraft}
                onSubmit={() => void rename()}
                onCancel={() => setDraft(null)}
                editable={!renaming}
                ariaLabel={`Rename ${name}`}
              />
            ) : (
              <span className="text-sm font-semibold text-text-default">{station.stationName}</span>
            )}
          </EvidenceFactRow>
          <EvidenceFactRow label="Status">
            <span className="flex min-w-0 items-center gap-2 py-1.5">
              <LifecycleCode state={stationState(station)} srLabel={null} />
              <span className="truncate text-role-caption text-text-muted">{seenLine(station)}</span>
            </span>
          </EvidenceFactRow>
          <EvidenceFactRow label="Kind">
            <span className="truncate py-1.5 text-role-data text-mode-ink" data-testid="print-station-kind">
              {stationKindLabel(station)}
            </span>
          </EvidenceFactRow>
          {STOCKS.map((stock) => (
            <EvidenceFactRow key={stock} label={stock === 'label' ? 'Label printer' : 'Paper printer'}>
              <span className="truncate py-1.5 text-role-data text-mode-ink">{printerFace(station, stock) ?? 'Not set up'}</span>
            </EvidenceFactRow>
          ))}
          <EvidenceFactRow label="Last at it">
            <span className="truncate py-1.5 text-role-data text-mode-ink">
              {station.thisComputer
                ? 'You, on this computer'
                : enrolled
                  ? 'Nobody — it prints with no sign-in'
                  : station.lastSeenStaffId
                    ? getStaffName(station.lastSeenStaffId)
                    : 'Nobody recorded'}
            </span>
          </EvidenceFactRow>
          <EvidenceFactRow label="Last job">
            <span className="truncate py-1.5 text-role-data text-mode-ink">{lastJobLine(station) ?? 'None logged'}</span>
          </EvidenceFactRow>
          <EvidenceFactRow label="Station id">
            <span className={cn(RECORD_ID_CLASS, 'min-w-0 flex-1 break-all py-1.5')}>{station.stationId}</span>
          </EvidenceFactRow>
        </div>
      </RecordGroup>
    </div>
  );

  return (
    <div className={STATION_RECORD_ROOT_CLASS} data-testid="print-station-evidence">
      <DeskRecordLayout main={main} aside={aside} />
    </div>
  );
}
