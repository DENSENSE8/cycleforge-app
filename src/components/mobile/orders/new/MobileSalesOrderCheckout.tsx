'use client';

/**
 * `/m/orders/new` — the PHONE face of a new sales order: taking an order on
 * the business line with a personal phone in hand, or ringing up a walk-in at
 * the counter. Same step machine as the desk (`useSalesOrderCheckout`), laid
 * out for a thumb:
 *   - how it arrives (typed · Square invoice · Ecwid order) as a segmented switch;
 *   - the trail as path chips — each a jump back (or ahead) to its step;
 *   - ONE step body on screen;
 *   - ONE sticky dock: Back · Continue, and on Payment: Back · Save · Release;
 *   - the cart behind the top bar's one page action (the count), in a sheet.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, Clock, Plus, ScanBarcode, ShoppingCart, Zap } from '@/components/Icons';
import { MobileActionSlotRegistrar, MobileTopBarAction } from '@/components/mobile/redesign/MobileActionSlot';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button } from '@/design-system/primitives/Button';
import { Switch } from '@/design-system/primitives/Switch';
import { cornerClass } from '@/design-system/tokens/radius';
import { CheckoutStepTrail } from '@/design-system/components/triage-shelf/CheckoutStepTrail';
import { elapsedLabel, useSalesOrderCheckout } from '@/hooks/orders/useSalesOrderCheckout';
import { CHECKOUT_MODES, CHECKOUT_STEPS, type CheckoutMode } from '@/lib/orders/intake/checkout-model';
import { formatCents } from '@/lib/orders/manual-order-draft';
import { cn } from '@/utils/_cn';
import { MobileCartSheet } from './MobileCartSheet';
import { MobileCustomerStep } from './MobileCustomerStep';
import { MobileEcwidImportList, MobileSquareImportList } from './MobileImportList';
import { MobileOrderStep } from './MobileOrderStep';
import { MobilePaymentStep } from './MobilePaymentStep';
import { MobileProductsStep } from './MobileProductsStep';
import { MobileShippingStep } from './MobileShippingStep';
import { MobileTeamStep } from './MobileTeamStep';

const PATH = '/m/orders/new';

/** Remounts the checkout for the next customer once an order is released. */
export function MobileSalesOrderCheckout() {
  const [session, setSession] = useState(0);
  return <Checkout key={session} first={session === 0} onNext={() => setSession((n) => n + 1)} />;
}

type DockId = 'back' | 'continue' | 'draft' | 'release';

