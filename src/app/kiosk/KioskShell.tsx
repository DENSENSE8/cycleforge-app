'use client';

import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/utils/_cn';
import { ProductSelector, type ProductSelection, type SelectedItem } from '@/components/repair/ProductSelector';
import { Button } from '@/design-system/primitives';
import { KIOSK_SERVICES, type KioskServiceId } from '@/lib/kiosk/services';
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

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface-canvas text-text-default">
      {/* Landscape: rail | detail. Portrait: stacked catalog band above detail. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        {showCatalog && (
          <div
            className={cn(
              'flex min-h-0 flex-col border-border-soft bg-surface-card shadow-sm',
              // Portrait: horizontal band (top). Landscape: left rail.
              'max-h-[40vh] w-full border-b md:max-h-none md:w-1/3 md:min-w-80 md:max-w-md md:border-b-0 md:border-r',
            )}
          >
            <div className="flex shrink-0 items-center border-b border-border-soft p-5">
              <h2 className="text-lg font-semibold tracking-tight">
                {activeMode === 'sales' ? 'Products' : 'Catalog'}
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <ProductSelector
                key={activeMode}
                apiBasePath={catalogBasePath(activeMode)}
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
            <div className="flex shrink-0 items-center border-b border-border-soft bg-surface-card p-5">
              <h2 className="text-lg font-semibold capitalize tracking-tight">
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

      <div className="fixed bottom-0 left-1/2 z-panel -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full border border-border-soft bg-surface-card/90 p-1.5 shadow-xl backdrop-blur-md">
          {KIOSK_SERVICES.map((tab) => {
            const live = tab.status === 'live';
            const dockLabel =
              tab.id === 'repair' ? 'Repair' : tab.id === 'sales' ? 'Buy / Sell' : 'Pickup';
            return (
              <Button
                key={tab.id}
                type="button"
                variant={activeMode === tab.id ? 'primary' : 'ghost'}
                size="md"
                disabled={!live}
                onClick={() => handleModeSwitch(tab.id)}
                className={cn(
                  'rounded-full px-8 py-3.5 text-role-caption font-semibold',
                  activeMode === tab.id && 'shadow-sm',
                  !live && 'opacity-40',
                )}
                title={live ? tab.blurb : `${tab.label} — coming soon`}
              >
                {dockLabel}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
