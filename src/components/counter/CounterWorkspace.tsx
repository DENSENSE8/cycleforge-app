'use client';

/** @domain-job Drive one shared counter visit from the desk: */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Panel, TextField } from '@/design-system/primitives';
import { ConsultStanceControls } from '@/components/kiosk/ConsultStanceControls';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { computeKioskCartTotals } from '@/lib/kiosk/cart-line';
import { submitBlocker, submitBlockerCopy } from '@/lib/counter/submit-blocker';
import { useCounterSession, createCounterSession } from './useCounterSession';
import { CounterDeviceAction } from './CounterDeviceAction';
import type { CounterSessionLine, CounterSessionSnapshot } from '@/lib/counter/session-events';
import type { CounterTransactionResult } from '@/lib/counter/counter-transaction-types';

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** Dollars typed by a human → integer cents, tolerating `$`, spaces and commas. */
function parseDollars(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === '' || cleaned === '-') return null;
  return Math.round(Number(cleaned) * 100);
}

const SECTION_LABEL = 'text-role-eyebrow uppercase tracking-wide text-text-muted';

/**
 * Session status → what a staffer (and the customer beside them) should read.
 * The stored value is a DB enum; painting it raw put `submitted` on a desk in
 * front of a person waiting to be told their sale is done.
 */
function visitCopy(status: CounterSessionSnapshot['status']): string {
  switch (status) {
    case 'open':
      return 'In progress';
    case 'parked':
      return 'Parked';
    case 'submitted':
      return 'Finished';
    case 'voided':
      return 'Cancelled';
  }
}

