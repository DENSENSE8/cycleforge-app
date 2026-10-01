'use client';

/** `/m/pair/[code]/[sku]` — how many, and commit. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ScanBarcode, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { DetailDock } from '@/design-system/components/DetailDock';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { takeReasonPayload, type TakeReasonChoice } from '@/lib/inventory/take-reason';
import { TakeReasonChooser } from './TakeReasonChooser';
import { useAuth } from '@/contexts/AuthContext';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { commitStockRequest, stockSetRequest } from '@/lib/inventory/stock-bin-verb-writes';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import { invalidateSkuExceptions } from '@/hooks/useProvisionalSkus';
import { previousMobilePath } from '@/lib/mobile/nav-trail';
import { locationHubHref, withLocationScanProof } from '@/lib/mobile/location-hub-href';
import { locationCode, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { cn } from '@/utils/_cn';
import { useWmsRealtime } from '@/components/mobile/realtime/WmsRealtimeProvider';

type Mode = 'minus' | 'plus';

const KEYS: ReadonlyArray<string | number> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'clear', 0, 'back'];

/** Flush keypad / toggle cell: square, no gap, instant ink press, no scale or transition. */
const CELL = 'h-auto w-full justify-center shadow-none ring-0 transition-none enabled:active:scale-100';

/** The tally's mono micro-label — the same face as `DetailFact`. */
const TALLY_LABEL = 'font-mono text-role-eyebrow text-mode-muted';

interface LocationContents {
  sku: string;
  qty: number;
  productTitle: string | null;
}

