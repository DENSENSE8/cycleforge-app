'use client';

/**
 * `/orders/new` — the DESK face of a new sales order (the phone face is
 * `/m/orders/new`; both paint `useSalesOrderCheckout`). One step on screen at a
 * time under a breadcrumb trail (Customer › Products › Team › Order › Shipping
 * › Payment), Back and Continue under it, the cart and total pinned on the right.
 *
 * Built for throughput while the caller is on the line:
 *   - the cursor starts in "Find a customer"; picking one moves to Products;
 *   - Products is the counter's grid (Favorites, category breadcrumbs); typing
 *     swaps it for exact-identity hits, Enter adds the highlighted one and
 *     keeps the cursor;
 *   - the order can arrive typed, from a Square invoice, or from an Ecwid order
 *     (⌥/Alt+I cycles); an import fills every line and lands on Team;
 *   - ⌥/Alt+N continues, ⌥/Alt+B goes back, from any field;
 *   - ⌘/Ctrl+Enter releases, ⌘/Ctrl+S saves a draft, from any field;
 *   - the call timer shows how long this order has taken.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, ChevronLeft, Clock, Plus, Zap } from '@/components/Icons';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives/Button';
import { Switch } from '@/design-system/primitives/Switch';
import { TextField } from '@/design-system/primitives/TextField';
import { elapsedLabel, useSalesOrderCheckout } from '@/hooks/orders/useSalesOrderCheckout';
import { CHECKOUT_MODES, CHECKOUT_STEPS, crumbFromKey, type CheckoutStepId } from '@/lib/orders/intake/checkout-model';
import { addressLine } from '@/lib/orders/intake/intake-model';
import { formatCents } from '@/lib/orders/manual-order-draft';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { IntakeCustomerFields } from '@/components/outbound/orders/intake/IntakeCustomerFields';
import { IntakePaymentFields } from '@/components/outbound/orders/intake/IntakePaymentFields';
import { IntakeShippingFields } from '@/components/outbound/orders/intake/IntakeShippingFields';
import { CheckoutAssignments } from './CheckoutAssignments';
import { CheckoutCart } from './CheckoutCart';
import { CheckoutStepTrail } from '@/design-system/components/triage-shelf/CheckoutStepTrail';
import { CheckoutEcwidImport } from './CheckoutEcwidImport';
import { CheckoutInvoicePayment } from './CheckoutInvoicePayment';
import { CheckoutProductSearch } from './CheckoutProductSearch';
import { CheckoutSquareImport } from './CheckoutSquareImport';
import { chordKeys, useApplePlatform } from '@/lib/keyboard/chord-keys';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { ACTION_DOCK_LIFT, ACTION_DOCK_TOP_GAP, FLOATING_ACTION_DISABLED_FACE } from '@/design-system/tokens/dock-clearance';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';

/** Remounts the checkout for the next call once an order is released. */
export function NewSalesOrderCheckout() {
  const [session, setSession] = useState(0);
  return <Checkout key={session} first={session === 0} onNext={() => setSession((n) => n + 1)} />;
}