export function CounterWorkspace({ sessionId }: { sessionId: number | null }) {
  const session = useCounterSession(sessionId);
  const snapshot = session.snapshot;

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');

  // The submit response is the ONLY place the counter transaction id and the RS numbers ever reach the client — the snapshot that follows…
  const [lastTransaction, setLastTransaction] = useState<CounterTransactionResult | null>(null);

  const finishVisit = useCallback(async () => {
    const result = await session.submit();
    if (result.json.transaction) setLastTransaction(result.json.transaction);
  }, [session]);

  const visible = useMemo(() => snapshot?.lines ?? [], [snapshot]);
  const totals = useMemo(
    // The customer's total counts only what is NOT voided — the desk still sees
    // the voided row, but nobody is charged for it.
    () => computeKioskCartTotals(visible.filter((l) => l.voidedAtMs === null)),
    [visible],
  );

  const addRetail = useCallback(() => {
    const cents = parseDollars(price);
    if (!title.trim() || cents === null) return;
    void session.addLine({
      lineUuid: safeRandomUUID(),
      type: 'RETAIL',
      title: title.trim(),
      quantity: 1,
      unitAmountCents: cents,
      payload: { variationId: null, sku: '' },
      sortIndex: visible.length,
    });
    setTitle('');
    setPrice('');
  }, [price, title, session, visible.length]);

  // The header CTA mounts in EVERY state, including "no visit yet": choosing a
  // tablet is how a visit STARTS on the customer's screen, so it must not be
  // reachable only from a session that already exists.
  const deviceAction = (
    <CounterDeviceAction
      sessionId={sessionId}
      boundDeviceId={snapshot?.kioskDeviceId ?? null}
      disabled={session.busy}
      onBind={sessionId === null ? undefined : session.bindDevice}
    />
  );

  if (sessionId === null) {
    return (
      <>
        {deviceAction}
        <EmptyCounter />
      </>
    );
  }

  if (session.loading && !snapshot) {
    return (
      <>
        {deviceAction}
        <div className="flex h-full items-center justify-center text-role-body text-text-muted">
          Opening the visit…
        </div>
      </>
    );
  }

  if (!snapshot) {
    return (
      <>
        {deviceAction}
        <div className="flex h-full items-center justify-center text-role-body text-text-muted">
          {session.error ?? 'That visit is no longer open.'}
        </div>
      </>
    );
  }

  const parked = snapshot.status !== 'open';

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 overflow-auto bg-surface-canvas p-4">
      {deviceAction}

      {/* Band 1 — who holds this counter, and whether the customer can see it. */}
      <Panel padding="md" radius="none" className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col">
          <span className={SECTION_LABEL}>Visit</span>
          <span className="text-role-value">{visitCopy(snapshot.status)}</span>
        </div>
        <div className="flex flex-col">
          <span className={SECTION_LABEL}>Consult</span>
          <ConsultStanceControls
            value={snapshot.consultStance}
            onChange={(stance) => void session.setConsultStance(stance)}
          />
        </div>
        <div className="flex flex-col">
          <span className={SECTION_LABEL}>Customer screen</span>
          <span className="text-role-value">
            {snapshot.kioskDeviceId === null
              ? 'Desk only — no tablet linked'
              : session.live
                ? 'Live on the tablet'
                : 'Linking to the tablet…'}
          </span>
        </div>
        <div className="flex flex-col">
          <span className={SECTION_LABEL}>Held by</span>
          <span className="text-role-value">{snapshot.claimedByStaffName ?? 'Unclaimed'}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void session.claim(false)}>
            Claim
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void session.claim(true)}>
            Take over
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void session.release()}>
            Release
          </Button>
        </div>
      </Panel>

      {session.error && (
        <Panel
          padding="sm"
          radius="none"
          className="border-amber-300 bg-amber-50 text-role-body text-amber-900"
        >
          {session.error}
        </Panel>
      )}

      <div className="flex min-h-0 flex-1 flex-wrap gap-3">
        {/* The ledger — the operational face: voided lines stay, struck through. */}
        <Panel padding="none" radius="none" className="flex min-w-[28rem] flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border-soft px-4 py-2">
            <span className={SECTION_LABEL}>Cart</span>
            <span className="text-role-value font-mono">{formatCents(totals.totalCents)}</span>
          </div>

          <div className="flex-1 overflow-auto">
            {visible.length === 0 ? (
              <p className="px-4 py-6 text-role-body text-text-muted">
                No lines yet. Add one below — the tablet shows it as you type it in.
              </p>
            ) : (
              visible.map((line) => (
                <LedgerRow
                  key={line.id}
                  line={line}
                  disabled={parked || session.busy}
                  onQuantity={(q) => void session.updateLine(line.id, { quantity: q })}
                  onPrice={(cents) => void session.setLinePrice(line.id, cents, 'desk discount')}
                  onVoid={() => void session.voidLine(line.id, 'desk void')}
                />
              ))
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t border-border-soft px-4 py-3">
            <div className="min-w-[12rem] flex-1">
              <TextField label="Item" value={title} onChange={setTitle} />
            </div>
            <div className="w-32">
              <TextField label="Price" value={price} onChange={setPrice} inputMode="decimal" />
            </div>
            <Button
              variant="success"
              onClick={addRetail}
              disabled={parked || session.busy || !title.trim() || parseDollars(price) === null}
            >
              Add line
            </Button>
          </div>
        </Panel>

        {/* Identity + visit state. Deterministic identity only — no search (D7). */}
        <Panel padding="md" radius="none" className="flex w-[22rem] flex-col gap-3">
          <span className={SECTION_LABEL}>Customer</span>
          <TextField label="Phone" value={phone} onChange={setPhone} inputMode="tel" />
          <TextField label="Name" value={name} onChange={setName} />
          <Button
            variant="secondary"
            disabled={parked || session.busy}
            onClick={() => void session.setCustomer({ phone, name, email: '' })}
          >
            Save customer
          </Button>
          <p className="text-role-caption text-text-muted">
            On file: {snapshot.customer.name || '—'} · {snapshot.customer.phone || '—'}
          </p>

          <div className="mt-auto flex flex-col gap-2">
            <span className={SECTION_LABEL}>Visit</span>
            {parked ? (
              <Button variant="primary" onClick={() => void session.setStatus('open')}>
                Resume visit
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => void session.setStatus('parked')}>
                Park visit
              </Button>
            )}
          </div>
        </Panel>

        {/* Finish + pay + paper. Its own band: it is the whole reason the desk
            exists, and it was previously nowhere on this surface — the four
            money verbs had routes, permissions and tests, and zero callers. */}
        <FinishPanel
          snapshot={snapshot}
          busy={session.busy}
          lastTransaction={lastTransaction}
          onSubmit={finishVisit}
          onCheckout={() => void session.checkout()}
        />
      </div>
    </div>
  );
}

/**
 * Submit → charge → print. Three steps, each gated on the last, because each
 * is a different kind of point of no return: submit writes the transaction,
 * checkout summons a card reader, print hands the customer paper.
 */