function Checkout({ first, onNext }: { first: boolean; onNext: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const c = useSalesOrderCheckout({ first, params });
  const { state, patch, step, bound } = c;
  const [cartOpen, setCartOpen] = useState(false);

  // `?scan=` (the scan kernel's return) and `?mode=` seed the first session only — drop them from the URL.
  useEffect(() => {
    if (first && (params.get('scan') || params.get('mode'))) router.replace(PATH);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  // Each step opens at its top.
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [step]);

  if (c.released) {
    const orderId = c.createdIds?.[0];
    return (
      <div className="flex flex-col items-center gap-4 px-mode-page py-16 text-center" data-testid="m-order-done">
        <span className={cn('flex size-12 items-center justify-center bg-surface-success text-text-success', cornerClass('pill'))}>
          <Check className="size-6" />
        </span>
        <h1 className="text-role-title font-semibold text-text-default">
          Order <span className="font-mono">{state.orderNumber}</span> is in To ship
        </h1>
        <p className="text-role-body text-text-muted">
          {c.itemCount} item{c.itemCount === 1 ? '' : 's'}, {formatCents(c.totals.totalCents, state.currency)} · taken in {elapsedLabel(c.finishedMs ?? 0)}
        </p>
        <div className="flex w-full flex-col gap-2">
          <Button variant="primary" size="lg" icon={<Plus className="size-4" />} onClick={onNext} data-testid="m-order-next">
            Next order
          </Button>
          {orderId ? (
            <Button variant="secondary" size="lg" onClick={() => router.push(`/m/orders/${orderId}`)}>
              Open the order
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const last = c.nextStep == null;
  const verbs: DetailDockVerb<DockId>[] = c.choosingImport
    ? []
    : [
        ...(c.prevStep ? [{ id: 'back' as const, label: 'Back', icon: <ChevronLeft /> }] : []),
        ...(last
          ? [
              ...(!bound ? [{ id: 'draft' as const, label: 'Save draft', icon: <Check />, disabled: c.busy || c.draftBlockers.length > 0, loading: c.triage.saving }] : []),
              {
                id: 'release' as const,
                label: 'Release',
                icon: <ChevronRight />,
                primary: true,
                disabled: c.busy || (!bound && c.releaseBlockers.length > 0),
                loading: c.triage.releasing,
              },
            ]
          : [{ id: 'continue' as const, label: c.nextStep ? `Continue · ${c.nextStep.title}` : 'Continue', icon: <ChevronRight />, primary: true }]),
      ];
  const onVerb = (id: DockId) => {
    if (id === 'back') c.goStep(-1);
    else if (id === 'continue') c.goStep(1);
    else return c.submit(id);
  };

  return (
    <div className="flex min-h-full flex-col" data-testid="m-new-sales-order">
      <MobileActionSlotRegistrar>
        <MobileTopBarAction
          icon={<ShoppingCart className="size-4" />}
          onClick={() => setCartOpen(true)}
          ariaLabel={`Cart, ${c.itemCount} item${c.itemCount === 1 ? '' : 's'}`}
          data-testid="m-order-cart-open"
        >
          {c.itemCount > 0 ? String(c.itemCount) : 'Cart'}
        </MobileTopBarAction>
      </MobileActionSlotRegistrar>

      <div ref={topRef} className="divide-y divide-mode-rule">
        {!bound ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-mode-page py-3">
            <div className="min-w-0 basis-full">
              <TabSwitch
                tabs={CHECKOUT_MODES.map((m) => ({ id: m.value, label: m.label }))}
                activeTab={c.mode}
                onTabChange={(id) => c.setMode(id as CheckoutMode)}
                size="sm"
              />
            </div>
            <label className="ml-auto inline-flex shrink-0 items-center gap-2 text-role-caption font-medium text-text-muted">
              <Switch checked={c.testMode} onCheckedChange={c.setTestMode} checkedClassName="data-[state=checked]:bg-text-warning" data-testid="m-order-test-mode" />
              Test
            </label>
            {c.testMode ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<Zap />}
                loading={c.filling}
                onClick={() => void c.fillTestOrder()}
                ariaLabel="Fill test order"
                data-testid="m-order-test-fill"
              >
                Fill
              </Button>
            ) : null}
          </div>
        ) : null}

        {c.testMode ? (
          <p className="bg-surface-warning px-mode-page py-2 text-role-caption text-text-warning" data-testid="m-order-test-banner">
            Test mode — saves as <span className="font-mono">CF-TEST-…</span>, no paperwork; already-imported orders import again; no invoice link, no payment.
          </p>
        ) : null}

        {bound || c.startedAt != null || c.invoice || c.ecwidOrder ? (
          <div className="flex items-center gap-2 px-mode-page py-2 text-role-caption text-text-muted">
            {bound ? (
              <span>
                Draft <span className="font-mono text-text-default">{state.orderNumber}</span>
              </span>
            ) : c.invoice ? (
              <span>From Square invoice <span className="font-mono text-text-default">#{c.invoice.invoiceNumber}</span></span>
            ) : c.ecwidOrder ? (
              <span>From Ecwid order <span className="font-mono text-text-default">#{c.ecwidOrder.orderNumber}</span></span>
            ) : null}
            {c.startedAt != null ? (
              <span className="ml-auto inline-flex items-center gap-1 tabular-nums text-text-info" data-testid="m-order-timer">
                <Clock className="size-3.5" aria-hidden />
                {elapsedLabel(c.elapsed)}
              </span>
            ) : null}
          </div>
        ) : null}

        {c.choosingImport ? (
          c.mode === 'square' ? (
            <MobileSquareImportList onImport={(inv) => void c.importInvoice(inv)} allowImported={c.testMode} />
          ) : (
            <MobileEcwidImportList onImport={c.importEcwidOrder} currency={state.currency} allowImported={c.testMode} />
          )
        ) : (
          <>
            <CheckoutStepTrail
              current={step}
              done={c.stepDone}
              onGo={c.setStep}
              touch
              testIdPrefix="m-order-step-"
              className="border-b border-mode-rule px-mode-page py-1.5"
            />

            {step === 'customer' && !bound && c.startedAt == null && c.mode === 'new' ? (
              <Link
                href={`/m/scan?returnTo=${encodeURIComponent(PATH)}`}
                className="flex min-h-12 items-center gap-3 px-mode-page py-3 text-role-body text-text-default active:bg-mode-hover"
                data-testid="m-order-scan"
              >
                <ScanBarcode className="size-5 text-text-muted" aria-hidden />
                <span className="flex-1">Scan an order number</span>
                <ChevronRight className="size-4 text-text-faint" aria-hidden />
              </Link>
            ) : null}

            <section aria-label={CHECKOUT_STEPS[c.stepIndex]!.title} data-step={step}>
              {/* Every step stays mounted — a half-typed search, a drilled category survive Back. */}
              <div className={cn(step !== 'customer' && 'hidden')}>
                <MobileCustomerStep customer={state.customer} onChange={(customer) => patch({ customer })} pickup={state.shippingMode === 'pickup'} />
              </div>
              <div className={cn(step !== 'products' && 'hidden')}>
                <MobileProductsStep
                  currency={state.currency}
                  lines={state.lines}
                  shelf={c.shelf}
                  onShelf={c.setShelf}
                  onAdd={c.addProduct}
                  onAddListing={c.addListing}
                />
              </div>
              <div className={cn(step !== 'team' && 'hidden')}>
                <MobileTeamStep lines={state.lines} byKey={c.team.byKey} onSet={c.team.setLane} />
              </div>
              <div className={cn(step !== 'order' && 'hidden')}>
                <MobileOrderStep state={state} channelOptions={c.channelOptions} onChange={patch} />
              </div>
              <div className={cn(step !== 'shipping' && 'hidden')}>
                <MobileShippingStep
                  state={state}
                  onChange={patch}
                  labelFile={c.labelFile}
                  onLabelFile={c.setLabelFile}
                  bound={c.createdIds ? { orderId: c.createdIds[0]!, orderRef: state.orderNumber, onLabelChanged: c.triage.refresh } : null}
                />
              </div>
              <div className={cn(step !== 'payment' && 'hidden')}>
                {c.testMode && !c.invoice ? (
                  <p className="px-mode-page py-6 text-role-caption text-text-muted" data-testid="m-order-test-payment">
                    Test mode — no payment link, invoice or in-person payment is recorded for a test order.
                  </p>
                ) : (
                  <MobilePaymentStep
                    totals={c.totals}
                    currency={state.currency}
                    orderNumber={bound ? state.orderNumber : null}
                    onEnsureSaved={() => c.submit('draft')}
                    shippingMode={state.shippingMode}
                    invoice={c.invoice}
                  />
                )}
              </div>
            </section>

            {last && !bound && c.releaseBlockers.length > 0 ? (
              <ul className="space-y-1 px-mode-page py-3" aria-label="Still needed before release" data-testid="m-order-blockers">
                {c.releaseBlockers.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-role-caption text-text-muted">
                    <span className="size-1.5 shrink-0 bg-text-warning" aria-hidden />
                    {b}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>

      <div className="flex-1" />
      {verbs.length > 0 ? <DetailDock label="Order steps" verbs={verbs} onVerb={onVerb} /> : null}

      <MobileCartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={state.lines}
        currency={state.currency}
        totals={c.totals}
        blockers={c.releaseBlockers}
        onChange={c.setLine}
        onRemove={c.removeLine}
        locked={c.bound}
      />
    </div>
  );
}
