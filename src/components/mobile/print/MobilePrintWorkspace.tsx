'use client';

/**
 * Mobile bulk-print procedure — `/m/print`.
 *
 * One step per full page, one column, Continue. Phone publishes a job on this
 * staff ID's print channel; the computer logged in as that staff ID prints USB.
 *
 * Callers: src/app/m/(shell)/print/page.tsx.
 * User: "There must be a back button top left… Continue sticky… see-through.
 * No background… not below the top nav hamburger button."
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/design-system/primitives';
import { MobileTopBar } from '@/components/mobile/redesign/MobileTopBar';
import { NumericStep } from '@/components/barcode/bin-label-printer/NumericStep';
import { LABEL_BUILDER_SELECTED } from '@/components/barcode/label-builder-layout';
import {
  FILTER_DROPDOWN_LABEL_CLASS,
  FILTER_DROPDOWN_SELECT_CLASS,
} from '@/design-system/components/FilterDropdownSelect';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useLocations } from '@/hooks/useLocations';
import { useOrgGs1 } from '@/hooks/useOrgGs1';
import { useSendToDevice } from '@/components/station/send-to-device/useSendToDevice';
import {
  getStaffPrintBridgeChannelName,
  safeChannelName,
} from '@/lib/realtime/channels';
import { toast } from '@/lib/toast';
import {
  MOBILE_PRINT_DRAFT_KEY,
  mobilePrintHref,
  nextMobilePrintStep,
  parseMobilePrintStep,
  prevMobilePrintStep,
  type MobilePrintJobKind,
  type MobilePrintStep,
} from '@/lib/print/mobile-print-flow';
import {
  BAY_CHIP_COUNT,
  baysMatchingParity,
  expandRaggedBayLevelsPrintRun,
  type BayParity,
} from '@/lib/print/expand-print-run';
import {
  STAFF_PRINT_JOB_EVENT,
  STAFF_PRINT_OPTIONS_PATCH_EVENT,
  STAFF_PRINT_PROGRESS_EVENT,
  STAFF_PRINT_STATUS_EVENT,
  STAFF_PRINT_STATUS_REQUEST_EVENT,
  parseStaffPrintStatus,
  type StaffPrintJob,
  type StaffPrintProgress,
  type StaffPrintRole,
  type StaffPrintStatus,
} from '@/lib/print/staff-print-bridge';
import { DEFAULT_CONFIG, loadConfig } from '@/components/barcode/rack-printer/rack-printer-config';
import { MobilePrintPrinterStep, MobilePrintOptionsDropdown } from '@/components/mobile/print/MobilePrintPrinterStep';
import { MobilePrintPreviewStep } from '@/components/mobile/print/MobilePrintPreviewStep';

type Draft = {
  kind: MobilePrintJobKind | null;
  roomName: string;
  zoneLetter: string;
  aisle: number | null;
  bayParity: BayParity;
  selectedBays: number[];
  bayLevels: Record<number, number>;
  role: StaffPrintRole;
};

const EMPTY_DRAFT: Draft = {
  kind: null,
  roomName: '',
  zoneLetter: '',
  aisle: null,
  bayParity: 'all',
  selectedBays: [],
  bayLevels: {},
  role: 'label',
};

function readDraft(): Draft {
  if (typeof window === 'undefined') return EMPTY_DRAFT;
  try {
    const raw = sessionStorage.getItem(MOBILE_PRINT_DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<Draft> & { kind?: string };
    const kind = parsed.kind === 'rack' || parsed.kind === 'bin' ? parsed.kind : null;
    return { ...EMPTY_DRAFT, ...parsed, kind, selectedBays: parsed.selectedBays ?? [] };
  } catch {
    return EMPTY_DRAFT;
  }
}

function chipClass(on: boolean) {
  return cn(
    'h-11 border px-3 text-sm font-semibold',
    on ? LABEL_BUILDER_SELECTED.solid : 'border-border-soft bg-surface-card text-text-default',
  );
}

export function MobilePrintWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = parseMobilePrintStep(searchParams.get('step'));
  const { user } = useAuth();
  const { getClient } = useAblyClient();
  const { rooms, loading: roomsLoading } = useLocations();
  const { identity } = useOrgGs1();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<StaffPrintStatus | null>(null);
  const [progress, setProgress] = useState<StaffPrintProgress | null>(null);
  const sendModel = useSendToDevice('print_job');

  const orgId = user?.organizationId;
  const staffId = user?.staffId ?? 0;
  const staffName = user?.name?.trim() || 'you';
  const channelName = safeChannelName(() =>
    getStaffPrintBridgeChannelName(orgId ?? '', staffId),
  );

  useEffect(() => {
    setDraft(readDraft());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(MOBILE_PRINT_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode */
    }
  }, [draft, hydrated]);

  const config = useMemo(() => {
    if (typeof window === 'undefined') return DEFAULT_CONFIG;
    return loadConfig();
  }, [hydrated]);

  const kind = draft.kind;
  const next = nextMobilePrintStep(step, kind);
  const prev = prevMobilePrintStep(step, kind);

  const effectiveBays = useMemo(
    () => baysMatchingParity(draft.selectedBays, draft.bayParity),
    [draft.selectedBays, draft.bayParity],
  );

  const segments = useMemo(() => {
    if (kind !== 'rack' && kind !== 'bin') return [];
    if (!draft.zoneLetter || draft.aisle == null) return [];
    return expandRaggedBayLevelsPrintRun({
      zone: draft.zoneLetter,
      aisle: draft.aisle,
      selectedBays: effectiveBays,
      bayLevels: draft.bayLevels,
      grain: kind,
    });
  }, [kind, draft.zoneLetter, draft.aisle, draft.bayLevels, effectiveBays]);

  const role: StaffPrintRole = 'label';

  useAblyChannel(
    channelName,
    STAFF_PRINT_STATUS_EVENT,
    (message) => {
      const nextStatus = parseStaffPrintStatus(message?.data);
      if (nextStatus) setStatus(nextStatus);
    },
    !!channelName && staffId > 0,
  );

  useAblyChannel(
    channelName,
    STAFF_PRINT_PROGRESS_EVENT,
    (message) => {
      const data = message?.data as StaffPrintProgress | undefined;
      if (data?.type === 'staff.print_progress') setProgress(data);
    },
    !!channelName && staffId > 0,
  );

  const requestStatus = useCallback(async () => {
    if (!channelName) return;
    try {
      const client = await getClient();
      await client?.channels.get(channelName)?.publish(STAFF_PRINT_STATUS_REQUEST_EVENT, {
        type: 'staff.print_status_request',
      });
    } catch {
      /* best-effort */
    }
  }, [channelName, getClient]);

  useEffect(() => {
    if (step === 'options' || step === 'print') void requestStatus();
  }, [step, requestStatus]);

  const go = useCallback(
    (target: MobilePrintStep) => {
      router.replace(mobilePrintHref(target));
    },
    [router],
  );

  const canContinue = useMemo(() => {
    if (step === 'job') return kind != null;
    if (step === 'room') return !!draft.roomName && /^[A-Z]$/.test(draft.zoneLetter);
    if (step === 'aisle') return draft.aisle != null && draft.aisle >= 1;
    if (step === 'bays') return effectiveBays.length > 0;
    if (step === 'levels') return effectiveBays.every((b) => (draft.bayLevels[b] ?? 0) >= 1);
    if (step === 'preview') return segments.length > 0;
    if (step === 'ack') return segments.length > 0;
    if (step === 'options') return true;
    if (step === 'print') return segments.length > 0;
    return false;
  }, [step, kind, draft, effectiveBays, segments.length]);

  const onBack = useCallback(() => {
    if (prev) go(prev);
    else router.push('/m/home');
  }, [prev, go, router]);

  const onContinue = useCallback(() => {
    if (!canContinue || !next) return;
    if (kind && (step === 'job' || step === 'options')) {
      setDraft((d) => ({ ...d, role: 'label' }));
    }
    go(next);
  }, [canContinue, next, go, kind, step]);

  const patchOptions = useCallback(
    async (patch: { silent?: boolean; routing?: { label?: string | null; paper?: string | null } }) => {
      if (!channelName) return;
      try {
        const client = await getClient();
        const channel = client?.channels.get(channelName);
        await channel?.publish(STAFF_PRINT_OPTIONS_PATCH_EVENT, {
          type: 'staff.print_options_patch',
          ...patch,
        });
        await channel?.publish(STAFF_PRINT_STATUS_REQUEST_EVENT, {
          type: 'staff.print_status_request',
        });
      } catch {
        toast.error('Could not reach this staffer’s computer');
      }
    },
    [channelName, getClient],
  );

  const firePrint = useCallback(async () => {
    if (!channelName) {
      toast.error('Sign in on this phone as the same person as the computer');
      return;
    }
    const acked = await sendModel.send({
      channelName,
      publish: async (requestId) => {
        const client = await getClient();
        const channel = client?.channels.get(channelName);
        if (!channel) throw new Error('print channel unavailable');
        const job: StaffPrintJob = {
          type: 'staff.print_job',
          request_id: requestId,
          grain: kind === 'bin' ? 'bin' : 'rack',
          role: 'label',
          location: {
            roomName: draft.roomName,
            gln: identity.gln,
            orgSlug: user?.organizationSlug ?? null,
            segments,
          },
        };
        await channel.publish(STAFF_PRINT_JOB_EVENT, job);
      },
    });
    if (acked) toast.success('Computer accepted the print job');
    else toast.error(`No computer answered for ${staffName} — open the desk app signed in as you`);
  }, [
    channelName,
    kind,
    sendModel,
    getClient,
    draft.roomName,
    identity.gln,
    user?.organizationSlug,
    staffName,
    segments,
  ]);

  const pickRoom = (name: string, letter: string) => {
    setDraft((d) => ({
      ...d,
      roomName: name,
      zoneLetter: letter,
      aisle: null,
      selectedBays: [],
      bayLevels: {},
    }));
  };

  const toggleBay = (n: number) => {
    setDraft((d) => {
      const has = d.selectedBays.includes(n);
      const selectedBays = has ? d.selectedBays.filter((b) => b !== n) : [...d.selectedBays, n].sort((a, b) => a - b);
      const bayLevels = { ...d.bayLevels };
      if (has) delete bayLevels[n];
      else if (!bayLevels[n]) bayLevels[n] = config.maxLevels;
      return { ...d, selectedBays, bayLevels };
    });
  };

  const primaryLabel =
    step === 'print'
      ? `Print ${segments.length} label${segments.length === 1 ? '' : 's'}`
      : next
        ? 'Continue'
        : 'Done';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MobileTopBar onBack={onBack} />
      <div className="relative mx-auto min-h-0 w-full max-w-md flex-1">
        <div className="h-full overflow-y-auto px-4 pb-24 pt-4">
          <div className="flex flex-col gap-3">
          {step === 'job' && (
            <>
              {(
                [
                  ['rack', 'Bay labels'],
                  ['bin', 'Bin labels'],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  type="button"
                  variant="secondary"
                  radius="surface"
                  className={cn('h-14 w-full', chipClass(kind === id))}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      kind: id,
                      role: 'label',
                    }))
                  }
                >
                  {label}
                </Button>
              ))}
            </>
          )}

          {step === 'room' && (
            <>
              {roomsLoading && <p className="text-role-caption text-text-soft">Loading rooms…</p>}
              {rooms.map((room) => {
                const name = (room.room || room.name || '').trim();
                const letter = (room.zone_letter || '').toUpperCase();
                if (!name) return null;
                const ok = /^[A-Z]$/.test(letter);
                return (
                  <Button
                    key={room.id}
                    type="button"
                    variant="secondary"
                    radius="surface"
                    disabled={!ok}
                    className={cn('h-14 w-full justify-between', chipClass(draft.roomName === name))}
                    onClick={() => ok && pickRoom(name, letter)}
                  >
                    <span>{name}</span>
                    <span className="font-mono">{ok ? letter : 'No zone'}</span>
                  </Button>
                );
              })}
            </>
          )}

          {step === 'aisle' && (
            <NumericStep
              title="Pick an aisle"
              count={config.maxAisles}
              selected={draft.aisle ?? undefined}
              onPick={(n) => setDraft((d) => ({ ...d, aisle: n }))}
              customLabel="Custom aisle #"
            />
          )}

          {step === 'bays' && (
            <>
              <p className="text-role-caption text-text-muted">Odds left · Evens right. Select every bay to print.</p>
              <div className="grid grid-cols-3 gap-2">
                {(['all', 'odds', 'evens'] as const).map((parity) => (
                  <Button
                    key={parity}
                    type="button"
                    variant="secondary"
                    radius="surface"
                    className={chipClass(draft.bayParity === parity)}
                    onClick={() => setDraft((d) => ({ ...d, bayParity: parity }))}
                  >
                    {parity === 'all' ? 'All' : parity === 'odds' ? 'Odds' : 'Evens'}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: BAY_CHIP_COUNT }, (_, i) => i + 1).map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant="secondary"
                    radius="surface"
                    className={chipClass(draft.selectedBays.includes(n))}
                    onClick={() => toggleBay(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </>
          )}

          {step === 'levels' && (
            <>
              <p className="text-role-caption text-text-muted">Height per bay — one column.</p>
              {effectiveBays.map((bay) => (
                <label key={bay} className="block">
                  <span className={FILTER_DROPDOWN_LABEL_CLASS}>Bay {bay}</span>
                  <select
                    className={FILTER_DROPDOWN_SELECT_CLASS}
                    value={draft.bayLevels[bay] ?? config.maxLevels}
                    onChange={(e) => {
                      const level = Number(e.target.value);
                      setDraft((d) => ({ ...d, bayLevels: { ...d.bayLevels, [bay]: level } }));
                    }}
                  >
                    {Array.from({ length: config.maxLevels }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n} level{n === 1 ? '' : 's'}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </>
          )}

          {step === 'preview' && (
            <MobilePrintPreviewStep
              segments={segments}
              roomName={draft.roomName}
              gln={identity.gln}
            />
          )}

          {step === 'ack' && (
            <div className={cn('border border-border-soft bg-surface-card p-4', cornerClass('card'))}>
              <p className="font-mono text-lg font-semibold text-text-default">
                {draft.zoneLetter}-{String(draft.aisle ?? '').padStart(2, '0')}
              </p>
              <p className="mt-2 text-role-caption text-text-muted">
                {draft.roomName} · {effectiveBays.length} bay{effectiveBays.length === 1 ? '' : 's'} · {segments.length}{' '}
                label{segments.length === 1 ? '' : 's'}
              </p>
            </div>
          )}

          {step === 'options' && (
            <MobilePrintPrinterStep
              status={status}
              role={role}
              staffName={staffName}
              onPatch={patchOptions}
              onRefresh={() => void requestStatus()}
            />
          )}

          {step === 'print' && (
            <div className={cn('border border-border-soft bg-surface-card p-4', cornerClass('card'))}>
              <p className="text-sm font-semibold text-text-default">
                {segments.length} labels · {draft.zoneLetter}-{String(draft.aisle ?? '').padStart(2, '0')}
              </p>
              <div className="mt-3 flex flex-col gap-3">
                <MobilePrintOptionsDropdown status={status} role={role} onPatch={patchOptions} />
              </div>
              {progress && (
                <p className="mt-2 font-mono text-role-caption text-text-soft">
                  Printing {progress.done}/{progress.total}
                </p>
              )}
              {sendModel.state === 'timed_out' && (
                <p className="mt-2 text-role-caption text-text-danger">
                  No computer answered. Sign into the desk app as {staffName}, or retry Print.
                </p>
              )}
            </div>
          )}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          <Button
            type="button"
            variant={step === 'print' ? 'success' : 'primary'}
            radius="surface"
            className="pointer-events-auto h-14 w-full"
            disabled={step === 'print' ? !canContinue || sendModel.pending : !canContinue || !next}
            loading={step === 'print' ? sendModel.pending : false}
            onClick={() => {
              if (step === 'print') void firePrint();
              else onContinue();
            }}
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
