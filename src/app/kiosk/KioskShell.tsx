'use client';

import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/utils/_cn';
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

export function KioskShell() {
  const liveModes = useMemo(() => KIOSK_SERVICES.filter((s) => s.status === 'live'), []);
  const [activeMode, setActiveMode] = useState<KioskServiceId>(
    () => liveModes[0]?.id ?? 'repair',
  );
  /** Default expanded — counter clarity on landscape iPad; snap collapse frees Catalog width. */
  const [spineExpanded, setSpineExpanded] = useState(true);

  const [selectedProduct, setSelectedProduct] = useState<ProductSelection | null>(null);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [servicePrice, setServicePrice] = useState('');

  const resetState = useCallback(() => {
    setSelectedProduct(null);
    setSelectedItems([]);
    setServicePrice('');
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

  return (
    <div className="flex h-full w-full overflow-hidden bg-surface-canvas text-text-default">
      <KioskModeSpine
        activeMode={activeMode}
        expanded={spineExpanded}
        onModeSwitch={handleModeSwitch}
      />

      {/* Landscape: catalog | detail. Portrait: stacked catalog band above detail. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
        {showCatalog && (
          <div
            className={cn(
              'flex min-h-0 flex-col border-border-soft bg-surface-card',
              // Portrait: horizontal band (top). Landscape: left rail.
              'max-h-[40vh] w-full border-b md:max-h-none md:w-1/3 md:min-w-80 md:max-w-md md:border-b-0 md:border-r',
            )}
          >
            <div className={KIOSK_PANE_HEADER_BAND}>
              {spineToggle}
              <h2 className={KIOSK_PANE_HEADER_TITLE}>
                {activeMode === 'sales' ? 'Products' : 'Catalog'}
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-0">
              <ProductSelector
                key={activeMode}
                apiBasePath={catalogBasePath(activeMode)}
                appearance="flush"
                hideManualEntry
                flowInPage
                selectedProduct={selectedProduct}
                onSelect={setSelectedProduct}
                selectedItems={selectedItems}
                onSelectedItemsChange={setSelectedItems}
                onPriceChange={setServicePrice}
              />
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col bg-surface-canvas">
          {/* Repair owns its detail header (paperwork toggle). Sales/pickup use shell title. */}
          {activeMode !== 'repair' && (
            <div className={KIOSK_PANE_HEADER_BAND}>
              {!showCatalog ? spineToggle : null}
              <h2 className={KIOSK_PANE_HEADER_TITLE}>
                {activeMode === 'sales' ? 'Buy / Sell' : activeMode} Details
              </h2>
            </div>
          )}
          {activeMode === 'repair' ? (
            <div className="min-h-0 flex-1">
              <KioskRepairPane
                selectedProduct={selectedProduct}
                price={servicePrice}
                onReset={resetState}
              />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
              {activeMode === 'sales' && (
                <KioskCounterPane
                  selectedItems={selectedItems}
                  selectedProduct={selectedProduct}
                  servicePrice={servicePrice}
                  onReset={resetState}
                />
              )}
              {activeMode === 'pickup' && <KioskPickupPane onReset={resetState} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
