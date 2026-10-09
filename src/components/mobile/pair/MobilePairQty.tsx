'use client';

/** `/m/pair/[code]/[sku]` — how many, and commit. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { DIGIT_PAD_CELL, DIGIT_PAD_QUIET_CELL, MobileDigitPad } from '@/components/mobile/keypad/MobileDigitPad';
import { DetailDock } from '@/design-system/components/DetailDock';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
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
import { stockQtyToneClass } from '@/design-system/tokens/stock-qty';
import { useWmsRealtime } from '@/components/mobile/realtime/WmsRealtimeProvider';

type Mode = 'minus' | 'plus';

/** The tally's mono micro-label — the same face as `DetailFact`. */
const TALLY_LABEL = 'font-mono text-role-eyebrow text-mode-muted';

interface LocationContents {
  sku: string;
  qty: number;
  productTitle: string | null;
  /** Version token of the pair: a write computed from a stale on-hand is refused. */
  updatedAt?: string | null;
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
  // Without a fresh location scan a Take / Put lands as the resulting count
  // (the manual count door) — the same keypad, never a claim to stand here.
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

  const projected = Math.max(0, onHand + (mode === 'minus' ? -numericDraft : numericDraft));

  const confirm = useCallback(async () => {
    if (busy) return;
    if (numericDraft <= 0) {
      setError('Tap a number first');
      return;
    }
    if (!user) {
      setError('Sign in before changing location stock.');
      return;
    }
    const reason = mode === 'minus'
      ? takeReasonPayload(takeReason)
      : { ok: true as const, reason: 'BIN_ADD', notes: null };
    if (!reason.ok) {
      setError(reason.error);
      return;
    }
    if (manualCount) {
      setBusy(true);
      setError(null);
      try {
        await commitStockRequest(
          stockSetRequest(
            { rowId: `${code}:${sku}`, barcode: code, sku, qty: onHand, face: `${face} · ${sku}` },
            projected,
            { staffId: user.staffId, reason: reason.reason, notes: reason.notes ?? undefined, expectedUpdatedAt: current?.updatedAt ?? undefined },
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
    current?.updatedAt,
    face,
    invalidateKey,
    manualCount,
    mode,
    numericDraft,
    onHand,
    projected,
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
    : `${mode === 'minus' ? 'Take' : 'Put'} ${numericDraft || 0} · after ${projected}`;
  const pairBackHref = verificationToken
    ? withLocationScanProof(`/m/pair/${encodeURIComponent(code)}`, verificationToken)
    : `/m/pair/${encodeURIComponent(code)}`;

  return (
    // Flat like every record screen; the working half — direction, keypad,
    // confirm — is pinned to the bottom under the thumb (operator
    // 2026-09-25: "the keypad is not pinned to the bottom").
    <div className="flex h-full min-h-0 flex-col bg-mode-panel">
      <MobileV2DetailTopBar
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

        <dl className="grid grid-cols-3 divide-x divide-mode-rule">
          <div className="px-mode-page py-3">
            <dt className={TALLY_LABEL}>On hand</dt>
            <dd className={cn('mt-1 font-mono text-role-title font-semibold tabular-nums', stockQtyToneClass(onHand, { inkClass: 'text-mode-ink' }))}>{onHand}</dd>
          </div>
          <div className="px-mode-page py-3">
            <dt className={TALLY_LABEL}>Change</dt>
            <dd className={cn('mt-1 font-mono text-role-title font-semibold tabular-nums', mode === 'minus' ? 'text-rose-600' : 'text-emerald-600')}>
              {mode === 'minus' ? '−' : '+'}
              {numericDraft || 0}
            </dd>
          </div>
          <div className="px-mode-page py-3">
            <dt className={TALLY_LABEL}>After</dt>
            <dd className={cn('mt-1 font-mono text-role-title font-semibold tabular-nums', stockQtyToneClass(projected, { inkClass: 'text-mode-ink' }))}>{projected}</dd>
          </div>
        </dl>

        {mode === 'minus' && (
          <div className="px-mode-page py-3">
            <TakeReasonChooser value={takeReason} onChange={setTakeReason} />
          </div>
        )}

        {error && (
          <p role="alert" className="bg-rose-50 px-mode-page py-3 text-role-caption font-semibold text-rose-700">
            {error}
          </p>
        )}
      </div>

      {/* The keypad is an input surface (its cells are its face); the confirm verb floats below it, never inside a ground (owner 2026-10-03). */}
      <div className="shrink-0">
        <div role="group" aria-label="Direction" className="grid grid-cols-2 divide-x divide-mode-rule border-t border-mode-rule">
          {/* The chosen direction wears its own fill variant (hover and press stay rose / emerald); the other is a quiet cell. */}
          <Button
            variant={mode === 'minus' ? 'danger' : 'secondary'}
            radius="flush"
            aria-pressed={mode === 'minus'}
            onClick={() => setMode('minus')}
            className={cn(mode === 'minus' ? DIGIT_PAD_CELL : cn(DIGIT_PAD_QUIET_CELL, 'bg-mode-panel text-mode-muted'), 'min-h-14 font-mono text-base')}
            data-testid="pair-qty-take"
          >
            − Take
          </Button>
          <Button
            variant={mode === 'plus' ? 'success' : 'secondary'}
            radius="flush"
            aria-pressed={mode === 'plus'}
            onClick={() => setMode('plus')}
            className={cn(mode === 'plus' ? DIGIT_PAD_CELL : cn(DIGIT_PAD_QUIET_CELL, 'bg-mode-panel text-mode-muted'), 'min-h-14 font-mono text-base')}
            data-testid="pair-qty-put"
          >
            + Put
          </Button>
        </div>

        <MobileDigitPad
          value={draft}
          maxLength={5}
          label="Quantity"
          onChange={(next) => {
            setError(null);
            setDraft(next);
          }}
        />
      </div>

      <DetailDock
        label="Count actions"
        verbs={[
          { id: 'confirm', label: confirmLabel, icon: <Check />, primary: true, variant: mode === 'minus' ? 'danger' : 'success', disabled: busy || numericDraft <= 0 },
        ]}
        onVerb={() => confirm()}
      />
    </div>
  );
}
