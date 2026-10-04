'use client';

import { useSearchParams } from 'next/navigation';
import { BySkuView } from './BySkuView';
import { ByBinView } from './ByBinView';
import { useInventoryUrlState } from './useInventoryUrlState';
import { InventoryDetailsOverlay } from './panels/InventoryDetailsOverlay';
import { ReplenishWorkspace } from '@/components/replenish/ReplenishWorkspace';
import { Button } from '@/design-system/primitives';

/**
 * `/inventory` body. The proxy (`parked-slot-surfaces.ts`) only lets three
 * URLs through: `?section=replenish`, `?sku=` and `?bin=`; everything else
 * lands on `/inventory/locations` before this renders.
 */
export function InventoryShell() {
    const { state, sidebar, clearAll } = useInventoryUrlState();
    const searchParams = useSearchParams();

    // `?section=replenish` swaps the whole pane over to Need to Order / FIFO.
    if (searchParams.get('section') === 'replenish') {
        return (
            <div className="flex h-full min-h-0 flex-col bg-surface-canvas">
                <ReplenishWorkspace />
            </div>
        );
    }

    // A sidebar detail selection takes the whole pane; the panel owns its header.
    if (sidebar.open) {
        return (
            <div className="flex h-full min-h-0 flex-col bg-surface-card">
                <InventoryDetailsOverlay />
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-end px-2 py-1">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAll}
                    className="px-0 text-xs text-text-soft underline hover:bg-transparent hover:text-text-default"
                >
                    Back to locations
                </Button>
            </div>
            <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto">
                {state.view === 'by-sku' && state.sku ? (
                    <BySkuView sku={state.sku} />
                ) : state.view === 'by-bin' && state.bin ? (
                    <ByBinView barcode={state.bin} />
                ) : null}
            </div>
        </div>
    );
}
