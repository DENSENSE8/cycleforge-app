'use client';

/**
 * Persistent right cart ledger — session root for `/kiosk/v2`.
 *
 * Always mounted (even empty). Staff face shows void + Save + Pay.
 * Customer face strips destructive actions (see KioskCustomerFace); the face
 * flips on tablet orientation (or Esc back), never a manual Customer button.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { KioskCustomerIntake } from '@/components/kiosk/KioskCustomerIntake';
import { KioskCartLineEditor } from '@/components/kiosk/KioskCartLineEditor';
import { CompoundRow } from '@/components/tables/compound/CompoundRow';
import { DataTable } from '@/components/tables/DataTable';
import { cartLineCompoundView } from '@/lib/kiosk/cart-compound-view';
import {
  CART_COMPOUND_COLUMNS,
  type CartGridColumn,
  type CartGridColumnKey,
} from '@/lib/kiosk/cart-grid-layout';
import { KIOSK_CART_TABLE_BINDING } from './kiosk-cart-table-definition';
import type { RowGroup } from '@/lib/group-rows';
import type { KioskCartLine } from '@/lib/kiosk/cart-line';
import { Loader2 } from '@/components/Icons';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  computeKioskCartTotals,
} from '@/lib/kiosk/cart-line';
import {
  useKioskSession,
  useKioskSessionActions,
  lineTypeLabel,
} from '@/lib/kiosk/kiosk-session-store';
import { mapKioskCartToCounterParts } from '@/lib/kiosk/cart-to-counter';
import { firstKioskBlocker } from '@/lib/kiosk/visit-triage';
import { buildKioskSalesIntakeBodyFromInput } from '@/lib/counter/kiosk-intake-payload';
import type { CounterTransactionResult } from '@/lib/counter/counter-transaction-types';
import {
  KioskPaymentStepUpSheet,
  type KioskPaymentStepUpResult,
} from '@/components/kiosk/KioskPaymentStepUpSheet';
import {
  KIOSK_UTILITY_PANEL_FACE,
  KIOSK_META,
  KIOSK_PANE_FOOTER_BAND,
  KIOSK_PANE_HEADER_BAND,
  KIOSK_PANE_HEADER_TITLE,
} from '@/app/kiosk/kiosk-chrome';

/**
 * The cart has no triage flags — a line is not a carton somebody paints. The
 * shared row takes the bag rather than a boolean so a family cannot half-answer
 * the question.
 */
const KIOSK_CART_CAPABILITIES = { rowTriageFlags: false } as const;

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export interface KioskCartFocus {
  lineId: string;
  field?: 'serial' | 'price' | 'imei' | 'quantity' | 'signature';
  /** Bumped by the sender so the SAME target re-opens after a manual close. */
  nonce: number;
}