export function MobilePairQty({
  code,
  sku,
  returnHref,
  initialMode = 'plus',
  verificationToken,
}: {
  code: string;
  sku: string;
  /**
   * The screen that sent the operator here and should get them back — the
   * location record or the SKU exception record. Omitted: Back is the
   * candidate list, Confirm the location record.
   */
  returnHref?: string;
  initialMode?: Mode;
  verificationToken: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { execute: executeWmsCommand } = useWmsRealtime();
  const pendingCommandId = useRef<string | null>(null);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [takeReason, setTakeReason] = useState<TakeReasonChoice>(null);

  const face = useMemo(() => {
    const segs = parseLocationCodeFlat(code);
    return segs ? locationCode(segs) : code;
  }, [code]);

  const invalidateKey = useMemo(() => ['mobile-location-bind', code] as const, [code]);

  const { data: current } = useQuery<LocationContents | null>({
    queryKey: ['pair-qty', code, sku],
    queryFn: async () => {
      const res = await fetch(`/api/locations/${encodeURIComponent(code)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { contents?: LocationContents[] };
      return (json.contents ?? []).find((row) => row.sku === sku) ?? null;
    },
  });

  const onHand = Number(current?.qty) || 0;
  const title = current?.productTitle?.trim() || sku;
  const manualCount = !verificationToken;

  // Puts carry no reason; leaving TAKE drops the take reason with it.
  useEffect(() => {
    if (mode === 'plus') setTakeReason(null);
  }, [mode]);

  const numericDraft = useMemo(() => {
    if (!draft) return 0;
    const parsed = parseInt(draft, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [draft]);

  const projected = manualCount
    ? numericDraft
    : Math.max(0, onHand + (mode === 'minus' ? -numericDraft : numericDraft));

  const pressKey = useCallback((key: string | number) => {
    setError(null);
    if (key === 'clear') {
      setDraft('');
      return;
    }
    if (key === 'back') {
      setDraft((prev) => prev.slice(0, -1));
      return;
    }
    setDraft((prev) => {
      const next = `${prev}${key}`.replace(/^0+(?=\d)/, '');
      return next.length > 5 ? prev : next;
    });
  }, []);

  const confirm = useCallback(async () => {
    if (busy) return;
    if ((manualCount && draft === '') || (!manualCount && numericDraft <= 0)) {
      setError('Tap a number first');
      return;
    }
    if (!user) {
      setError('Sign in before changing location stock.');
      return;
    }
    if (manualCount) {
      setBusy(true);
      setError(null);
      try {
        await commitStockRequest(
          stockSetRequest(
            { rowId: `${code}:${sku}`, barcode: code, sku, qty: onHand, face: `${face} · ${sku}` },
            numericDraft,
            { staffId: user.staffId, reason: onHand === 0 ? 'BIN_ADD' : 'MANUAL_COUNT' },
          ),
        );
        await queryClient.invalidateQueries({ queryKey: invalidateKey });
        if (isProvisionalSku(sku)) await invalidateSkuExceptions(queryClient);
        const target = returnHref ?? locationHubHref(code);
        if (previousMobilePath() === target.split('?')[0]) router.back();
        else router.replace(target);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Update failed');
        setBusy(false);
      }
      return;
    }
    const reason = mode === 'minus'
      ? takeReasonPayload(takeReason)
      : { ok: true as const, reason: 'BIN_ADD', notes: null };
    if (!reason.ok) {
      setError(reason.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const commandId = pendingCommandId.current ?? safeRandomUUID();
      pendingCommandId.current = commandId;
      await executeWmsCommand({
        v: 1,
        commandId,
        organizationId: user.organizationId,
        staffId: user.staffId,
        issuedAt: new Date().toISOString(),
        name: 'putaway.adjust',
        input: {
          barcode: code,
          sku,
          direction: mode === 'minus' ? 'take' : 'put',
          qty: numericDraft,
          reason: reason.reason,
          reasonCodeId: null,
          notes: reason.notes,
          locationVerificationToken: verificationToken,
        },
      });
      pendingCommandId.current = null;
      await queryClient.invalidateQueries({ queryKey: invalidateKey });
      if (isProvisionalSku(sku)) await invalidateSkuExceptions(queryClient);
      // Back to the record that sent us — the location record by default, so
      // the new count is visible where the operator is working.
      const target = returnHref ?? locationHubHref(code);
      // Pop when the record is the entry below, so its own Back still works.
      if (previousMobilePath() === target.split('?')[0]) router.back();
      else router.replace(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      setBusy(false);
    }
  }, [
    busy,
    code,
    draft,
    face,
    invalidateKey,
    manualCount,
    mode,
    numericDraft,
    onHand,
    queryClient,
    returnHref,
    router,
    sku,
    takeReason,
    user,
    verificationToken,
    executeWmsCommand,
  ]);

  const confirmLabel = busy
    ? 'Saving…'
    : manualCount
      ? `Set ${numericDraft || 0}`
      : `${mode === 'minus' ? 'Take' : 'Add'} ${numericDraft || 0} · after ${projected}`;
  const pairBackHref = verificationToken
    ? withLocationScanProof(`/m/pair/${encodeURIComponent(code)}`, verificationToken)
    : `/m/pair/${encodeURIComponent(code)}`;

  return (
    // Flat like every record screen; the working half — direction, keypad,
    // confirm — is pinned to the bottom under the thumb (operator
    // 2026-09-25: "the keypad is not pinned to the bottom").
    <div className="flex h-full min-h-0 flex-col bg-mode-panel">
      <MobileDetailTopBar
        title={title}
        subtitle={face}
        mono
        backHref={returnHref ?? pairBackHref}
      />

      <div className="min-h-0 flex-1 divide-y divide-mode-rule overflow-y-auto overscroll-contain">
        {/* The header already carries the product name, and when the catalog has no title that name IS the SKU — printing it again underneath is… */}
        {title !== sku && (
          <div className="px-mode-page py-3">
            <span className="block min-w-0 truncate font-mono text-role-caption text-mode-muted">{sku}</span>
          </div>
        )}

        <dl className={cn('grid divide-x divide-mode-rule', manualCount ? 'grid-cols-2' : 'grid-cols-3')}>
          <div className="px-mode-page py-3">
            <dt className={TALLY_LABEL}>On hand</dt>
            <dd className="mt-1 font-mono text-role-title font-semibold tabular-nums text-mode-ink">{onHand}</dd>
          </div>
          <div className="px-mode-page py-3">
            <dt className={TALLY_LABEL}>{manualCount ? 'New count' : 'Change'}</dt>
            <dd
              className={cn(
                'mt-1 font-mono text-role-title font-semibold tabular-nums',
                manualCount ? 'text-mode-ink' : mode === 'minus' ? 'text-rose-600' : 'text-emerald-600',
              )}
            >
              {!manualCount ? (mode === 'minus' ? '−' : '+') : null}
              {numericDraft || 0}
            </dd>
          </div>
          {!manualCount ? (
            <div className="px-mode-page py-3">
              <dt className={TALLY_LABEL}>After</dt>
              <dd className="mt-1 font-mono text-role-title font-semibold tabular-nums text-mode-ink">{projected}</dd>
            </div>
          ) : null}
        </dl>

        {!manualCount && mode === 'minus' && (
          <div className="px-mode-page py-3">
            <TakeReasonChooser value={takeReason} onChange={setTakeReason} />
          </div>
        )}

        {manualCount ? (
          <div className="space-y-2 bg-blue-50 px-mode-page py-3 text-blue-900">
            <p className="text-role-caption font-semibold">Manual count · set the exact quantity at this location.</p>
            <Button
              href={`/m/scan?intent=location&returnTo=${encodeURIComponent('/m/stock')}`}
              variant="ghost"
              size="md"
              radius="mode"
              icon={<ScanBarcode />}
              className="w-full"
            >
              Scan for rapid put / take
            </Button>
          </div>
        ) : null}

        {error && (
          <p role="alert" className="bg-rose-50 px-mode-page py-3 text-role-caption font-semibold text-rose-700">
            {error}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 z-sticky bg-mode-panel">
        {!manualCount ? (
          <div
            role="group"
            aria-label="Direction"
            className="grid grid-cols-2 divide-x divide-mode-rule border-t border-mode-rule"
          >
            <Button
              variant="secondary"
              radius="flush"
              aria-pressed={mode === 'minus'}
              onClick={() => setMode('minus')}
              className={cn(
                CELL,
                'min-h-14 font-mono text-base',
                mode === 'minus' ? 'bg-rose-600 text-white active:bg-rose-700' : 'bg-mode-panel text-mode-muted active:bg-mode-ink active:text-mode-panel',
              )}
            >
              − Take
            </Button>
            <Button
              variant="secondary"
              radius="flush"
              aria-pressed={mode === 'plus'}
              onClick={() => setMode('plus')}
              className={cn(
                CELL,
                'min-h-14 font-mono text-base',
                mode === 'plus' ? 'bg-emerald-600 text-white active:bg-emerald-700' : 'bg-mode-panel text-mode-muted active:bg-mode-ink active:text-mode-panel',
              )}
            >
              + Put
            </Button>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-px border-t border-mode-rule bg-mode-rule">
          {KEYS.map((key) => (
            <Button
              key={String(key)}
              variant="secondary"
              radius="flush"
              ariaLabel={typeof key === 'string' ? key : `digit ${key}`}
              onClick={() => pressKey(key)}
              className={cn(
                CELL,
                'min-h-16 font-mono text-2xl active:bg-mode-ink active:text-mode-panel',
                key === 'clear' || key === 'back' ? 'bg-mode-well text-mode-muted' : 'bg-mode-panel text-mode-ink',
              )}
            >
              {key === 'clear' ? <X className="h-5 w-5" /> : key === 'back' ? '⌫' : String(key)}
            </Button>
          ))}
        </div>

        <DetailDock
          label="Count actions"
          verbs={[
            { id: 'confirm', label: confirmLabel, icon: <Check />, primary: true, disabled: busy || (manualCount ? draft === '' : numericDraft <= 0) },
          ]}
          onVerb={() => confirm()}
        />
      </div>
    </div>
  );
}
