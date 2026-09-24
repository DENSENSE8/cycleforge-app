'use client';

/**
 * /kiosk/v2 shell — cart is the session root.
 *
 * Trail: command dropdown (Repair · Sales · History · Exit), search glyph,
 * filter, carts · cart · paperwork · Work/Show/Verify. No side rails.
 * Center: catalog / repair details, or History, or the cart / paperwork /
 * Recent carts swap. The cart is written to `kiosk_carts` by
 * `useKioskCartSync` (mounted here, once) so several customers can be juggled
 * and any paired tablet can open a cart by its `#id`.
 *
 * Every command is a catalog command. Buyback and Pickup were deleted
 * 2026-09-23 (see `lib/kiosk/commands.ts`): each stacked a title that
 * repeated the mode name, and Pickup ran its lookup as body fields instead of
 * the header search. A new command comes back through the same header band.
 *
 * Callers: `/kiosk`, `/kiosk/v2`. Affected API: `/api/kiosk/carts` (via
 * `useKioskCartSync`).
 * User: "Converting the left sidebar into just a top left drop down so repair
 * or sales or more and then an exit button so you can exit out of the kiosk
 * mode. The right sidebar should also be removed as well and everything placed
 * into the top header, the cart, the paperwork, the work, show, verify, etc."
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ProductSelector,
  type ProductSelection,
  type SelectedItem,
} from '@/components/repair/ProductSelector';
import type { FavoriteWorkspaceKey } from '@/lib/favorites/favorite-sku-key';
import {
  KIOSK_SERVICES,
  commandToServiceId,
  isKioskCommandServiceId,
  serviceIdToCommand,
  type KioskServiceId,
} from '@/lib/kiosk/services';
import {
  useKioskSession,
  useKioskSessionActions,
} from '@/lib/kiosk/kiosk-session-store';
import type { KioskCommandId } from '@/lib/kiosk/commands';
import {
  cartHasRepairLine,
  cartIsEmpty,
  isRepairPayload,
  retailQuantitiesByVariation,
} from '@/lib/kiosk/cart-line';
import { repairDeviceKey, summarizeProductTitles } from '@/lib/kiosk/repair-devices';
import { classifyKioskScan } from '@/lib/kiosk/scan-classify';
import { useWedgeScanner } from '@/hooks/useWedgeScanner';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { KIOSK_CENTRE_SURFACE, KIOSK_UTILITY_STAGE } from './kiosk-chrome';
import { KioskRepairPane } from './v2/KioskRepairPane';
import { KioskCartLedger } from './v2/KioskCartLedger';
import { KioskKeypadFace } from '@/components/kiosk/KioskKeypadFace';
import { KioskHistoryPane } from './v2/KioskHistoryPane';
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
import { useKioskCartSync } from '@/components/kiosk/useKioskCartSync';
import { KioskRecentCarts } from '@/components/kiosk/KioskRecentCarts';

/** Catalog API prefix per command — repair = `-RS`; retail = non-`-RS`. */
function catalogBasePath(command: KioskCommandId): string {
  return command === 'retail' ? '/api/kiosk/sales' : '/api/kiosk/repair';
}

/**
 * Favorites list per command — the curated tiles this rail lands on.
 *
 * One list per rail, named by the SURFACE and not by the client: the route
 * behind `catalogBasePath` enforces it (`/api/kiosk/sales/favorites` can only
 * ever be the `sales` list). Buyback and pickup are not catalog browses, so
 * they never reach this.
 */