function FinishPanel({
  snapshot,
  busy,
  lastTransaction,
  onSubmit,
  onCheckout,
}: {
  snapshot: CounterSessionSnapshot;
  busy: boolean;
  lastTransaction: CounterTransactionResult | null;
  onSubmit: () => void;
  onCheckout: () => void;
}) {
  const blocker = useMemo(() => submitBlocker(snapshot), [snapshot]);
  const submitted = snapshot.status === 'submitted';
  const transactionId = snapshot.counterTransactionId ?? lastTransaction?.counterTransactionId ?? null;

  return (
    <Panel padding="md" radius="none" className="flex w-[22rem] flex-col gap-3">
      <span className={SECTION_LABEL}>Finish</span>

      {!submitted ? (
        <>
          <Button
            variant="primary"
            disabled={busy || blocker !== null}
            onClick={onSubmit}
          >
            Finish visit
          </Button>
          {blocker && (
            <p className="text-role-caption text-amber-700">{submitBlockerCopy(blocker)}</p>
          )}
        </>
      ) : (
        <>
          <p className="text-role-body text-text-default">
            Visit finished
            {transactionId !== null && (
              <span className="text-text-muted"> · #{transactionId}</span>
            )}
            .
          </p>

          <div className="flex flex-col gap-1">
            <span className={SECTION_LABEL}>Card</span>
            <span className="text-role-value">{paymentStateCopy(snapshot.paymentState)}</span>
          </div>

          <Button
            variant="primary"
            disabled={busy || snapshot.paymentState === 'awaiting_card'}
            onClick={onCheckout}
          >
            {snapshot.paymentState === 'awaiting_card' ? 'Waiting for card…' : 'Take payment'}
          </Button>

          {transactionId !== null && (
            <Button
              variant="secondary"
              onClick={() => window.open(`/api/counter/visit/${transactionId}/receipt?print=1`, '_blank', 'noreferrer')}
            >
              Print receipt
            </Button>
          )}

          {lastTransaction && lastTransaction.repairs.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className={SECTION_LABEL}>Repair tickets</span>
              {lastTransaction.repairs.map((repair) => (
                <Button
                  key={repair.id}
                  variant="secondary"
                  onClick={() => window.open(`/api/repair-service/print/${repair.id}`, '_blank', 'noreferrer')}
                >
                  Print {repair.rsNumber}
                </Button>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

/** Card-present state → what an operator standing at the counter needs to read. */
function paymentStateCopy(state: CounterSessionSnapshot['paymentState']): string {
  switch (state) {
    case 'idle':
      return 'Not started';
    case 'awaiting_card':
      return 'Waiting for the customer to present a card';
    case 'approved':
      return 'Approved — reader confirmed';
    case 'declined':
      return 'Declined — try another card';
    case 'canceled':
      return 'Canceled at the reader';
  }
}

function LedgerRow({
  line,
  disabled,
  onQuantity,
  onPrice,
  onVoid,
}: {
  line: CounterSessionLine;
  disabled: boolean;
  onQuantity: (quantity: number) => void;
  onPrice: (cents: number) => void;
  onVoid: () => void;
}) {
  const voided = line.voidedAtMs !== null;

  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-border-soft px-4 py-2',
        voided && 'opacity-60',
      )}
    >
      <span className={cn('flex-1 text-role-body', voided && 'line-through')}>{line.title}</span>
      <span className="text-role-caption uppercase text-text-muted">{line.type}</span>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || voided || line.quantity <= 1}
          onClick={() => onQuantity(line.quantity - 1)}
          ariaLabel="Decrease quantity"
        >
          −
        </Button>
        <span className={cn('w-8 text-center font-mono text-role-value', cornerClass('flush'))}>
          {line.quantity}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || voided}
          onClick={() => onQuantity(line.quantity + 1)}
          ariaLabel="Increase quantity"
        >
          +
        </Button>
      </div>

      <span className="w-24 text-right font-mono text-role-value">
        {formatCents(line.unitAmountCents * line.quantity)}
      </span>

      <Button
        size="sm"
        variant="ghost"
        disabled={disabled || voided}
        onClick={() => onPrice(Math.max(0, line.unitAmountCents - 500))}
        ariaLabel="Reduce price by five dollars"
      >
        −$5
      </Button>
      <Button size="sm" variant="danger" disabled={disabled || voided} onClick={onVoid}>
        {voided ? 'Voided' : 'Void'}
      </Button>
    </div>
  );
}

/** The cold `/counter` face: */
function EmptyCounter() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    const result = await createCounterSession();
    setStarting(false);
    if ('sessionId' in result) {
      router.push(`/counter?session=${result.sessionId}`);
    } else {
      setError(result.error);
    }
  }, [router]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-canvas text-center">
      <p className="text-role-body text-text-default">No visit open.</p>
      <p className="text-role-caption text-text-muted">
        Start one here, or use Kiosk to open it on the customer’s tablet.
      </p>
      <Button variant="primary" disabled={starting} onClick={() => void start()}>
        {starting ? 'Starting…' : 'Start visit'}
      </Button>
      {error && <p className="text-role-caption text-text-warning">{error}</p>}
    </div>
  );
}
