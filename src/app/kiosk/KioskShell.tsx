'use client';

/**
 * /kiosk/v2 shell — cart is the session root.
 *
 * Left: command spine (Repair · Retail · Buyback · Pickup) — swaps center only.
 * Center: contextual work (catalog / repair details / buyback / pickup).
 * Right: persistent cart ledger.
 * Customer face overlays the same session (orientation 180 or Customer toggle).
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
  type KioskCommandId,
} from '@/lib/kiosk/kiosk-session-store';
import { cartIsEmpty } from '@/lib/kiosk/cart-line';
import { classifyKioskScan } from '@/lib/kiosk/scan-classify';
import { useWedgeScanner } from '@/hooks/useWedgeScanner';
import { toast } from '@/lib/toast';
import {
  KIOSK_PANE_HEADER_BAND,
  KIOSK_PANE_HEADER_TITLE,
} from './kiosk-chrome';
import { KioskModeSpine } from './KioskModeSpine';
import { KioskRepairPane } from './v2/KioskRepairPane';
import { KioskPickupPane } from './v2/KioskPickupPane';
import { KioskBuybackPane } from './v2/KioskBuybackPane';
import { KioskCartLedger } from './v2/KioskCartLedger';
import { KioskCustomerFace } from './v2/KioskCustomerFace';

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
  const [spineExpanded, setSpineExpanded] = useState(false);
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
    if (command === session.activeCommand) return;
    const tile = liveModes.find((s) => s.id === mode);
    if (!tile) return;
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
        actions.setFace('customer');
      } else if (session.face === 'customer') {
        actions.setFace('staff');
      }
    };
    syncOrientation();
    window.addEventListener('orientationchange', syncOrientation);
    window.screen?.orientation?.addEventListener?.('change', syncOrientation);
    return () => {
      window.removeEventListener('orientationchange', syncOrientation);
      window.screen?.orientation?.removeEventListener?.('change', syncOrientation);
    };
  }, [session.faceManualOverride, session.face, actions]);

  // Global HID wedge — classify → cart / command, never drop focus.
  const onWedgeScan = useCallback(
    async (raw: string) => {
      const classified = classifyKioskScan(raw);
      if (classified.kind === 'upc') {
        try {
          const res = await fetch(
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
          actions.addRetail({
            title: product.name,
            unitAmountCents: Math.round((product.price ?? 0) * 100),
            payload: { variationId: product.id, sku: product.sku },
          });
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

  const onSelectProduct = useCallback(
    (product: ProductSelection | null) => {
      setSelectedProduct(product);
      if (session.activeCommand === 'repair' && product?.model?.trim()) {
        setCatalogPhase('checkout');
      }
    },
    [session.activeCommand],
  );

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
      actions.addRetail({
        title: item.name,
        unitAmountCents: Math.round((item.price ?? 0) * 100),
        payload: { variationId: item.id, sku: item.sku },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- picker selection only
  }, [selectedItems]);

  const checkoutStage =
    session.activeCommand === 'repair' ? (
      <div className="flex min-h-0 flex-1 flex-col">
        <KioskRepairPane selectedProduct={selectedProduct} price={servicePrice} />
      </div>
    ) : null;

  const catalogSearchLabel =
    session.activeCommand === 'repair' ? 'Search repairs' : 'Search items';

  if (session.face === 'customer') {
    return <KioskCustomerFace />;
  }

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-surface-card text-text-default"
      data-testid="kiosk-shell"
      data-cart-empty={cartIsEmpty(session.lines) ? 'true' : 'false'}
    >
      <KioskModeSpine
        activeMode={activeServiceId}
        onModeSwitch={handleCommandSwitch}
        expanded={spineExpanded}
        onExpandedChange={setSpineExpanded}
        searchValue={catalogSearch}
        onSearchChange={setCatalogSearch}
        searchLabel={catalogSearchLabel}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
        {showCatalog ? (
          <ProductSelector
            key={session.activeCommand}
            apiBasePath={catalogBasePath(session.activeCommand)}
            appearance="flush"
            layout="kiosk-split"
            hideManualEntry
            hideCartTray
            flowInPage
            catalogPhase={
              session.activeCommand === 'repair' ? catalogPhase : 'browse'
            }
            onContinue={() => setCatalogPhase('checkout')}
            onAddAnotherItem={() => setCatalogPhase('browse')}
            selectedProduct={selectedProduct}
            onSelect={onSelectProduct}
            selectedItems={selectedItems}
            onSelectedItemsChange={setSelectedItems}
            onPriceChange={setServicePrice}
            searchQuery={catalogSearch}
            onSearchQueryChange={setCatalogSearch}
            hideBrowseSearch={spineExpanded}
            sidebarHeader={
              <div className={KIOSK_PANE_HEADER_BAND}>
                <h2 className={KIOSK_PANE_HEADER_TITLE}>Catalog</h2>
              </div>
            }
            stageContent={checkoutStage}
          />
        ) : session.activeCommand === 'buyback' ? (
          <div className="flex min-h-0 flex-1 flex-col bg-surface-card">
            <KioskBuybackPane />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col bg-surface-card">
            <KioskPickupPane onReset={resetBrowseState} />
          </div>
        )}
      </div>

      <KioskCartLedger />
    </div>
  );
}
