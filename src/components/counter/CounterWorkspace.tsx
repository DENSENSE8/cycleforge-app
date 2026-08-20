'use client';

/**
 * @domain-job Drive one shared counter visit from the desk: claim a paired
 *   tablet, stage and correct its lines, take the customer's identity, park or
 *   finish — while the customer watches the same cart on the tablet.
 * @hardware-target Workbench
 * @density ops
 * @justification The named Workbench assemblies serve a COLLECTION (select a
 *   row → inspect → edit → persist): `WorkbenchSheetView` mounts a spreadsheet
 *   over `LedgerGridSurface`, and `RightRailHost` inspects the row you picked.
 *   This surface has no collection and no row to pick — it is one live document
 *   being co-edited by two devices, where the "rows" are 1–8 lines that exist
 *   only for the next few minutes and every edit is a versioned write against a
 *   session another screen is rendering. Mounting the sheet shell would give an
 *   ephemeral cart a saved-views menu, column visibility, and a KPI band, none
 *   of which mean anything for a visit; the grid engine's virtualization is
 *   overhead for eight rows. It composes the DS primitives directly
 *   (`Panel`/`Button`/`TextField`) and the counter session waist
 *   (`session-store` via `useCounterSession`), and forks nothing.
 *
 * The customer-facing twin of this cart is `KioskCartLedger` on `/kiosk/v2`.
 * The two are deliberately NOT one component today: that one reads
 * `kioskSessionStore` directly and carries the pay + step-up flow, while this
 * one is the operational face (voided lines visible, price editable). P4 makes
 * the store shared, which is the point at which the ledger row itself is worth
 * promoting into one primitive both faces mount.
 *
 * Plan: `docs/todo/kiosk-desk-session-channel-PLAN.md` (P5).
 */

import { useCallback, useMemo, useState } from 'react';
import { Button, Panel, TextField } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { computeKioskCartTotals } from '@/lib/kiosk/cart-line';
import { useCounterSession } from './useCounterSession';
import type { CounterSessionLine } from '@/lib/counter/session-events';

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

export function CounterWorkspace({ sessionId }: { sessionId: number | null }) {
  const session = useCounterSession(sessionId);
  const snapshot = session.snapshot;

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');

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

  if (sessionId === null) {
    return <EmptyCounter />;
  }

  if (session.loading && !snapshot) {
    return (
      <div className="flex h-full items-center justify-center text-role-body text-text-muted">
        Loading session…
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center text-role-body text-text-muted">
        {session.error ?? 'Session not found.'}
      </div>
    );
  }

  const parked = snapshot.status !== 'open';

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 overflow-auto bg-surface-canvas p-4">
      {/* Band 1 — who holds this counter, and which tablet is bound to it. */}
      <Panel padding="md" radius="none" className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col">
          <span className={SECTION_LABEL}>Session</span>
          <span className="text-role-value font-mono">#{snapshot.sessionId}</span>
        </div>
        <div className="flex flex-col">
          <span className={SECTION_LABEL}>Version</span>
          <span className="text-role-value font-mono">{snapshot.version}</span>
        </div>
        <div className="flex flex-col">
          <span className={SECTION_LABEL}>Status</span>
          <span className="text-role-value">{snapshot.status}</span>
        </div>
        <div className="flex flex-col">
          <span className={SECTION_LABEL}>Tablet</span>
          <span className="text-role-value font-mono">
            {snapshot.kioskDeviceId ?? '— none bound'}
          </span>
        </div>
        <div className="flex flex-col">
          <span className={SECTION_LABEL}>Held by</span>
          <span className="text-role-value">{snapshot.claimedByStaffName ?? '— unclaimed'}</span>
        </div>

        <div className="flex flex-col">
          <span className={SECTION_LABEL}>Sync</span>
          <span className="text-role-value">
            {snapshot.kioskDeviceId === null
              ? 'polling — no tablet bound'
              : session.live
                ? 'live'
                : 'connecting…'}
          </span>
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
                  onPrice={(cents) => void session.updateLine(line.id, { unitAmountCents: cents })}
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
      </div>
    </div>
  );
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

function EmptyCounter() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface-canvas text-center">
      <p className="text-role-body text-text-default">No session open.</p>
      <p className="text-role-caption text-text-muted">
        Open one with <span className="font-mono">?session=&lt;id&gt;</span>, or start a visit from
        the tablet once P4 lands.
      </p>
    </div>
  );
}
