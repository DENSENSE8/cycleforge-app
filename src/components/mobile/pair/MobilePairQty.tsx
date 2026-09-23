'use client';

/**
 * `/m/pair/[code]/[sku]` — how many, and commit.
 *
 * ## Why a page and not the fullscreen keypad sheet
 *
 * `BinStockNumpadSheet` is `fixed inset-0`: it covers the tape, the camera and
 * the location it is editing, and its only exit is a back-arrow that is not
 * the OS back gesture. As the second half of a routed pairing flow that is
 * wrong twice — the operator loses the context they just chose, and the phone's
 * own Back does something different from the screen's Back.
 *
 * As a route it is continuous with the screen before it: the location is still
 * in the header, Back returns to the candidate list, and a reload mid-count
 * lands you in the same place.
 *
 * ## Adding, not replacing
 *
 * Arriving from a pairing this is a PUT onto whatever is already there —
 * "adding the stock of it together". The on-hand figure is shown beside the
 * projection so the sum is visible before Confirm, because a putaway that
 * silently replaces a count is indistinguishable from one that adds until the
 * next cycle count disagrees.
 *
 * `− TAKE` is still offered, since arriving here from a PAIRED row is the same
 * job in the other direction, but `plus` is the opening mode: you are here
 * because you are holding stock.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { Panel, TextField } from '@/design-system/primitives';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { ReasonCodePicker, type ReasonCode } from '@/components/sku/ReasonCodePicker';
import { useAuth } from '@/contexts/AuthContext';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import { locationCode, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { OnHoldBadge } from './OnHoldBadge';
import { useWmsRealtime } from '@/components/mobile/realtime/WmsRealtimeProvider';
import { motion } from '@/design-system/motion';

type Mode = 'minus' | 'plus';

const KEYS: ReadonlyArray<string | number> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'clear', 0, 'back'];
const MotionButton = motion.create(Button);

interface LocationContents {
  sku: string;
  qty: number;
  productTitle: string | null;
}

export function MobilePairQty({ code, sku }: { code: string; sku: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { execute: executeWmsCommand } = useWmsRealtime();
  const pendingCommandId = useRef<string | null>(null);

  const [mode, setMode] = useState<Mode>('plus');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<ReasonCode | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

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

  // A reason that needs a note or a photo cannot be satisfied here, so the
  // picker resets with direction and takes its canonical default.
  useEffect(() => {
    setReason(null);
    setNoteDraft('');
  }, [mode]);

  const numericDraft = useMemo(() => {
    if (!draft) return 0;
    const parsed = parseInt(draft, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [draft]);

  const projected = Math.max(0, onHand + (mode === 'minus' ? -numericDraft : numericDraft));

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
    if (numericDraft <= 0) {
      setError('Tap a number first');
      return;
    }
    if (reason?.requires_note && !noteDraft.trim()) {
      setError(`Reason “${reason.label}” needs a note`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!user) throw new Error('Sign in before changing location stock.');
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
          reason: reason?.code ?? (mode === 'minus' ? 'BIN_PULL' : 'BIN_ADD'),
          reasonCodeId: reason?.id ?? null,
          notes: noteDraft.trim() || null,
        },
      });
      pendingCommandId.current = null;
      await queryClient.invalidateQueries({ queryKey: invalidateKey });
      // Straight back to the scan loop: the job that brought you here is done,
      // and the next thing an operator does is scan the next label.
      router.replace('/m/scan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      setBusy(false);
    }
  }, [
    busy,
    code,
    invalidateKey,
    mode,
    noteDraft,
    numericDraft,
    queryClient,
    reason,
    router,
    sku,
    user,
    executeWmsCommand,
  ]);

  return (
    <div className={cn('flex min-h-svh flex-col', appMobilePageGroundClass)}>
      <MobileDetailTopBar
        title={title}
        subtitle={face}
        mono
        backHref={`/m/pair/${encodeURIComponent(code)}`}
      />

      <main className="flex-1 space-y-4 px-4 py-4">
        {/*
          The header already carries the product name, and when the catalog has
          no title that name IS the SKU — printing it again underneath is the
          same string twice for no information. The badge still needs somewhere
          to live, so the row survives when there is something to say.
        */}
        {(title !== sku || isProvisionalSku(sku)) && (
          <div className="flex items-center gap-2">
            {title !== sku && (
              <span className="min-w-0 truncate font-mono text-role-caption text-text-soft">
                {sku}
              </span>
            )}
            {isProvisionalSku(sku) && <OnHoldBadge />}
          </div>
        )}

        <div
          className={cn(
            'grid grid-cols-2 overflow-hidden border border-border-default bg-surface-card',
            cornerClass('control'),
          )}
        >
          <MotionButton
            variant="ghost"
            radius="flush"
            aria-pressed={mode === 'minus'}
            onClick={() => setMode('minus')}
            whileTap={{ scale: 0.96 }}
            className={cn(
              'h-auto w-full justify-center py-3 text-base',
              mode === 'minus' ? 'bg-rose-600 text-white' : 'bg-surface-card text-text-muted',
            )}
          >
            − TAKE
          </MotionButton>
          <MotionButton
            variant="ghost"
            radius="flush"
            aria-pressed={mode === 'plus'}
            onClick={() => setMode('plus')}
            whileTap={{ scale: 0.96 }}
            className={cn(
              'h-auto w-full justify-center py-3 text-base',
              mode === 'plus' ? 'bg-emerald-600 text-white' : 'bg-surface-card text-text-muted',
            )}
          >
            + PUT
          </MotionButton>
        </div>

        <Panel radius="lg" padding="none" className="grid grid-cols-3 items-center gap-2 px-4 py-4">
          <div className="text-center">
            <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">On hand</p>
            <p className="mt-1 font-mono text-role-title font-semibold tabular-nums">{onHand}</p>
          </div>
          <div className="text-center">
            <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Change</p>
            <p
              className={cn(
                'mt-1 font-mono text-role-title font-semibold tabular-nums',
                mode === 'minus' ? 'text-rose-600' : 'text-emerald-600',
              )}
            >
              {mode === 'minus' ? '−' : '+'}
              {numericDraft || 0}
            </p>
          </div>
          <div className="text-center">
            <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">After</p>
            <p className="mt-1 font-mono text-role-title font-semibold tabular-nums">{projected}</p>
          </div>
        </Panel>

        <ReasonCodePicker
          direction={mode === 'minus' ? 'out' : 'in'}
          value={reason?.id ?? null}
          onChange={setReason}
          compact
        />
        {reason?.requires_note && (
          <TextField
            value={noteDraft}
            onChange={setNoteDraft}
            label={`Why — ${reason.label}`}
            inputMode="text"
            autoComplete="off"
          />
        )}

        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <MotionButton
              key={String(key)}
              variant="ghost"
              radius="flush"
              ariaLabel={typeof key === 'string' ? key : `digit ${key}`}
              onClick={() => pressKey(key)}
              whileTap={{ scale: 0.96 }}
              className={cn(
                'h-14 w-full justify-center text-2xl',
                cornerClass('control'),
                key === 'clear' || key === 'back'
                  ? 'bg-surface-strong text-text-muted'
                  : 'border border-border-default bg-surface-card text-text-default',
              )}
            >
              {key === 'clear' ? <X className="h-5 w-5" /> : key === 'back' ? '⌫' : String(key)}
            </MotionButton>
          ))}
        </div>

        {error && <p className="text-center text-role-caption text-text-danger">{error}</p>}
      </main>

      <footer className="sticky bottom-0 border-t border-border-soft bg-surface-card px-4 py-3">
        <MotionButton
          variant={mode === 'minus' ? 'danger' : 'success'}
          size="lg"
          radius="flush"
          className="w-full"
          disabled={busy || numericDraft <= 0}
          icon={busy ? <Loader2 className="animate-spin" /> : <Check />}
          onClick={() => void confirm()}
          whileTap={busy || numericDraft <= 0 ? undefined : { scale: 0.96 }}
        >
          {mode === 'minus' ? `Take ${numericDraft || 0}` : `Add ${numericDraft || 0}`} · after{' '}
          {projected}
        </MotionButton>
      </footer>
    </div>
  );
}
