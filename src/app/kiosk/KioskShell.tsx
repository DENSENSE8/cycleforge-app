'use client';

/**
 * /kiosk/v2 shell — cart is the session root.
 *
 * Trail: command dropdown (Repair · Sales · Buyback · Pickup · Exit), All
 * products or pane title, cart · paperwork · Work/Show/Verify. No side rails.
 * Center: catalog / repair details / buyback / pickup, or cart/paperwork swap.
 *
 * Callers: `/kiosk`, `/kiosk/v2`. Affected API: none.
 * User: "Converting the left sidebar into just a top left drop down so repair
 * or sales or more and then an exit button so you can exit out of the kiosk
 * mode. The right sidebar should also be removed as well and everything placed
 * into the top header, the cart, the paperwork, the work, show, verify, etc."
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ProductSelector,
  type ProductSelection,
  type SelectedItem,
} from '@/components/repair/ProductSelector';
import {
  KIOSK_SERVICES,
  commandToServiceId,
  serviceIdToCommand,
  type KioskServiceId,
} from '@/lib/kiosk/services';
import {
  useKioskSession,
  useKioskSessionActions,
} from '@/lib/kiosk/kiosk-session-store';
import type { KioskCommandId } from '@/lib/kiosk/commands';
import { cartIsEmpty } from '@/lib/kiosk/cart-line';
import { classifyKioskScan } from '@/lib/kiosk/scan-classify';
import { useWedgeScanner } from '@/hooks/useWedgeScanner';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import {
  KIOSK_CENTRE_SURFACE,
  KIOSK_PANE_HEADER_TITLE,
  KIOSK_UTILITY_STAGE,
} from './kiosk-chrome';
import { KioskRepairPane } from './v2/KioskRepairPane';
import { KioskPickupPane } from './v2/KioskPickupPane';
import { KioskBuybackPane } from './v2/KioskBuybackPane';
import { KioskCartLedger, type KioskCartFocus } from './v2/KioskCartLedger';
import { KioskPaperworkPanel } from './v2/KioskPaperworkPanel';
import {
  KioskUtilityCluster,
  KioskTopChrome,
  KioskCommandMenu,
  type KioskUtilitySlotId,
} from './KioskTopChrome';
import { KioskCustomerFace } from './v2/KioskCustomerFace';
import { KioskShowFace } from './v2/KioskShowFace';
import { catalogRefFromPick } from '@/lib/kiosk/consult-proposal';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';

/** Catalog API prefix per command — repair = `-RS`; retail = non-`-RS`. */
function catalogBasePath(command: KioskCommandId): string {
  return command === 'retail' ? '/api/kiosk/sales' : '/api/kiosk/repair';
}

type CatalogPhase = 'browse' | 'checkout';

function orientationIsCustomerFacing(): boolean {
  if (typeof window === 'undefined') return false;
  const angle =
    window.screen?.orientation?.angle ??
    (typeof window.orientation === 'number' ? window.orientation : 0);
  const normalized = ((angle % 360) + 360) % 360;
  return normalized === 180;
}

