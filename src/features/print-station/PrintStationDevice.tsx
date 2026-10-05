'use client';

/**
 * Public, always-on print-station runtime. A single-use code pairs this browser
 * to an org station; afterwards the httpOnly device cookie survives reloads
 * and local-storage clears. The paired screen is both the operator's status
 * surface and the realtime 2×1 label job host.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AblyProvider, useAblyClient } from '@/contexts/AblyContext';
import { AlertTriangle, CheckCircle, CircleDot, Loader2, Printer, RefreshCw } from '@/components/Icons';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { Button, OneTimeCodeInput, Panel, Switch } from '@/design-system/primitives';
import type { RecordStateFace } from '@/design-system/tokens/record';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useNetworkOnline, useRealtimeLink } from '@/hooks/useConnectionHealth';
import { cancelWork, pauseWork, readWork, resumeWork, watchWork } from '@/lib/background-work/store';
import {
  isBrowserPrintSupported,
  listProfiles,
  newProfileId,
  printRawToProfile,
  requestSerialDevice,
  requestUsbDevice,
  resolvePaperSize,
  setRoute,
  upsertProfile,
  type LabelLanguage,
  type PrinterProfile,
} from '@/lib/print/browserPrint';
import { buildTestLabelCommands } from '@/lib/print/labelCommands';
import { runPrintJobOnce } from '@/lib/print/print-station';
import {
  normalizePrintStationPairCode,
  PRINT_STATION_PAIR_CODE_LENGTH,
  type PrintStationDeviceState,
  type PrintStationJob,
} from '@/lib/print/print-station-registry-contracts';
import { printFnskuStationJob } from '@/lib/print/printFnskuStationJob';
import { printQcLabelStationJob } from '@/lib/print/printQcLabel';
import { isSilentPrintEnabled, setSilentPrintEnabled, SILENT_PRINT_CHANGED_EVENT } from '@/lib/print/printMode';
import {
  STAFF_PRINT_CONTROL_EVENT,
  STAFF_PRINT_JOB_EVENT,
  STAFF_PRINT_PROGRESS_EVENT,
  STAFF_PRINT_STATUS_POLL_MS,
  parseStaffPrintControl,
  parseStaffPrintJob,
  type StaffPrintJob,
  type StaffPrintJobState,
  type StaffPrintProgress,
} from '@/lib/print/staff-print-bridge';
import { localStationReadiness } from '@/lib/print/station-readiness';
import { getPrintStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import { publishDeviceAck } from '@/lib/realtime/device-handshake';
import { cn } from '@/utils/_cn';

const DEVICE_API = '/api/print-station-device';
const FNSKU_PAPER = resolvePaperSize('2x1');
const MAX_VISIBLE_JOBS = 12;

type PairPhase = 'checking' | 'unpaired' | 'pairing' | 'paired' | 'revoked';

type DeviceJob = {
  requestId: string;
  labelKey: string;
  kind: 'FBA' | 'Product';
  copies: number;
  done: number;
  state: StaffPrintJobState;
  message: string | null;
  receivedAt: number;
};

type AcceptedDeviceJob =
  | (StaffPrintJob & { grain: 'fnsku'; fnsku: NonNullable<StaffPrintJob['fnsku']> })
  | (StaffPrintJob & { grain: 'qc_label'; qcLabel: NonNullable<StaffPrintJob['qcLabel']> });

type QueueEntry = {
  job: AcceptedDeviceJob;
  channel: any;
  resolve: () => void;
};

const DEVICE_STATE = {
  checking: { id: 'checking', code: 'WAIT', label: 'Checking', tone: 'neutral', icon: 'circle-dot' },
  online: { id: 'online', code: 'ON', label: 'Online', tone: 'success', icon: 'check' },
  paused: { id: 'paused', code: 'PSD', label: 'Paused', tone: 'warning', icon: 'circle-pause' },
  offline: { id: 'offline', code: 'OFF', label: 'Connection lost', tone: 'danger', icon: 'package-x' },
} as const satisfies Readonly<Record<string, RecordStateFace>>;

const JOB_STATE: Readonly<Record<StaffPrintJobState, RecordStateFace>> = {
  running: { id: 'running', code: 'RUN', label: 'Printing', tone: 'info', icon: 'circle-dot' },
  paused: { id: 'paused', code: 'PSD', label: 'Paused', tone: 'warning', icon: 'circle-pause' },
  done: { id: 'done', code: 'DONE', label: 'Printed', tone: 'success', icon: 'check' },
  failed: { id: 'failed', code: 'FAIL', label: 'Failed', tone: 'danger', icon: 'package-x' },
  cancelled: { id: 'cancelled', code: 'STOP', label: 'Cancelled', tone: 'neutral', icon: 'circle-pause' },
};

function currentReadiness() {
  const ready = localStationReadiness();
  return {
    label: {
      ready: ready.label.ready,
      printer: ready.label.profile?.name ?? (ready.label.ready ? 'System default' : null),
    },
    // Device credentials currently authorize 2×1 label data only. Do not advertise
    // paper readiness until device-authenticated document bytes pass their own
    // security review and the runtime can actually execute those jobs.
    paper: { ready: false, printer: null },
  };
}

async function heartbeat(): Promise<Response> {
  return fetch(`${DEVICE_API}/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(currentReadiness()),
    cache: 'no-store',
  });
}

function clearPairingCodeFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

export function PrintStationDevice() {
  const [phase, setPhase] = useState<PairPhase>('checking');
  const [state, setState] = useState<PrintStationDeviceState | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pairedRef = useRef(false);
  const bootedRef = useRef(false);

  const acceptState = useCallback((next: PrintStationDeviceState) => {
    pairedRef.current = true;
    setState(next);
    setPhase('paired');
    setError(null);
  }, []);

  const sendHeartbeat = useCallback(async () => {
    try {
      const response = await heartbeat();
      if (response.status === 401) {
        setState(null);
        setPhase(pairedRef.current ? 'revoked' : 'unpaired');
        return;
      }
      if (!response.ok) throw new Error(`Heartbeat failed (${response.status})`);
      acceptState((await response.json()) as PrintStationDeviceState);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'CycleForge could not reach this station.');
      if (!pairedRef.current) setPhase('unpaired');
    }
  }, [acceptState]);

  const pair = useCallback(
    async (rawCode: string) => {
      const pairingCode = normalizePrintStationPairCode(rawCode);
      if (pairingCode.length !== PRINT_STATION_PAIR_CODE_LENGTH) {
        setError('Enter the four-digit pairing code.');
        return;
      }
      setPhase('pairing');
      setError(null);
      try {
        const response = await fetch(`${DEVICE_API}/pair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: pairingCode }),
        });
        if (!response.ok) {
          setPhase('unpaired');
          setError(
            response.status === 404
              ? 'That pairing code is expired, already used, or incorrect.'
              : response.status === 429
                ? 'Too many pairing attempts. Wait 10 minutes, then create a new code.'
                : 'The station could not be paired.',
          );
          return;
        }
        acceptState((await response.json()) as PrintStationDeviceState);
        setCode('');
        clearPairingCodeFromUrl();
      } catch {
        setPhase('unpaired');
        setError('CycleForge could not be reached. Check this computer’s network and try again.');
      }
    },
    [acceptState],
  );

  useEffect(() => {
    // Pairing codes are single-use. React's development Strict Mode remounts
    // effects once, so guard the boot exchange from consuming the same code a
    // second time and replacing a successful pair with "already used".
    if (bootedRef.current) return;
    bootedRef.current = true;
    const queryCode = normalizePrintStationPairCode(new URLSearchParams(window.location.search).get('code') ?? '');
    if (queryCode) {
      setCode(queryCode);
      void pair(queryCode);
    } else {
      void sendHeartbeat();
    }
  }, [pair, sendHeartbeat]);

  const showRevoked = useCallback(() => setPhase('revoked'), []);

  if (phase === 'checking' || phase === 'pairing') {
    return <DeviceWait pairing={phase === 'pairing'} />;
  }

  if (phase === 'unpaired') {
    return (
      <PairStation
        code={code}
        error={error}
        onCode={(next) => {
          setCode(next);
          setError(null);
        }}
        onPair={pair}
      />
    );
  }

  if (phase === 'revoked' || !state) {
    return <RevokedStation onUseAnother={() => { pairedRef.current = false; setPhase('unpaired'); setError(null); }} />;
  }

  return (
    <AblyProvider authUrl={`${DEVICE_API}/realtime-token`}>
      <PairedStation state={state} heartbeatError={error} onHeartbeatState={acceptState} onRevoked={showRevoked} />
    </AblyProvider>
  );
}

function DeviceFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-surface-canvas text-text-default">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-10">{children}</div>
    </main>
  );
}

function DeviceWait({ pairing }: { pairing: boolean }) {
  return (
    <DeviceFrame>
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-text-muted" role="status">
          <Loader2 className="h-5 w-5 animate-spin" />
          {pairing ? 'Pairing this print station…' : 'Checking this print station…'}
        </div>
      </div>
    </DeviceFrame>
  );
}

function PairStation({
  code,
  error,
  onCode,
  onPair,
}: {
  code: string;
  error: string | null;
  onCode: (code: string) => void;
  onPair: (code: string) => Promise<void>;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onPair(code);
  };
  return (
    <DeviceFrame>
      <div className="flex flex-1 items-center justify-center py-8">
        <Panel radius="2xl" elevation="raised" padding="lg" className="w-full max-w-md" data-testid="print-station-device-pair">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-fill-info text-text-inverse">
            <Printer className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Pair this print station</h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            In CycleForge, open Print station → Stations → Add print station. Enter the code shown there on this computer.
          </p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
            <div className="space-y-2" data-testid="print-station-device-code">
              <p className="text-sm font-semibold text-text-default">Pairing code</p>
              <OneTimeCodeInput
                value={code}
                onChange={onCode}
                onComplete={(complete) => void onPair(complete)}
                length={PRINT_STATION_PAIR_CODE_LENGTH}
                inputMode="numeric"
                transform={normalizePrintStationPairCode}
                label="Four-digit print station pairing code"
                invalid={Boolean(error)}
                autoFocus
              />
            </div>
            {error ? <p role="alert" className="text-sm text-text-danger">{error}</p> : null}
            <Button type="submit" size="lg" disabled={code.length !== PRINT_STATION_PAIR_CODE_LENGTH} data-testid="print-station-device-pair-submit">
              Pair station
            </Button>
          </form>
          <p className="mt-5 text-role-caption text-text-faint">No staff sign-in is needed. Keep this page open after pairing.</p>
        </Panel>
      </div>
    </DeviceFrame>
  );
}

function RevokedStation({ onUseAnother }: { onUseAnother: () => void }) {
  return (
    <DeviceFrame>
      <div className="flex flex-1 items-center justify-center py-8">
        <Panel radius="2xl" elevation="raised" padding="lg" className="w-full max-w-md" data-testid="print-station-device-revoked">
          <AlertTriangle className="mb-5 h-10 w-10 text-text-danger" />
          <h1 className="text-2xl font-semibold tracking-tight">Station access ended</h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            This station was revoked in CycleForge. It is offline and will not accept print jobs.
          </p>
          <Button className="mt-6" variant="secondary" onClick={onUseAnother}>Pair another station</Button>
        </Panel>
      </div>
    </DeviceFrame>
  );
}

function PairedStation({
  state,
  heartbeatError,
  onHeartbeatState,
  onRevoked,
}: {
  state: PrintStationDeviceState;
  heartbeatError: string | null;
  onHeartbeatState: (state: PrintStationDeviceState) => void;
  onRevoked: () => void;
}) {
  const [printerVersion, setPrinterVersion] = useState(0);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number | null>(null);
  const beat = useCallback(async () => {
    try {
      const response = await heartbeat();
      if (response.status === 401) {
        onRevoked();
        return;
      }
      if (!response.ok) return;
      setLastHeartbeatAt(Date.now());
      onHeartbeatState((await response.json()) as PrintStationDeviceState);
    } catch {
      // The connection card owns temporary network loss; the registry will age
      // this station offline until the next successful beat.
    }
  }, [onHeartbeatState, onRevoked]);

  useEffect(() => {
    void beat();
    const timer = window.setInterval(() => void beat(), STAFF_PRINT_STATUS_POLL_MS);
    const refresh = () => void beat();
    window.addEventListener('online', refresh);
    window.addEventListener(SILENT_PRINT_CHANGED_EVENT, refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener(SILENT_PRINT_CHANGED_EVENT, refresh);
    };
  }, [beat, printerVersion]);

  const readiness = currentReadiness();
  return (
    <DeviceRuntime state={state} readiness={readiness}>
      {({ jobs, linkState }) => (
        <DeviceFrame>
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border-soft pb-6">
            <div>
              <p className="text-role-caption font-semibold uppercase tracking-[0.16em] text-text-faint">CycleForge print station</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight" data-testid="print-station-device-name">{state.name}</h1>
              <p className="mt-2 max-w-2xl text-sm text-text-muted">This computer accepts 2 × 1 product and FBA label jobs for the organization. Keep Chrome and this page open.</p>
            </div>
            <LifecycleCode
              state={state.paused ? DEVICE_STATE.paused : linkState === 'online' ? DEVICE_STATE.online : linkState === 'checking' ? DEVICE_STATE.checking : DEVICE_STATE.offline}
              data-testid="print-station-device-status"
            />
          </header>

          <div className="grid gap-4 py-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              <JobQueue jobs={jobs} paused={state.paused} />
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <ConnectionCard
                state={state}
                readiness={readiness}
                linkState={linkState}
                heartbeatError={heartbeatError}
                lastHeartbeatAt={lastHeartbeatAt}
                onRetry={() => void beat()}
              />
              <DevicePrinterCard onChanged={() => setPrinterVersion((version) => version + 1)} />
            </div>
          </div>
          <footer className="mt-auto border-t border-border-soft pt-4 text-role-caption text-text-faint">
            Station ID <span className="font-mono">{state.stationId}</span> · Device credential stored securely in this browser
          </footer>
        </DeviceFrame>
      )}
    </DeviceRuntime>
  );
}

function ConnectionCard({
  state,
  readiness,
  linkState,
  heartbeatError,
  lastHeartbeatAt,
  onRetry,
}: {
  state: PrintStationDeviceState;
  readiness: ReturnType<typeof currentReadiness>;
  linkState: 'checking' | 'online' | 'offline';
  heartbeatError: string | null;
  lastHeartbeatAt: number | null;
  onRetry: () => void;
}) {
  return (
    <Panel radius="xl" padding="none" data-testid="print-station-device-connection">
      <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
        <h2 className="text-sm font-semibold">Station readiness</h2>
        <Button variant="ghost" size="sm" icon={<RefreshCw />} onClick={onRetry}>Check now</Button>
      </div>
      <dl className="divide-y divide-border-hairline px-4">
        <Fact label="Realtime" value={linkState === 'online' ? 'Connected' : linkState === 'checking' ? 'Connecting…' : 'Disconnected'} good={linkState === 'online'} />
        <Fact label="2 × 1 labels" value={readiness.label.printer ?? 'Not ready'} good={readiness.label.ready} />
        <Fact label="Station" value={state.paused ? 'Paused by an admin' : 'Accepting jobs'} good={!state.paused} />
        <Fact label="Heartbeat" value={lastHeartbeatAt ? new Date(lastHeartbeatAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : 'Starting…'} good={lastHeartbeatAt != null} />
      </dl>
      {heartbeatError ? <p className="border-t border-border-soft px-4 py-3 text-role-caption text-text-warning">{heartbeatError}</p> : null}
    </Panel>
  );
}

function Fact({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-role-caption text-text-muted">{label}</dt>
      <dd className={cn('flex min-w-0 items-center gap-2 text-right text-role-data font-medium', good ? 'text-text-default' : 'text-text-warning')}>
        {good ? <CheckCircle className="h-3.5 w-3.5 shrink-0" /> : <CircleDot className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{value}</span>
      </dd>
    </div>
  );
}

function JobQueue({ jobs, paused }: { jobs: DeviceJob[]; paused: boolean }) {
  return (
    <Panel radius="xl" padding="none" className="min-h-[24rem]" data-testid="print-station-device-jobs">
      <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Print jobs</h2>
          <p className="mt-0.5 text-role-caption text-text-muted">Live progress and recent prints at this station.</p>
        </div>
        {paused ? <LifecycleCode state={DEVICE_STATE.paused} srLabel={null} /> : null}
      </div>
      {jobs.length ? (
        <ol className="divide-y divide-border-hairline">
          {jobs.map((job) => (
            <li key={job.requestId} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3" data-testid="print-station-device-job">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-mono text-sm font-semibold">{job.labelKey}</span>
                  <span className="text-role-micro font-semibold uppercase tracking-wide text-text-faint">{job.kind}</span>
                  <LifecycleCode state={JOB_STATE[job.state]} srLabel={null} />
                </div>
                <p className="mt-1 truncate text-role-caption text-text-muted">
                  {job.message ?? (job.state === 'running' ? `Printing ${job.done + 1} of ${job.copies}` : `${job.copies} label${job.copies === 1 ? '' : 's'}`)}
                </p>
                <progress
                  max={Math.max(1, job.copies)}
                  value={job.done}
                  aria-label={`${job.done} of ${job.copies} labels printed`}
                  className="mt-2 block h-1.5 w-full overflow-hidden rounded-full accent-blue-500"
                />
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold tabular-nums">{job.done}/{job.copies}</span>
                <p className="mt-1 text-role-caption text-text-faint">{new Date(job.receivedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex min-h-[19rem] flex-col items-center justify-center px-6 text-center">
          <Printer className="h-9 w-9 text-text-faint" />
          <p className="mt-4 text-sm font-semibold">Ready for the first 2 × 1 label</p>
          <p className="mt-1 max-w-sm text-role-caption leading-5 text-text-muted">Choose {paused ? 'Resume in Stations before sending to' : stateNameForEmptyQueue()} this station from Prepack, QC, or the FNSKU labels desk. Jobs appear here as they arrive.</p>
        </div>
      )}
    </Panel>
  );
}

function stateNameForEmptyQueue() {
  return 'Print at and send';
}

function DevicePrinterCard({ onChanged }: { onChanged: () => void }) {
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [silent, setSilent] = useState(() => isSilentPrintEnabled());
  const profile = listProfiles().find((item) => item.role === 'label' && item.kind !== 'os' && item.language !== 'none') ?? null;
  const canPair = isBrowserPrintSupported();

  const changed = () => {
    setVersion((value) => value + 1);
    onChanged();
  };
  void version;

  const connect = async (kind: 'usb' | 'serial') => {
    setBusy(true);
    setMessage('Choose the label printer in Chrome…');
    try {
      const device = kind === 'usb' ? await requestUsbDevice() : await requestSerialDevice();
      const next: PrinterProfile = {
        id: newProfileId(),
        name: device.suggestedName,
        role: 'label',
        kind: device.kind,
        vendorId: device.vendorId,
        productId: device.productId,
        serialNumber: device.serialNumber,
        language: 'tspl',
        paperSizeId: FNSKU_PAPER.id,
        baudRate: kind === 'serial' ? 9600 : undefined,
        copies: 1,
      };
      upsertProfile(next);
      setRoute('label', next.id);
      setSilentPrintEnabled(true);
      setSilent(true);
      setMessage(`${next.name} is connected for 2 × 1 product and FBA labels.`);
      changed();
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'Printer selection was cancelled.');
    } finally {
      setBusy(false);
    }
  };

  const language = profile?.language === 'zpl' ? 'zpl' : 'tspl';
  const changeLanguage = (nextLanguage: LabelLanguage) => {
    if (!profile) return;
    upsertProfile({ ...profile, language: nextLanguage });
    changed();
  };

  const test = async () => {
    if (!profile) return;
    setBusy(true);
    const result = await printRawToProfile(buildTestLabelCommands(profile.language, FNSKU_PAPER, profile.name, new Date().toLocaleString()), profile);
    setMessage(result.success ? `Test label sent to ${profile.name}.` : (result.reason ?? 'The printer refused the test label.'));
    setBusy(false);
  };

  return (
    <Panel radius="xl" padding="none" data-testid="print-station-device-printer">
      <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Label printer</h2>
          <p className="mt-0.5 text-role-caption text-text-muted">2 × 1 product and FBA labels</p>
        </div>
        <label className="flex items-center gap-2 text-role-caption text-text-muted">
          Always on
          <Switch
            checked={silent}
            onCheckedChange={(next) => {
              setSilent(next);
              setSilentPrintEnabled(next);
              changed();
            }}
            aria-label="Always-on printing"
          />
        </label>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fill-muted"><Printer className="h-4 w-4" /></div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{profile?.name ?? 'Chrome system printer'}</p>
            <p className="mt-0.5 text-role-caption leading-5 text-text-muted">
              {profile ? `Direct ${profile.kind.toUpperCase()} · ${language.toUpperCase()}` : 'Uses the system print destination. Launch Chrome with kiosk printing for unattended output.'}
            </p>
          </div>
        </div>
        {profile ? (
          <div className="grid grid-cols-3 gap-2">
            <Button variant={language === 'tspl' ? 'secondary' : 'ghost'} size="sm" onClick={() => changeLanguage('tspl')}>TSPL</Button>
            <Button variant={language === 'zpl' ? 'secondary' : 'ghost'} size="sm" onClick={() => changeLanguage('zpl')}>ZPL</Button>
            <Button variant="secondary" size="sm" loading={busy} onClick={() => void test()}>Test</Button>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" disabled={!canPair || busy} onClick={() => void connect('usb')}>{profile ? 'Replace · USB' : 'Connect USB'}</Button>
          <Button variant="secondary" size="sm" disabled={!canPair || busy} onClick={() => void connect('serial')}>{profile ? 'Replace · serial' : 'Connect serial'}</Button>
        </div>
        {!canPair ? <p className="text-role-caption text-text-warning">Use Chrome or Edge to connect a USB or serial printer directly.</p> : null}
        {message ? <p aria-live="polite" className="text-role-caption text-text-muted">{message}</p> : null}
      </div>
    </Panel>
  );
}

function DeviceRuntime({
  state,
  readiness,
  children,
}: {
  state: PrintStationDeviceState;
  readiness: ReturnType<typeof currentReadiness>;
  children: (value: { jobs: DeviceJob[]; linkState: 'checking' | 'online' | 'offline' }) => React.ReactNode;
}) {
  const { getClient } = useAblyClient();
  const realtime = useRealtimeLink();
  const networkOnline = useNetworkOnline();
  const [jobs, setJobs] = useState<DeviceJob[]>([]);
  const queueRef = useRef<QueueEntry[]>([]);
  const drainingRef = useRef(false);
  const stateRef = useRef(state);
  const readinessRef = useRef(readiness);
  stateRef.current = state;
  readinessRef.current = readiness;

  const channelName = safeChannelName(() => getPrintStationChannelName(state.organizationId, state.stationId));
  const workId = (requestId: string) => `print:station:${requestId}`;

  const patchJob = useCallback((requestId: string, patch: Partial<DeviceJob>) => {
    setJobs((current) => current.map((row) => row.requestId === requestId ? { ...row, ...patch } : row));
  }, []);

  useEffect(() => {
    let live = true;
    fetch(`${DEVICE_API}/print-jobs`, { cache: 'no-store' })
      .then(async (response) => response.ok ? ((await response.json()) as { jobs?: PrintStationJob[] }).jobs ?? [] : [])
      .then((history) => {
        if (!live || history.length === 0) return;
        setJobs((current) => {
          const currentIds = new Set(current.map((row) => row.requestId));
          const rows: DeviceJob[] = history
            .filter((job) => !currentIds.has(`history:${job.id}`))
            .map((job) => ({
              requestId: `history:${job.id}`,
              labelKey: job.payload,
              kind: job.templateId === 'product' ? 'Product' : 'FBA',
              copies: job.copies,
              done: job.copies,
              state: 'done',
              message: 'Printed previously',
              receivedAt: Date.parse(job.createdAt),
            }));
          return [...current, ...rows].sort((a, b) => b.receivedAt - a.receivedAt).slice(0, MAX_VISIBLE_JOBS);
        });
      })
      .catch(() => {
        // History is supporting evidence; live printing stays available.
      });
    return () => {
      live = false;
    };
  }, [state.stationId]);

  const addJob = useCallback((job: StaffPrintJob, initialState: StaffPrintJobState, message: string | null = null) => {
    const labelKey = job.fnsku?.fnsku ?? job.qcLabel?.unitKey ?? job.grain.toUpperCase();
    const copies = job.fnsku?.copies ?? (job.qcLabel ? 1 : 0);
    const kind: DeviceJob['kind'] = job.grain === 'qc_label' ? 'Product' : 'FBA';
    setJobs((current) => [
      { requestId: job.request_id, labelKey, kind, copies, done: 0, state: initialState, message, receivedAt: Date.now() },
      ...current.filter((row) => row.requestId !== job.request_id),
    ].slice(0, MAX_VISIBLE_JOBS));
  }, []);

  const publishProgress = useCallback((channel: any, requestId: string, progress: Omit<StaffPrintProgress, 'type' | 'request_id'>) => {
    void channel?.publish(STAFF_PRINT_PROGRESS_EVENT, { type: 'staff.print_progress', request_id: requestId, ...progress });
  }, []);

  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      while (queueRef.current.length) {
        const entry = queueRef.current.shift()!;
        const { job, channel } = entry;
        const id = workId(job.request_id);
        const copies = job.grain === 'fnsku' ? job.fnsku.copies : 1;
        let stopMirror = () => {};
        try {
          if (stateRef.current.paused) {
            const message = 'Paused';
            patchJob(job.request_id, { state: 'failed', message });
            publishProgress(channel, job.request_id, { done: 0, total: copies, state: 'failed', message });
            continue;
          }
          if (!readinessRef.current.label.ready) {
            const message = 'No label printer is ready';
            patchJob(job.request_id, { state: 'failed', message });
            publishProgress(channel, job.request_id, { done: 0, total: copies, state: 'failed', message });
            continue;
          }

          patchJob(job.request_id, { state: 'running', message: null });
          publishProgress(channel, job.request_id, { done: 0, total: copies, state: 'running' });
          let lastState: StaffPrintJobState = 'running';
          stopMirror = watchWork(id, (item) => {
            if (item.status === lastState) return;
            lastState = item.status;
            const message = item.message ?? null;
            patchJob(job.request_id, { state: item.status, done: item.done ?? 0, message });
            publishProgress(channel, job.request_id, {
              done: item.done ?? 0,
              total: item.total ?? copies,
              state: item.status,
              ...(!message ? {} : { message }),
            });
          });

          if (job.grain === 'fnsku') {
            const outcome = await printFnskuStationJob(job.fnsku, job.request_id, {
              workId: id,
              onProgress: (done, total) => {
                const item = readWork(id);
                const nextState = item?.status === 'paused' ? 'paused' : 'running';
                patchJob(job.request_id, { done, copies: total, state: nextState });
                publishProgress(channel, job.request_id, { done, total, state: nextState });
              },
              api: {
                catalogUrl: `${DEVICE_API}/fnsku`,
                logUrl: `${DEVICE_API}/print-jobs`,
                stationId: stateRef.current.stationId,
              },
            });
            const finalState: StaffPrintJobState = outcome.cancelled ? 'cancelled' : outcome.failure && outcome.printed === 0 ? 'failed' : 'done';
            const message = outcome.failure ?? (outcome.cancelled ? `Cancelled · ${outcome.printed} of ${copies} printed` : `${outcome.printed} printed`);
            patchJob(job.request_id, { state: finalState, done: outcome.printed, message });
            publishProgress(channel, job.request_id, { done: outcome.printed, total: copies, state: finalState, message });
          } else {
            const failure = await printQcLabelStationJob(job.qcLabel, job.request_id, {
              workId: id,
              api: {
                unitUrl: `${DEVICE_API}/qc-label`,
                logUrl: `${DEVICE_API}/print-jobs`,
                stationId: stateRef.current.stationId,
              },
            });
            const finalState: StaffPrintJobState = failure ? 'failed' : 'done';
            const message = failure ?? 'Product label printed';
            const done = failure ? 0 : 1;
            patchJob(job.request_id, { state: finalState, done, message });
            publishProgress(channel, job.request_id, { done, total: 1, state: finalState, message });
          }
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : 'The label did not print.';
          patchJob(job.request_id, { state: 'failed', message });
          publishProgress(channel, job.request_id, { done: 0, total: copies, state: 'failed', message });
        } finally {
          stopMirror();
          entry.resolve();
        }
      }
    } finally {
      drainingRef.current = false;
    }
  }, [patchJob, publishProgress]);

  useAblyChannel(
    channelName,
    STAFF_PRINT_JOB_EVENT,
    (message) => {
      const job = parseStaffPrintJob(message?.data);
      if (!job || job.targetStationId !== stateRef.current.stationId) return;
      void runPrintJobOnce(job.request_id, async () => {
        const client = await getClient();
        const channel = client?.channels.get(channelName) ?? null;
        await publishDeviceAck(channel, job.request_id, 'print_job');
        if (stateRef.current.paused) {
          addJob(job, 'failed', 'Paused');
          publishProgress(channel, job.request_id, { done: 0, total: job.fnsku?.copies ?? 0, state: 'failed', message: 'Paused' });
          return;
        }
        const accepted =
          (job.grain === 'fnsku' && job.fnsku)
          || (job.grain === 'qc_label' && job.qcLabel);
        if (!accepted) {
          const unsupported = 'This station prints 2 × 1 product and FBA labels only';
          addJob(job, 'failed', unsupported);
          publishProgress(channel, job.request_id, { done: 0, total: 0, state: 'failed', message: unsupported });
          return;
        }
        addJob(job, 'running');
        await new Promise<void>((resolve) => {
          queueRef.current.push({ job: job as AcceptedDeviceJob, channel, resolve });
          void drain();
        });
      }).catch(() => {});
    },
    !!channelName,
  );

  useAblyChannel(
    channelName,
    STAFF_PRINT_CONTROL_EVENT,
    (message) => {
      const control = parseStaffPrintControl(message?.data);
      if (!control || control.targetStationId !== stateRef.current.stationId) return;
      const id = workId(control.request_id);
      if (control.action === 'pause') pauseWork(id);
      else if (control.action === 'resume') resumeWork(id);
      else cancelWork(id);
    },
    !!channelName,
  );

  const linkState = !networkOnline || realtime.degraded ? 'offline' : realtime.health === 'healthy' ? 'online' : 'checking';
  return <>{children({ jobs, linkState })}</>;
}