export function KioskCartLedger({ focus }: { focus?: KioskCartFocus | null } = {}) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  const [submitting, setSubmitting] = useState(false);
  /**
   * Bulk selection over the cart lines.
   *
   * Local to the ledger rather than in the session store: a selection is a
   * VIEW state of the staff face, not a fact about the transaction, and
   * mirroring it into `counter_sessions.version` would bump the shared version
   * (and repaint the customer tablet) every time a cashier ticked a box.
   */
  const [selectedLineIds, setSelectedLineIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleLineSelected = useCallback((id: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CounterTransactionResult | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [editFocusField, setEditFocusField] =
    useState<KioskCartFocus['field']>(undefined);

  // Triage deep-link: open that line's editor on the field that is failing.
  useEffect(() => {
    if (!focus) return;
    setEditingLineId(focus.lineId);
    setEditFocusField(focus.field);
  }, [focus?.lineId, focus?.field, focus?.nonce, focus]);
  const idemKey = useRef<string | null>(null);

  const totals = useMemo(
    () => computeKioskCartTotals(session.lines),
    [session.lines],
  );

  // ONE gate model: the button and the Triage panel read the same blockers, so
  // they can never disagree about why this visit cannot submit.
  const blockReason = useMemo(
    () =>
      firstKioskBlocker({
        lines: session.lines,
        customerPhone: session.customerPhone,
        customerName: session.customerName,
        customerEmail: session.customerEmail,
      }),
    [
      session.lines,
      session.customerPhone,
      session.customerName,
      session.customerEmail,
    ],
  );

  const postIntake = useCallback(
    async (opts: { takePayment: boolean; staffId?: number; pin?: string }) => {
      if (!idemKey.current) idemKey.current = safeRandomUUID();
      const { retailLines, services } = mapKioskCartToCounterParts(session.lines);
      const res = await fetch('/api/kiosk/intake', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': idemKey.current,
        },
        body: JSON.stringify(
          buildKioskSalesIntakeBodyFromInput(
            {
              customer: {
                phone: session.customerPhone,
                name: session.customerName || null,
                email: session.customerEmail || null,
              },
              retailLines,
              services,
              // The order the Exchange pane got the SERVER to confirm against
              // this same phone — never the number typed into the field, which
              // proves nothing on its own. Null for every other visit, which is
              // what this used to be unconditionally: the tablet had an order
              // field whose value was dropped at submit.
              priorOrder: session.exchangeConfirmedRef
                ? {
                    orderNumber: session.exchangeConfirmedRef,
                    phone: session.customerPhone,
                  }
                : null,
              ticketWork: services.length > 0 ? { mode: 'create' } : { mode: 'none' },
            },
            opts,
          ),
        ),
      });

      const body = (await res.json().catch(() => ({}))) as {
        transaction?: CounterTransactionResult;
        error?: string;
      };

      if (res.status === 403 && body.error === 'STEPUP_FAILED') {
        throw new Error('PIN incorrect. Try again.');
      }
      if (res.status === 403 && body.error?.includes('STEPUP')) {
        throw new Error('A manager needs to authorize payment on this tablet.');
      }
      if (!res.ok || !body.transaction) {
        throw new Error(body.error?.trim() || 'Transaction failed');
      }
      idemKey.current = null;
      return body.transaction;
    },
    [session],
  );

  const submitSave = async () => {
    if (submitting || blockReason) return;
    setSubmitting(true);
    setError(null);
    try {
      const tx = await postIntake({ takePayment: false });
      setResult(tx);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete this transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  const onStepUpAuthorized = useCallback(
    async (creds: KioskPaymentStepUpResult) => {
      try {
        actions.setAwaitingCard(true);
        const tx = await postIntake({
          takePayment: true,
          staffId: creds.staffId,
          pin: creds.pin,
        });
        setStepUpOpen(false);
        setResult(tx);
        actions.setAwaitingCard(false);
        return { ok: true as const };
      } catch (err) {
        actions.setAwaitingCard(false);
        const message =
          err instanceof Error ? err.message : 'Could not complete this transaction.';
        if (message.includes('PIN incorrect')) {
          return { ok: false as const, error: message };
        }
        setStepUpOpen(false);
        setError(message);
        return { ok: false as const, error: message };
      }
    },
    [postIntake, actions],
  );

  const renderCartLine = useCallback(
    (line: (typeof session.lines)[number], visible: readonly CartGridColumn[]) => (
      <div key={line.id}>
        <CompoundRow
          data-cart-line-id={line.id}
          data-testid="kiosk-cart-line"
          role="button"
          tabIndex={0}
          aria-expanded={editingLineId === line.id}
          aria-label={`Cart line ${line.title}`}
          className="group/row cursor-pointer"
          onClick={() =>
            setEditingLineId((prev) => (prev === line.id ? null : line.id))
          }
          onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setEditingLineId((prev) => (prev === line.id ? null : line.id));
            }
          }}
          columns={visible}
          capabilities={KIOSK_CART_CAPABILITIES}
          selected={selectedLineIds.has(line.id)}
          view={cartLineCompoundView(line)}
          select={{
            checked: selectedLineIds.has(line.id),
            onToggle: () => toggleLineSelected(line.id),
            label: selectedLineIds.has(line.id)
              ? `Deselect ${line.title}`
              : `Select ${line.title}`,
          }}
          onOpen={() => setEditingLineId(line.id)}
          actions={
            session.sharedSessionId === null
              ? [
                  {
                    key: 'void',
                    label: `Void ${lineTypeLabel(line.type).toLowerCase()} line`,
                    tone: 'danger' as const,
                    onSelect: () => actions.removeLine(line.id),
                  },
                ]
              : undefined
          }
        />
        {editingLineId === line.id && (
          <KioskCartLineEditor
            line={line}
            focusField={editFocusField ?? undefined}
            onDone={() => setEditingLineId(null)}
          />
        )}
      </div>
    ),
    [
      actions,
      editFocusField,
      editingLineId,
      selectedLineIds,
      session.sharedSessionId,
      toggleLineSelected,
    ],
  );

  const orderGroupsByDate = useMemo<[string, RowGroup<KioskCartLine>[]][]>(
    () => [['', session.lines.map((line) => ({ key: line.id, rows: [line] }))]],
    [session.lines],
  );

  if (result) {
    return (
      <aside className={KIOSK_UTILITY_PANEL_FACE} data-testid="kiosk-cart-ledger">
        <div className={KIOSK_PANE_HEADER_BAND}>
          <h2 className={KIOSK_PANE_HEADER_TITLE}>Cart</h2>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-lg font-semibold tracking-tight">All set</p>
          <p className="text-sm font-semibold text-text-soft">
            {result.repairs.length === 1
              ? `Service ${result.repairs[0].rsNumber} checked in.`
              : result.repairs.length > 1
                ? // Name every device: "two of your things are here" is the fact
                  // the customer is standing there to confirm.
                  `${result.repairs.length} services checked in — ${result.repairs
                    .map((r) => r.rsNumber)
                    .join(', ')}.`
                : 'Sale staged at the register.'}
          </p>
        </div>
        <div className={KIOSK_PANE_FOOTER_BAND}>
          <Button
            size="lg"
            className={cn('h-full min-h-0 w-full flex-1 rounded-none', cornerClass('flush'))}
            onClick={() => {
              setResult(null);
              actions.resetSession();
            }}
          >
            Next customer
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <aside className={KIOSK_UTILITY_PANEL_FACE} data-testid="kiosk-cart-ledger">
      <div className={KIOSK_PANE_HEADER_BAND}>
        <h2 className={KIOSK_PANE_HEADER_TITLE}>Cart</h2>
        <span className={cn('tabular-nums', KIOSK_META)}>
          {session.lines.length} {session.lines.length === 1 ? 'line' : 'lines'}
        </span>
        {session.lines.length > 0 && (
          // Delete-all. Two-tap confirm — a stray touch on a counter tablet must
          // not wipe a ticket, and a modal over the work is not the house shape.
          <Button
            variant="ghost"
            size="sm"
            className={cn('shrink-0', confirmVoid && 'text-text-danger')}
            data-testid="kiosk-cart-void-all"
            onClick={() => {
              if (!confirmVoid) {
                setConfirmVoid(true);
                return;
              }
              actions.clearCart();
              setConfirmVoid(false);
              setEditingLineId(null);
            }}
            onBlur={() => setConfirmVoid(false)}
          >
            {confirmVoid ? 'Void ticket?' : 'Void'}
          </Button>
        )}
      </div>

      <KioskCustomerIntake
        fields={['phone', 'name']}
        heading={null}
        className="mx-auto w-full max-w-3xl shrink-0 border-b border-border-hairline"
      />

      <DataTable<KioskCartLine, CartGridColumnKey, CartGridColumn>
        binding={KIOSK_CART_TABLE_BINDING}
        hideToolbar
        columns={CART_COMPOUND_COLUMNS}
        rows={session.lines}
        orderGroupsByDate={orderGroupsByDate}
        getRowId={(line) => line.id}
        loading={false}
        emptyMessage="Scan a UPC or pick from the catalog."
        search={{ value: '', onChange: () => undefined }}
        sort={null}
        dir={null}
        onSortChange={() => undefined}
        renderGroup={(group, _stripe, { columns: visible }) =>
          renderCartLine(group.rows[0]!, visible)
        }
        renderRow={(line, _stripe, { columns: visible }) => renderCartLine(line, visible)}
        className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto"
      />

      <div className="mx-auto w-full max-w-3xl shrink-0 border-t border-border-soft px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className={KIOSK_META}>Total</span>
          <span className="text-xl font-semibold tracking-tight tabular-nums">
            {formatCents(totals.totalCents)}
          </span>
        </div>
        {(error || blockReason) && (
          <p className="mt-2 text-center text-sm font-semibold text-text-soft">
            {error ?? blockReason}
          </p>
        )}
      </div>

      <div className={cn(KIOSK_PANE_FOOTER_BAND, 'gap-0')} data-kiosk-footer-band>
        <Button
          variant="secondary"
          size="lg"
          className={cn(
            'h-full min-h-0 flex-1 rounded-none border-r border-border-soft',
            cornerClass('flush'),
          )}
          disabled={!!blockReason || submitting}
          onClick={() => void submitSave()}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
        <Button
          size="lg"
          className={cn('h-full min-h-0 flex-1 rounded-none', cornerClass('flush'))}
          disabled={!!blockReason || submitting}
          onClick={() => {
            if (blockReason) {
              toast(blockReason);
              return;
            }
            setStepUpOpen(true);
          }}
        >
          Pay
        </Button>
      </div>

      <KioskPaymentStepUpSheet
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onAuthorized={onStepUpAuthorized}
      />
    </aside>
  );
}