export function KioskShell() {
  const session = useKioskSession();
  const actions = useKioskSessionActions();

  const liveModes = useMemo(() => KIOSK_SERVICES.filter((s) => s.status === 'live'), []);
  const activeServiceId: KioskServiceId = commandToServiceId(session.activeCommand);

  const [catalogPhase, setCatalogPhase] = useState<CatalogPhase>('browse');
  const [selectedProduct, setSelectedProduct] = useState<ProductSelection | null>(null);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [servicePrice, setServicePrice] = useState('');
  const [utilitySlot, setUtilitySlot] = useState<KioskUtilitySlotId | null>(null);
  const [cartFocus] = useState<KioskCartFocus | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');

  const resetBrowseState = useCallback(() => {
    setSelectedProduct(null);
    setSelectedItems([]);
    setServicePrice('');
    setCatalogPhase('browse');
    setCatalogSearch('');
  }, []);

  const handleCommandSwitch = (mode: KioskServiceId) => {
    const command = serviceIdToCommand(mode);
    const tile = liveModes.find((s) => s.id === mode);
    if (!tile) return;
    // Choosing a command (even the current one) means work, not a parked panel.
    setUtilitySlot(null);
    if (command === session.activeCommand) return;
    // Command switch never clears the cart — only resets browse chrome.
    resetBrowseState();
    actions.setActiveCommand(command);
  };

  // Attract idle: only when cart is empty (handled by runtime via empty check
  // exported for consumers — shell exposes emptiness via store).

  // Orientation → customer face (manual override wins).
  useEffect(() => {
    const syncOrientation = () => {
      if (session.faceManualOverride) return;
      if (orientationIsCustomerFacing()) {
        actions.setConsultStance('verify');
      } else if (session.consultStance !== 'work') {
        actions.setConsultStance('work');
      }
    };
    syncOrientation();
    window.addEventListener('orientationchange', syncOrientation);
    window.screen?.orientation?.addEventListener?.('change', syncOrientation);
    return () => {
      window.removeEventListener('orientationchange', syncOrientation);
      window.screen?.orientation?.removeEventListener?.('change', syncOrientation);
    };
  }, [session.faceManualOverride, session.consultStance, actions]);

  // NOTE: there is deliberately NO auto-open of the cart slot here. The old
  // effect switched to `utilitySlot='cart'` the moment the first line existed,
  // which meant tapping a product on the catalog never showed a SELECTION —
  // the click opened the cart and took the grid away. Selection now stays on
  // the card (check dot + wash), the chrome cart badge counts up, and the
  // staffer opens the cart when THEY choose to.

  // Global HID wedge — classify → cart / command, never drop focus.
  const onWedgeScan = useCallback(
    async (raw: string) => {
      const classified = classifyKioskScan(raw);
      if (classified.kind === 'upc') {
        try {
          const res = await kioskFetchHealed(
            `/api/kiosk/sales/ecwid-products?barcode=${encodeURIComponent(classified.normalized)}&limit=5`,
          );
          const body = (await res.json().catch(() => ({}))) as {
            products?: Array<{
              id: string;
              name: string;
              sku: string;
              price: number | null;
            }>;
            success?: boolean;
          };
          const product = body.products?.[0];
          if (!product) {
            toast('No retail item matched that barcode.');
            return;
          }
          const added = actions.addRetail({
            title: product.name,
            unitAmountCents: Math.round((product.price ?? 0) * 100),
            payload: { variationId: product.id, sku: product.sku },
          });
          actions.setPresentation({ lineId: added.id, catalog: null });
          actions.setActiveCommand('retail');
          toast(`Added ${product.name}`);
        } catch {
          toast('Could not look up that barcode.');
        }
        return;
      }

      if (classified.kind === 'imei') {
        actions.setBuybackImeiPrefill(classified.normalized);
        actions.setActiveCommand('buyback');
        toast('IMEI captured — evaluate buyback.');
        return;
      }

      if (classified.kind === 'pickup_ref') {
        actions.setPickupPrefill(classified.normalized);
        actions.setActiveCommand('pickup');
        return;
      }

      toast('Unrecognized scan.');
    },
    [actions],
  );

  useWedgeScanner({
    onScan: onWedgeScan,
    // Disable on customer face so tip/sign focus is undisturbed.
    disabled: session.face === 'customer',
  });

  const showCatalog =
    session.activeCommand === 'repair' || session.activeCommand === 'retail';

  const onSelectProduct = useCallback((product: ProductSelection | null) => {
    setSelectedProduct(product);
    if (!product) return;
    const title = [product.type, product.model].filter(Boolean).join(' ').trim();
    if (!title) return;
    const dollars = Number.parseFloat(servicePrice);
    const cents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
    actions.setPresentation({
      lineId: null,
      catalog: catalogRefFromPick({
        title,
        lineType: session.activeCommand === 'repair' ? 'REPAIR' : 'RETAIL',
        sku: product.sourceSku,
        unitAmountCents: cents,
      }),
    });
  }, [actions, session.activeCommand, servicePrice]);

  /**
   * The catalog's primary key. REPAIR opens the details stage; RETAIL has no
   * detail step — the tapped item is already a cart line (the sync effect
   * below), so the only forward move is reviewing the cart.
   *
   * Before 2026-09-14 this always set `catalogPhase='checkout'`, but the
   * prop is pinned to 'browse' for retail and `stageContent` is null there,
   * so on Sales the key mutated state nobody read — it rendered, enabled,
   * and did NOTHING. Operator: "the continue button for the services are
   * not working."
   */
  const onCatalogContinue = useCallback(() => {
    if (session.activeCommand === 'repair') {
      setCatalogPhase('checkout');
      return;
    }
    setUtilitySlot('cart');
  }, [session.activeCommand]);

  const returnToRepairCatalog = useCallback(() => {
    setCatalogPhase('browse');
  }, []);

  // Sync ProductSelector selectedItems → session RETAIL lines (by variation id).
  useEffect(() => {
    if (session.activeCommand !== 'retail') return;
    for (const item of selectedItems) {
      const already = session.lines.some(
        (l) =>
          l.type === 'RETAIL' &&
          'variationId' in l.payload &&
          (l.payload as { variationId: string | null }).variationId === item.id,
      );
      if (already) continue;
      const added = actions.addRetail({
        title: item.name,
        unitAmountCents: Math.round((item.price ?? 0) * 100),
        payload: { variationId: item.id, sku: item.sku },
      });
      actions.setPresentation({ lineId: added.id, catalog: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- picker selection only
  }, [selectedItems]);

  const checkoutStage =
    session.activeCommand === 'repair' ? (
      <div className={KIOSK_CENTRE_SURFACE}>
        <KioskRepairPane
          selectedProduct={selectedProduct}
          price={servicePrice}
          onBack={returnToRepairCatalog}
        />
      </div>
    ) : null;

  const onStanceChange = useCallback(
    (s: typeof session.consultStance) => actions.setConsultStance(s, { manual: true }),
    [actions],
  );

  const commandMenu = (
    <KioskCommandMenu activeMode={activeServiceId} onModeSwitch={handleCommandSwitch} />
  );
  const utilityCluster = (
    <KioskUtilityCluster
      activeSlot={utilitySlot}
      onSelect={setUtilitySlot}
      cartCount={session.lines.length}
      consultStance={session.consultStance}
      onConsultStance={onStanceChange}
    />
  );

  if (session.face === 'customer') {
    return (
      <div
        className="flex h-full w-full flex-col overflow-hidden bg-surface-card text-text-default"
        data-testid="kiosk-consult-stance"
        data-kiosk-consult-stance={session.consultStance}
      >
        <KioskTopChrome
          activeMode={activeServiceId}
          onModeSwitch={handleCommandSwitch}
          activeSlot={null}
          onSelect={() => {}}
          cartCount={session.lines.length}
          consultStance={session.consultStance}
          onConsultStance={onStanceChange}
          showCheckoutSlots={false}
        />
        <div className="min-h-0 min-w-0 flex-1">
          {session.consultStance === 'show' ? <KioskShowFace /> : <KioskCustomerFace />}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden bg-surface-card text-text-default"
      data-testid="kiosk-consult-stance"
      data-kiosk-consult-stance={session.consultStance}
    >
    <div
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      data-testid="kiosk-shell"
      data-cart-empty={cartIsEmpty(session.lines) ? 'true' : 'false'}
    >
      {/* ONE 56px header band at all times, never a second one stacked.
          Catalog browse: the picker's glass trail (it owns the same chip
          vocabulary). A utility slot open on the catalog, or a non-catalog
          pane (buyback / pickup): this plain band — same chips, same height,
          same positions — holding the paperwork/cart toggles so a panel
          never covers its own way back. */}
      {/* Band ONLY while a utility panel covers the work surface — the pane
          branches (buyback/pickup) mount their own titled band, and the
          catalog's trail lives inside ProductSelector. Rendering this band
          when !showCatalog stacked a SECOND chrome over the pane band.

          The CART is excluded (2026-09-15): it owns a StepProgressHeader, and
          that band IS its header — X top-left exits, segments across the
          middle. Painting this trail above it would stack exactly the two
          chromes the frame law exists to prevent. Operator 2026-09-14:
          "displaying without the header and then the X button top left to
          close the cart and displaying a stepper on the top". Paperwork and
          triage still paint their own titled band, so they still take this
          trail; porting them onto KioskPaneForm is the next increment. */}
      {utilitySlot !== null && utilitySlot !== 'cart' ? (
          <KioskTopChrome
            activeMode={activeServiceId}
            onModeSwitch={handleCommandSwitch}
            activeSlot={utilitySlot}
            onSelect={setUtilitySlot}
            cartCount={session.lines.length}
            consultStance={session.consultStance}
            onConsultStance={onStanceChange}
          />
        ) : null}
      {/* The paperwork / triage SHEET is flat (operator 2026-09-14: "it should
          not display a depth drop shadow"), so its separation cue is the
          PLANE: the vacated stage drops to surface-sunken while one of those
          bounded cards is up. The CART takes no second plane — it is a
          full-bleed white centre surface now (KIOSK_CENTRE_SURFACE, the repair
          intake skeleton), so there is nothing to contrast. Conditional either
          way, never a permanent repaint: KIOSK_POS_CANVAS is the one browse
          background and kiosk-pos-surface.test.ts pins it. */}
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          utilitySlot !== null && utilitySlot !== 'cart' && KIOSK_UTILITY_STAGE,
        )}
        data-kiosk-utility-stage={utilitySlot ?? undefined}
      >
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
            utilitySlot !== null && 'hidden',
          )}
          data-testid="kiosk-work-surface"
          aria-hidden={utilitySlot !== null}
        >
        {showCatalog ? (
          <ProductSelector
            key={session.activeCommand}
            apiBasePath={catalogBasePath(session.activeCommand)}
            catalogSearchMode="server"
            appearance="flush"
            layout="kiosk-split"
            hideManualEntry
            hideCartTray
            flowInPage
            sidebarHeader={commandMenu}
            trailEnd={utilityCluster}
            catalogPhase={
              session.activeCommand === 'repair' ? catalogPhase : 'browse'
            }
            onContinue={onCatalogContinue}
            continueLabel={
              session.activeCommand === 'repair'
                ? undefined
                : `Review cart · ${session.lines.length} item${session.lines.length === 1 ? '' : 's'}`
            }
            onAddAnotherItem={returnToRepairCatalog}
            selectedProduct={selectedProduct}
            onSelect={onSelectProduct}
            selectedItems={selectedItems}
            onSelectedItemsChange={setSelectedItems}
            onPriceChange={setServicePrice}
            searchQuery={catalogSearch}
            onSearchQueryChange={setCatalogSearch}
            stageContent={checkoutStage}
          />
        ) : session.activeCommand === 'buyback' ? (
          <div className={KIOSK_CENTRE_SURFACE}>
            <KioskTopChrome
              activeMode={activeServiceId}
              onModeSwitch={handleCommandSwitch}
              center={<h2 className={KIOSK_PANE_HEADER_TITLE}>Buyback</h2>}
              activeSlot={utilitySlot}
              onSelect={setUtilitySlot}
              cartCount={session.lines.length}
              consultStance={session.consultStance}
              onConsultStance={onStanceChange}
            />
            {/* No `hideHeader` prop: the pane frame has no title face at all
                (KioskPaneForm), so the trail above is the ONE header band. */}
            <KioskBuybackPane />
          </div>
        ) : (
          <div className={KIOSK_CENTRE_SURFACE}>
            <KioskTopChrome
              activeMode={activeServiceId}
              onModeSwitch={handleCommandSwitch}
              center={<h2 className={KIOSK_PANE_HEADER_TITLE}>Pickup</h2>}
              activeSlot={utilitySlot}
              onSelect={setUtilitySlot}
              cartCount={session.lines.length}
              consultStance={session.consultStance}
              onConsultStance={onStanceChange}
            />
            <KioskPickupPane onReset={resetBrowseState} />
          </div>
        )}
        </div>

        {utilitySlot === 'cart' && <KioskCartLedger focus={cartFocus} onClose={() => setUtilitySlot(null)} />}
        {utilitySlot === 'paperwork' && <KioskPaperworkPanel onClose={() => setUtilitySlot(null)} />}
      </div>
    </div>
    </div>
  );
}