function Checkout({ first, onNext }: { first: boolean; onNext: () => void }) {
  const searchParams = useSearchParams();
  const c = useSalesOrderCheckout({ first, params: searchParams });
  const {
    state, patch, mode, setMode, choosingImport, invoice, ecwidOrder, importInvoice, importEcwidOrder, testMode, setTestMode,
    step, setStep, goStep, nextStep, prevStep, stepDone, channelOptions, addProduct, addListing, setLine, removeLine, itemCount,
    totals, releaseBlockers, draftBlockers, team, triage, createdIds, bound, busy, labelFile, setLabelFile, submit,
    released, startedAt, elapsed, finishedMs,
  } = c;
  const productRef = useRef<HTMLInputElement>(null);

  /* ── Step change → the step's first field ── */
  const stepsRef = useRef<HTMLDivElement>(null);
  const firstStep = useRef(true);
  useEffect(() => {
    // The first paint keeps Customer's own autofocus (or the import list's).
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    requestAnimationFrame(() => {
      if (step === 'products') {
        productRef.current?.focus();
        return;
      }
      const host = stepsRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
      const target =
        host?.querySelector<HTMLElement>('[data-testid="checkout-assign-picker"]') ??
        host?.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="file"]), [role="radio"][tabindex="0"], button[role="combobox"], button:not([disabled])');
      target?.focus();
    });
  }, [step]);

  // Desk chords — from inside any field, in the capture phase so an open
  // combobox or popover never swallows them. ⌥/Alt+I cycles how the order
  // arrives, ⌥/Alt+N · ⌥/Alt+B walk the trail (`code`: ⌥ letters type dead
  // keys on macOS), ⌘/Ctrl+Enter releases, ⌘/Ctrl+S saves a draft. The
  // crumbs are this page's views, so they take the views' keys: bare 1–6
  // outside a text field, ⌥/Alt+Shift+1–6 from inside one (never Alt/Ctrl+
  // digit alone — Chrome's tab keys, the chat's recents).
  const live = useRef(c);
  live.current = c;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const k = live.current;
      if (event.altKey && !event.metaKey && !event.ctrlKey && event.code === 'KeyI') {
        event.preventDefault();
        k.cycleMode();
        return;
      }
      // ⌥/Alt+R flips the Products shelf (Sales ↔ Repair service) — on that step only.
      if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.code === 'KeyR') {
        if (k.step !== 'products' || k.choosingImport) return;
        event.preventDefault();
        event.stopPropagation();
        k.toggleShelf();
        return;
      }
      if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && (event.code === 'KeyN' || event.code === 'KeyB')) {
        event.preventDefault();
        event.stopPropagation();
        if (!k.choosingImport) k.goStep(event.code === 'KeyN' ? 1 : -1);
        return;
      }
      const crumb = crumbFromKey(event);
      if (crumb) {
        if (k.choosingImport) return;
        if (!crumb.anywhere && (isEditableKeyTarget(event.target) || hasOpenOverlay())) return;
        event.preventDefault();
        event.stopPropagation();
        k.setStep(crumb.step);
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.repeat) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        void k.submit('release');
      } else if (event.key.toLowerCase() === 's' && !event.shiftKey) {
        event.preventDefault();
        void k.submit('draft');
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const apple = useApplePlatform();
  useEffect(
    () =>
      registerShortcutOverviewGroup({
        id: 'new-sales-order',
        title: 'New sales order',
        rows: [
          { keys: ['1', '–', String(CHECKOUT_STEPS.length)], label: 'Jump to a step (outside a field)' },
          { keys: [...chordKeys('alt+shift', apple), '1', '–', String(CHECKOUT_STEPS.length)], label: 'Jump to a step (from a field)' },
          { keys: chordKeys('alt+b', apple), label: 'Back a step' },
          { keys: chordKeys('alt+n', apple), label: 'Continue' },
          { keys: chordKeys('alt+i', apple), label: 'New · Square invoice · Ecwid order' },
          { keys: chordKeys('alt+r', apple), label: 'Products: Sales ↔ Repair service' },
          { keys: chordKeys('mod+s', apple), label: 'Save draft' },
          { keys: chordKeys('mod+↵', apple), label: 'Release to ship' },
        ],
      }),
    [apple],
  );

  if (released) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center" data-testid="checkout-done">
        <span className="flex size-12 items-center justify-center rounded-mode-pill bg-surface-success text-text-success">
          <Check className="size-6" />
        </span>
        <h1 className="text-role-title font-semibold text-text-default">
          Order <span className="font-mono">{state.orderNumber}</span> is in To ship
        </h1>
        <p className="text-role-body text-text-muted">
          {itemCount} item{itemCount === 1 ? '' : 's'}, {formatCents(totals.totalCents, state.currency)} · taken in {elapsedLabel(finishedMs ?? 0)}
        </p>
        <Button variant="ink" icon={<Plus className="size-4" />} onClick={onNext} autoFocus data-testid="checkout-next">
          Next order
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto" data-testid="new-sales-order">
      <div className="mx-auto grid w-[76rem] max-w-full gap-4 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <header className="flex flex-wrap items-center gap-3 lg:col-span-2">
          <h1 className="text-role-title font-semibold text-text-default">
            {bound ? (
              <>Draft <span className="font-mono">{state.orderNumber}</span></>
            ) : (
              'New sales order'
            )}
          </h1>
          {!bound ? (
            <HoverTooltip label="Switch New · Square invoice · Ecwid order" shortcut="Alt + I" asChild>
              <div role="tablist" aria-label="How the order arrives" className="inline-flex items-center gap-0.5 rounded-mode-control bg-surface-sunken p-0.5">
                {CHECKOUT_MODES.map((m, index) => (
                  <button
                    key={m.value}
                    type="button"
                    role="tab"
                    aria-selected={mode === m.value}
                    tabIndex={mode === m.value ? 0 : -1}
                    onClick={() => setMode(m.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        e.preventDefault();
                        const next = CHECKOUT_MODES[(index + (e.key === 'ArrowRight' ? 1 : CHECKOUT_MODES.length - 1)) % CHECKOUT_MODES.length]!;
                        setMode(next.value);
                        (e.currentTarget.parentElement?.querySelector(`[data-testid="checkout-mode-${next.value}"]`) as HTMLElement | null)?.focus();
                      }
                    }}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-mode-control px-3 text-role-caption font-medium transition-colors',
                      mode === m.value ? 'bg-surface-card text-text-default shadow-elev-soft' : 'text-text-muted hover:text-text-default',
                      focusRing('control'),
                    )}
                    data-testid={`checkout-mode-${m.value}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </HoverTooltip>
          ) : null}
          {startedAt != null ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-mode-pill bg-surface-info px-2.5 py-1 text-role-caption tabular-nums text-text-info"
              title="Time on this order"
              data-testid="checkout-timer"
            >
              <Clock className="size-3.5" aria-hidden />
              On this order {elapsedLabel(elapsed)}
            </span>
          ) : null}
          {!bound ? (
            <label className="inline-flex cursor-pointer items-center gap-2 text-role-caption font-medium text-text-muted">
              <Switch
                checked={testMode}
                onCheckedChange={setTestMode}
                checkedClassName="data-[state=checked]:bg-text-warning"
                data-testid="checkout-test-mode"
              />
              Test mode
            </label>
          ) : null}
          {!bound && testMode ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Zap />}
              loading={c.filling}
              onClick={() => void c.fillTestOrder()}
              data-testid="checkout-test-fill"
            >
              Fill test order
            </Button>
          ) : null}
          {bound && testMode ? (
            <span className="rounded-mode-pill bg-surface-warning px-2.5 py-1 text-role-caption font-medium text-text-warning">Test order</span>
          ) : null}
        </header>

        <div className="min-w-0 space-y-3">
          {testMode ? (
            <p className="rounded-mode-control bg-surface-warning px-3 py-2 text-role-caption text-text-warning" data-testid="checkout-test-banner">
              Test mode — the order saves as <span className="font-mono">CF-TEST-…</span> with no paperwork required, an invoice or Ecwid order
              already in CycleForge imports again, no Square invoice is linked and no payment is requested. Released, it lands on To ship live.
            </p>
          ) : null}
          {choosingImport ? (
            <section className="rounded-mode border border-border-hairline bg-surface-card p-4" aria-label={mode === 'square' ? 'Import a Square invoice' : 'Import an Ecwid order'}>
              {mode === 'square' ? (
                <CheckoutSquareImport onImport={(inv) => void importInvoice(inv)} allowImported={testMode} />
              ) : (
                <CheckoutEcwidImport onImport={importEcwidOrder} allowImported={testMode} />
              )}
            </section>
          ) : null}
          {invoice ? (
            <p className="rounded-mode-control bg-surface-sunken px-3 py-2 text-role-caption text-text-muted" data-testid="checkout-imported">
              From Square invoice <span className="font-mono text-text-default">#{invoice.invoiceNumber}</span> · {invoice.status.replace(/_/g, ' ').toLowerCase()} · {formatCents(invoice.totalCents, invoice.currency)} — set the team, then release.
            </p>
          ) : ecwidOrder ? (
            <p className="rounded-mode-control bg-surface-sunken px-3 py-2 text-role-caption text-text-muted" data-testid="checkout-imported">
              From Ecwid order <span className="font-mono text-text-default">#{ecwidOrder.orderNumber}</span>
              {ecwidOrder.totalCents != null ? ` · ${formatCents(ecwidOrder.totalCents, ecwidOrder.currency || state.currency)}` : ''} — set the team, then release.
            </p>
          ) : null}
          <div ref={stepsRef} className={cn('space-y-3', choosingImport && 'hidden')}>
          <HoverTooltip label="Jump to a step" shortcut={`1–${CHECKOUT_STEPS.length} or Alt + Shift + 1–${CHECKOUT_STEPS.length}`} focusable={false} className="block">
            <CheckoutStepTrail current={step} done={stepDone} onGo={setStep} testIdPrefix="checkout-crumb-" className="-mx-1" />
          </HoverTooltip>

          <Step id="customer" current={step} summary={bound ? [state.customer.name, addressLine(state.customer.shipTo)].filter(Boolean).join(' · ') : null}>
            <IntakeCustomerFields customer={state.customer} onChange={(customer) => patch({ customer })} autoFocus />
            {state.shippingMode === 'pickup' ? (
              <p className="text-role-caption text-text-muted">Pickup / walk-in — the address is optional.</p>
            ) : null}
          </Step>

          <Step id="products" current={step} summary={bound ? `${itemCount} item${itemCount === 1 ? '' : 's'}` : null}>
            <CheckoutProductSearch
              ref={productRef}
              currency={state.currency}
              lines={state.lines}
              shelf={c.shelf}
              onShelf={c.setShelf}
              onAdd={addProduct}
              onAddListing={addListing}
            />
          </Step>

          <Step id="team" current={step}>
            <CheckoutAssignments lines={state.lines} byKey={team.byKey} onSet={team.setLane} />
          </Step>

          <Step id="order" current={step} summary={bound ? `${state.channel} · ${state.orderNumber}` : null}>
            <div className="grid gap-3 sm:grid-cols-2">
              <SearchableSelectField
                value={channelOptions.find((o) => o.value.toLowerCase() === state.channel.toLowerCase())?.value ?? null}
                onChange={(value) => value != null && patch({ channel: String(value) })}
                options={channelOptions}
                label="Platform"
                placeholder="Pick the platform"
                ariaLabel="Platform"
                testId="checkout-channel"
                className="h-11 rounded-mode-control px-3.5 pb-1 pt-5 text-sm"
              />
              <TextField
                label="Order number"
                value={state.orderNumber}
                onChange={(v) => patch({ orderNumber: v, orderNumberGenerated: false })}
                mono
                autoComplete="off"
                data-testid="checkout-order-number"
              />
              {/* No "Ship by" title: the face is the date (the ledger's recipe); it opens on today, click to move it. */}
              <DateRangePickerField
                variant="compact"
                value={state.shipBy ? dateKeyToLocalDate(state.shipBy) : undefined}
                onChange={(day) => patch({ shipBy: localDateToDateKey(day) })}
                ariaLabel="Ship by"
                className="h-11 w-full rounded-mode-control border border-border-soft px-3.5 text-sm"
              />
              <TextField label="Note from the caller" value={state.buyerNote} onChange={(v) => patch({ buyerNote: v })} />
            </div>
          </Step>

          <Step id="shipping" current={step}>
            <IntakeShippingFields
              state={state}
              onChange={patch}
              labelFile={labelFile}
              onLabelFile={setLabelFile}
              bound={createdIds ? { orderId: createdIds[0]!, orderRef: state.orderNumber, onLabelChanged: triage.refresh } : null}
              onEnsureSaved={() => submit('draft')}
            />
          </Step>

          <Step id="payment" current={step}>
            {invoice ? (
              // The customer pays (or paid) the Square invoice itself — a second
              // request here would double-charge. It links to the order on save.
              <CheckoutInvoicePayment invoice={invoice} />
            ) : testMode ? (
              <p className="text-role-caption text-text-muted" data-testid="checkout-test-payment">
                Test mode — no payment link, invoice or in-person payment is recorded for a test order.
              </p>
            ) : (
              <IntakePaymentFields
                totals={totals}
                currency={state.currency}
                orderNumber={bound ? state.orderNumber : null}
                onEnsureSaved={() => submit('draft')}
                shippingMode={state.shippingMode}
              />
            )}
          </Step>

          {/* Back · where the order stands · Continue — floating sticky buttons, no bar
              behind them (owner 2026-10-03): only the buttons and the total chip take presses. */}
          <div
            className={cn('pointer-events-none sticky bottom-0 z-10 flex items-center gap-2', ACTION_DOCK_TOP_GAP, ACTION_DOCK_LIFT)}
            data-testid="checkout-step-nav"
          >
            {prevStep ? (
              <HoverTooltip label="Back a step" shortcut="Alt + B" asChild>
                <Button variant="secondary" className="pointer-events-auto shadow-elev-soft" icon={<ChevronLeft className="size-4" />} onClick={() => goStep(-1)} data-testid="checkout-back">
                  <span className="hidden sm:inline">{prevStep.title}</span>
                  <span className="sm:hidden">Back</span>
                </Button>
              </HoverTooltip>
            ) : null}
            <span className="flex min-w-0 flex-1 justify-center">
              <span className="pointer-events-auto flex min-w-0 items-baseline gap-2 truncate rounded-mode-pill bg-surface-card px-3 py-1 text-role-caption tabular-nums text-text-muted shadow-elev-soft">
                <span>{itemCount} item{itemCount === 1 ? '' : 's'}</span>
                <span className="text-text-success">{formatCents(totals.totalCents, state.currency)}</span>
              </span>
            </span>
            {nextStep ? (
              <HoverTooltip label="Continue" shortcut="Alt + N" asChild>
                <Button variant="ink" className="pointer-events-auto shadow-elev-soft" onClick={() => goStep(1)} data-testid="checkout-continue">
                  Continue
                  <span className="hidden sm:inline">to {nextStep.title}</span>
                </Button>
              </HoverTooltip>
            ) : (
              <HoverTooltip label="Release to ship" shortcut="Mod + ↵" asChild>
                <Button
                  variant="ink"
                  className={cn('pointer-events-auto shadow-elev-soft', FLOATING_ACTION_DISABLED_FACE)}
                  disabled={busy || (!bound && releaseBlockers.length > 0)}
                  loading={busy}
                  onClick={() => void submit('release')}
                  data-testid="checkout-continue-release"
                >
                  Release to ship
                </Button>
              </HoverTooltip>
            )}
          </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start" aria-label="Order summary">
          <section className="rounded-mode border border-border-hairline bg-surface-card p-4" data-testid="checkout-summary">
            <div className="flex items-baseline justify-between">
              <h2 className="text-role-body font-semibold text-text-default">Cart</h2>
              <span className="text-role-caption text-text-muted">{itemCount} item{itemCount === 1 ? '' : 's'}</span>
            </div>
            <CheckoutCart lines={state.lines} currency={state.currency} onChange={setLine} onRemove={removeLine} locked={bound} />
            <dl className="space-y-1 border-t border-border-hairline pt-3 text-role-caption">
              <div className="flex justify-between text-text-muted"><dt>Subtotal</dt><dd className="tabular-nums text-text-success">{formatCents(totals.subtotalCents, state.currency)}</dd></div>
              <div className="flex justify-between text-role-body font-semibold text-text-default">
                <dt>Total</dt>
                <dd className="tabular-nums text-text-success" data-testid="checkout-total">{formatCents(totals.totalCents, state.currency)}</dd>
              </div>
            </dl>
            {!bound && releaseBlockers.length > 0 ? (
              <ul className="mt-3 space-y-1" data-testid="checkout-blockers">
                {releaseBlockers.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-role-caption text-text-muted">
                    <span className="size-1.5 shrink-0 rounded-mode-pill bg-text-warning" aria-hidden />
                    {b}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4 flex gap-2">
              {!bound ? (
                <HoverTooltip label="Save draft" shortcut="Mod + S" asChild>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    disabled={busy || draftBlockers.length > 0}
                    loading={triage.saving}
                    onClick={() => void submit('draft')}
                    data-testid="checkout-save-draft"
                  >
                    Save draft
                  </Button>
                </HoverTooltip>
              ) : null}
              <HoverTooltip label="Release to ship" shortcut="Mod + ↵" asChild>
                <Button
                  variant="ink"
                  className="flex-1"
                  disabled={busy || (!bound && releaseBlockers.length > 0)}
                  loading={busy}
                  onClick={() => void submit('release')}
                  data-testid="checkout-release"
                >
                  Release to ship
                </Button>
              </HoverTooltip>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Step({
  id,
  current,
  summary = null,
  children,
}: {
  id: CheckoutStepId;
  current: CheckoutStepId;
  /** Once saved, a finished step reads as one line instead of its fields. */
  summary?: string | null;
  children: ReactNode;
}) {
  const index = CHECKOUT_STEPS.findIndex((s) => s.id === id);
  const title = CHECKOUT_STEPS[index]!.title;
  // Every step stays mounted — its half-typed search, scroll and crumb survive Back.
  return (
    <section
      className={cn('rounded-mode border border-border-hairline bg-surface-card', id !== current && 'hidden')}
      aria-labelledby={`checkout-step-${id}`}
      data-step={id}
      data-testid={`checkout-step-${id}`}
    >
      <header className="flex items-baseline gap-2.5 px-4 pb-1 pt-3">
        <h2 id={`checkout-step-${id}`} className="text-role-body font-semibold text-text-default">{title}</h2>
        <span className="text-role-caption text-text-faint">Step {index + 1} of {CHECKOUT_STEPS.length}</span>
        {summary != null ? <span className="min-w-0 flex-1 truncate text-role-caption text-text-muted">{summary}</span> : null}
      </header>
      {summary != null ? <div className="pb-2" /> : <div className="space-y-3 px-4 pb-4 pt-2">{children}</div>}
    </section>
  );
}
