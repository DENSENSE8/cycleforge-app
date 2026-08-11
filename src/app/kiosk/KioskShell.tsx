'use client';

import { useState, useCallback, useMemo } from 'react';
import { ProductSelector, type ProductSelection, type SelectedItem } from '@/components/repair/ProductSelector';
import { KIOSK_SERVICES, type KioskServiceId } from '@/lib/kiosk/services';
import {
  KIOSK_PANE_HEADER_BAND,
  KIOSK_PANE_HEADER_TITLE,
} from './kiosk-chrome';
import { KioskModeSpine } from './KioskModeSpine';
import { KioskSpineToggle } from './KioskSpineToggle';
import { KioskRepairPane } from './v2/KioskRepairPane';
import { KioskCounterPane } from './v2/KioskCounterPane';
import { KioskPickupPane } from './v2/KioskPickupPane';

/** Catalog API prefix per mode — repair = `-RS` services; sales = non-`-RS` retail. */
function catalogBasePath(mode: KioskServiceId): string {
  return mode === 'sales' ? '/api/kiosk/sales' : '/api/kiosk/repair';
}

type CatalogPhase = 'browse' | 'checkout';

export function KioskShell() {
  const liveModes = useMemo(() => KIOSK_SERVICES.filter((s) => s.status === 'live'), []);
  const [activeMode, setActiveMode] = useState<KioskServiceId>(
    () => liveModes[0]?.id ?? 'repair',
  );
  /** Default closed (off-screen) — Catalog owns the floor; open via header toggle. */
  const [spineExpanded, setSpineExpanded] = useState(false);
  /** Browse = products stage; checkout = repair/sales detail in the same right slot. */
  const [catalogPhase, setCatalogPhase] = useState<CatalogPhase>('browse');

  const [selectedProduct, setSelectedProduct] = useState<ProductSelection | null>(null);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [servicePrice, setServicePrice] = useState('');

  const resetState = useCallback(() => {
    setSelectedProduct(null);
    setSelectedItems([]);
    setServicePrice('');
    setCatalogPhase('browse');
  }, []);

  const handleModeSwitch = (mode: KioskServiceId) => {
    if (mode === activeMode) return;
    const tile = KIOSK_SERVICES.find((s) => s.id === mode);
    if (!tile || tile.status !== 'live') return;
    if (selectedItems.length > 0 || selectedProduct) {
      if (!confirm('Switching modes will clear your current selection. Continue?')) {
        return;
      }
    }
    resetState();
    setActiveMode(mode);
  };

  const showCatalog = activeMode === 'repair' || activeMode === 'sales';
  /** Toggle lives in Catalog when present; Pickup (no catalog) uses the detail band. */
  const spineToggle = (
    <KioskSpineToggle expanded={spineExpanded} onExpandedChange={setSpineExpanded} />
  );

  const checkoutStage =
    activeMode === 'repair' ? (
      <div className="flex min-h-0 flex-1 flex-col">
        <KioskRepairPane
          selectedProduct={selectedProduct}
          price={servicePrice}
          onReset={resetState}
        />
      </div>
    ) : activeMode === 'sales' ? (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={KIOSK_PANE_HEADER_BAND}>
          <h2 className={KIOSK_PANE_HEADER_TITLE}>Buy / Sell Details</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
          <KioskCounterPane
            selectedItems={selectedItems}
            selectedProduct={selectedProduct}
            servicePrice={servicePrice}
            onReset={resetState}
          />
        </div>
      </div>
    ) : null;

  return (
    <div className="flex h-full w-full overflow-hidden bg-surface-canvas text-text-default">
      <KioskModeSpine
        activeMode={activeMode}
        expanded={spineExpanded}
        onModeSwitch={handleModeSwitch}
      />

      {/* Landscape: category sidebar | browse/checkout stage. Portrait: stacked. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
        {showCatalog ? (
          <ProductSelector
            key={activeMode}
            apiBasePath={catalogBasePath(activeMode)}
            appearance="flush"
            layout="kiosk-split"
            hideManualEntry
            flowInPage
            catalogPhase={catalogPhase}
            onContinue={() => setCatalogPhase('checkout')}
            onAddAnotherItem={() => setCatalogPhase('browse')}
            selectedProduct={selectedProduct}
            onSelect={setSelectedProduct}
            selectedItems={selectedItems}
            onSelectedItemsChange={setSelectedItems}
            onPriceChange={setServicePrice}
            sidebarHeader={
              <div className={KIOSK_PANE_HEADER_BAND}>
                {spineToggle}
                <h2 className={KIOSK_PANE_HEADER_TITLE}>
                  {activeMode === 'sales' ? 'Categories' : 'Catalog'}
                </h2>
              </div>
            }
            browseHeader={
              <div className={KIOSK_PANE_HEADER_BAND}>
                <h2 className={KIOSK_PANE_HEADER_TITLE}>Products</h2>
              </div>
            }
            stageContent={checkoutStage}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col bg-surface-canvas">
            <div className={KIOSK_PANE_HEADER_BAND}>
              {spineToggle}
              <h2 className={KIOSK_PANE_HEADER_TITLE}>{activeMode} Details</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
              <KioskPickupPane onReset={resetState} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