function catalogFavoritesWorkspace(command: KioskCommandId): FavoriteWorkspaceKey {
  return command === 'retail' ? 'sales' : 'repair';
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
  /** The ONE cart, written down per org — Recent carts + the Carts badge. */
  const { carts: openCarts, refresh: refreshCarts, openCart, newCart } = useKioskCartSync();

  const liveModes = useMemo(() => KIOSK_SERVICES.filter((s) => s.status === 'live'), []);
  const commandServiceId: KioskServiceId = commandToServiceId(session.activeCommand);

  const [catalogPhase, setCatalogPhase] = useState<CatalogPhase>('browse');
  const [selectedProduct, setSelectedProduct] = useState<ProductSelection | null>(null);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  /**
   * The picker's selection, mirrored into a ref as well as state.
   *
   * `onSelectProduct` fires from ProductSelector's own effect in the SAME
   * commit as this setter, so a closure over `selectedItems` there reads the
   * PREVIOUS selection — which is how the presentation title would lag one tap
   * behind the tile the staffer just pressed. The ref is written
   * synchronously, so the summary always names what is selected now.
   */
  const selectedItemsRef = useRef<SelectedItem[]>([]);
  const [servicePrice, setServicePrice] = useState('');
  const [utilitySlot, setUtilitySlotRaw] = useState<KioskUtilitySlotId | null>(null);
  /** Where the cart opens: its first step, or checkout (the Keypad's Charge). */
  const [cartOpenAt, setCartOpenAt] = useState<'cart' | 'checkout'>('cart');
  const setUtilitySlot = useCallback((slot: KioskUtilitySlotId | null) => {
    setCartOpenAt('cart');
    setUtilitySlotRaw(slot);
  }, []);
  /**
   * History is a STAFF TOOL over the running command, not a fifth command: it
   * owns no cart and never touches `session.activeCommand`, so closing it
   * returns the operator to the visit they were mid-way through.
   */
  const [historyOpen, setHistoryOpen] = useState(false);
  /** Square's Keypad face is up in place of the catalog (menu → Keypad). */
  const [customAmountOpen, setCustomAmountOpen] = useState(false);
  /**
   * What the top-left menu SHOWS as selected. History and Keypad set
   * no `active_command` — but the operator's model is "the dropdown says where
   * I am" (2026-09-22: *"the top left must select history as well"*), so while
   * a tool is open the trigger names it and the session underneath is
   * untouched: closing it returns the trigger to the running command.
   */
  const activeServiceId: KioskServiceId = historyOpen
    ? 'history'
    : customAmountOpen
      ? 'custom-amount'
      : commandServiceId;
  const [catalogSearch, setCatalogSearch] = useState('');

  const resetBrowseState = useCallback(() => {
    setSelectedProduct(null);
    setSelectedItems([]);
    selectedItemsRef.current = [];
    setServicePrice('');
    setCatalogPhase('browse');
    setCatalogSearch('');
    setCustomAmountOpen(false);
  }, []);

  const onSelectedItemsChange = useCallback((items: SelectedItem[]) => {
    selectedItemsRef.current = items;
    setSelectedItems(items);
  }, []);

  // Opening the panel is when the operator is looking: show the list as it is
  // now, not as of the last poll.
  useEffect(() => {
    if (utilitySlot === 'carts') void refreshCarts();
  }, [utilitySlot, refreshCarts]);

  /*
   * A cart switch is a new visit on screen: the picker's ticks and the repair
   * flow's step belong to the cart being left, and a stale repair tick would
   * otherwise sync itself onto the cart just opened.
   */
  const onNewCart = useCallback(async () => {
    await newCart();
    resetBrowseState();
    setUtilitySlot(null);
  }, [newCart, resetBrowseState, setUtilitySlot]);
  const onOpenCart = useCallback(
    async (id: number) => {
      if (!(await openCart(id))) return;
      resetBrowseState();
      setUtilitySlot('cart');
    },
    [openCart, resetBrowseState, setUtilitySlot],
  );

  const handleCommandSwitch = (mode: KioskServiceId) => {
    const tile = liveModes.find((s) => s.id === mode);
    if (!tile) return;
    // Choosing a command (even the current one) means work, not a parked panel.
    setUtilitySlot(null);
    if (mode === 'custom-amount') {
      // A tool over the running command: the keypad line lands on the ONE
      // cart as that command's kind of line (a sale, or a typed-in device).
      setHistoryOpen(false);
      setCustomAmountOpen(true);
      return;
    }
    if (!isKioskCommandServiceId(mode)) {
      setCustomAmountOpen(false);
      setHistoryOpen(true);
      return;
    }
    // Picking ANY command is also the way out of a tool — including the one
    // already running, which is why these close before the no-op return below.
    setHistoryOpen(false);
    setCustomAmountOpen(false);
    const command = serviceIdToCommand(mode);
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

  // Global HID wedge — a UPC adds a retail line; nothing else is routed yet.
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

      toast('Unrecognized scan.');
    },
    [actions],
  );

  useWedgeScanner({
    onScan: onWedgeScan,
    // Disable on customer face so tip/sign focus is undisturbed.
    disabled: session.face === 'customer',
  });

  const onSelectProduct = useCallback((product: ProductSelection | null) => {
    setSelectedProduct(product);
    if (!product) return;
    /*
     * A VISIT TITLE, never a join. `product.model` is the picker's `', '`-joined
     * list of every ticked item, and THIS string is what the customer display
     * paints at display scale — four names leave the viewport, and `A, B, C, D`
     * is not a title, it is four titles in a trench coat.
     * `summarizeProductTitles` says "Wave Radio II + 2 more" instead.
     *
     * The CART is untouched by this: every line keeps its own single product
     * title, because every line is its own `repair_service` row. Summarizing
     * is a chrome concern, not a record one.
     */
    const names = selectedItemsRef.current.map((item) => item.name);
    const title = summarizeProductTitles(
      names.length > 0
        ? names
        : [[product.type, product.model].filter(Boolean).join(' ')],
    );
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

  /**
   * Keypad → Charge. A sale hands off to the ONE checkout (the cart ledger,
   * past its Cart step: the keypad face already showed the lines). A repair
   * device goes into the repair flow, which collects its serial, reasons and
   * signature exactly as it would for a catalog pick.
   */
  const onKeypadCharge = useCallback(() => {
    if (session.activeCommand === 'repair') {
      setCustomAmountOpen(false);
      setCatalogPhase('checkout');
      return;
    }
    setUtilitySlotRaw('cart');
    setCartOpenAt('checkout');
  }, [session.activeCommand]);

  /*
   * Sales tile tap → cart. A tap ADDS: the first puts the item on the cart, a
   * repeat adds one to that line (Square "Consolidate identical items",
   * `addRetail`). Until 2026-09-23 Sales rode the picker's toggle selection
   * and synced it into lines, so a second tap DESELECTED the tile while the
   * line stayed on the cart, and a third could never add a second unit.
   */
  const salesQuantities = useMemo(
    () => retailQuantitiesByVariation(session.lines),
    [session.lines],
  );
  const onSalesTileTap = useCallback(
    (item: SelectedItem) => {
      const line = actions.addRetail({
        title: item.name,
        unitAmountCents: Math.round((item.price ?? 0) * 100),
        payload: { variationId: item.id, sku: item.sku },
      });
      actions.setPresentation({ lineId: line.id, catalog: null });
    },
    [actions],
  );
  const salesCountPicks = useMemo(
    () => ({ quantities: salesQuantities, onTap: onSalesTileTap }),
    [salesQuantities, onSalesTileTap],
  );

  /*
   * Sync ProductSelector selectedItems → session REPAIR lines, ONE PER DEVICE.
   *
   * Repair keeps the picker's toggle (a device is picked, not counted). Before
   * this sync, a two-radio drop-off
   * reached the pane as ONE line with a joined title, one serial field and a
   * summed quote, so the serial that was recorded belonged to neither unit.
   * `repair_service` has always been one row per device.
   *
   * DESELECTING REMOVES NOTHING. By the time a staffer unticks a tile they may
   * already have read that device's serial off its chassis and typed it, and a
   * picker tap is not how a serialised device is thrown away — the device
   * card's own trash verb is (`KioskRepairPane`, step 1).
   */
  useEffect(() => {
    if (session.activeCommand !== 'repair') return;
    const seen = new Set<string>();
    for (const line of session.lines) {
      if (line.type !== 'REPAIR' || !isRepairPayload(line.payload)) continue;
      seen.add(repairDeviceKey(line.payload.sourceSku, line.payload.productModel));
    }
    for (const item of selectedItems) {
      const key = repairDeviceKey(item.sku, item.name);
      if (seen.has(key)) continue;
      // Seeded inside the loop as well: `session.lines` is this render's
      // snapshot and does not grow as we add, so two identically-keyed picks
      // in one pass would otherwise both land.
      seen.add(key);
      actions.addRepair({
        title: item.name,
        unitAmountCents: Math.round((item.price ?? 0) * 100),
        payload: {
          productModel: item.name,
          sourceSku: item.sku,
          serialNumber: '',
          price: item.price != null ? item.price.toFixed(2) : '',
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- picker selection only
  }, [selectedItems]);

  const checkoutStage =
    session.activeCommand === 'repair' ? (
      <div className={KIOSK_CENTRE_SURFACE}>
        <KioskRepairPane
          selectedProduct={selectedProduct}
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
      openCartCount={openCarts.length}
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
          showStaffTools={false}
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
          vocabulary). A utility panel open over the catalog: this plain band —
          same chips, same height, same positions — holding the paperwork
          toggle, so the panel never covers its own way back and never paints
          a second title band of its own.

          The CART is excluded (2026-09-15): it owns a StepProgressHeader, and
          that band IS its header — X top-left exits, segments across the
          middle. Painting this trail above it would stack exactly the two
          chromes the frame law exists to prevent. Operator 2026-09-14:
          "displaying without the header and then the X button top left to
          close the cart and displaying a stepper on the top". */}
      {utilitySlot !== null && utilitySlot !== 'cart' ? (
          <KioskTopChrome
            activeMode={activeServiceId}
            onModeSwitch={handleCommandSwitch}
            activeSlot={utilitySlot}
            onSelect={setUtilitySlot}
            cartCount={session.lines.length}
            openCartCount={openCarts.length}
            consultStance={session.consultStance}
            onConsultStance={onStanceChange}
          />
        ) : null}
      {/* The paperwork SHEET is flat (operator 2026-09-14: "it should
          not display a depth drop shadow"), so its separation cue is the
          PLANE: the vacated stage drops to surface-sunken while that bounded
          card is up. The CART takes no second plane — it is a
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
        {/* History leads because it is a TOOL over whichever command is
            running: the catalog below is still the session's state and is
            restored, untouched, the moment a command is picked again. */}
        {historyOpen ? (
          // No `History` title in the band: the command dropdown already reads
          // History while the tool is open (operator 2026-09-22). The face
          // takes the band instead, and seats its search glyph + kind filter
          // in it — one chrome unit, never a second one.
          //
          // And NOTHING mode-specific rides along: cart, paperwork and the
          // Work · Show · Verify stance all belong to the command running
          // underneath, which History is only a tool over (operator
          // 2026-09-22: *"the history tab should not display the cart paper
          // work and different work modes since that would be specific to a
          // mode"*). The cart is not cleared — it is not SHOWN; picking a
          // command again brings its chrome back untouched.
          <KioskHistoryPane
            onClose={() => setHistoryOpen(false)}
            chrome={(center) => (
              <KioskTopChrome
                activeMode={activeServiceId}
                onModeSwitch={handleCommandSwitch}
                center={center}
                activeSlot={utilitySlot}
                onSelect={setUtilitySlot}
                cartCount={session.lines.length}
                openCartCount={openCarts.length}
                consultStance={session.consultStance}
                onConsultStance={onStanceChange}
                showCheckoutSlots={false}
                showStance={false}
              />
            )}
          />
        ) : customAmountOpen ? (
          // Square's Keypad: the shell's ONE header band (the menu reads
          // Keypad), then keypad left / Current sale right. No step band.
          <div className={KIOSK_CENTRE_SURFACE}>
            <KioskTopChrome
              activeMode={activeServiceId}
              onModeSwitch={handleCommandSwitch}
              activeSlot={utilitySlot}
              onSelect={setUtilitySlot}
              cartCount={session.lines.length}
              openCartCount={openCarts.length}
              consultStance={session.consultStance}
              onConsultStance={onStanceChange}
            />
            <KioskKeypadFace
              mode={session.activeCommand === 'repair' ? 'repair' : 'retail'}
              onCharge={onKeypadCharge}
            />
          </div>
        ) : (
          <ProductSelector
            key={session.activeCommand}
            apiBasePath={catalogBasePath(session.activeCommand)}
            favoritesWorkspace={catalogFavoritesWorkspace(session.activeCommand)}
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
            countPicks={session.activeCommand === 'retail' ? salesCountPicks : undefined}
            continueVisible={
              session.activeCommand === 'retail'
                ? session.lines.length > 0
                : cartHasRepairLine(session.lines)
            }
            onAddAnotherItem={returnToRepairCatalog}
            selectedProduct={selectedProduct}
            onSelect={onSelectProduct}
            selectedItems={selectedItems}
            onSelectedItemsChange={onSelectedItemsChange}
            onPriceChange={setServicePrice}
            searchQuery={catalogSearch}
            onSearchQueryChange={setCatalogSearch}
            stageContent={checkoutStage}
          />
        )}
        </div>

        {utilitySlot === 'cart' && (
          <KioskCartLedger openAt={cartOpenAt} onClose={() => setUtilitySlot(null)} />
        )}
        {utilitySlot === 'paperwork' && <KioskPaperworkPanel />}
        {utilitySlot === 'carts' && (
          <KioskRecentCarts
            carts={openCarts}
            currentCartId={session.cartDone ? null : session.cartId}
            onNewCart={onNewCart}
            onOpenCart={onOpenCart}
          />
        )}
      </div>
    </div>
    </div>
  );
}
