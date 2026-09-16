'use client';

import { useSearchParams } from 'next/navigation';
import { PulseView } from './PulseView';
import { BySkuView } from './BySkuView';
import { ByBinView } from './ByBinView';
import { ByUnitView } from './ByUnitView';
import { ByFilterResultList } from './ByFilterResultList';
import { useInventoryUrlState } from './useInventoryUrlState';
import { InventoryDetailsOverlay } from './panels/InventoryDetailsOverlay';
import { ReplenishWorkspace } from '@/components/replenish/ReplenishWorkspace';
import { TriageWorkspace } from './TriageWorkspace';
import { PulseWorkspace } from './PulseWorkspace';
import { Button } from '@/design-system/primitives';

export function InventoryShell() {
    const { state, sidebar, clearAll } = useInventoryUrlState();
    const { mode } = sidebar;
    const searchParams = useSearchParams();

    // `?section=replenish` swaps the whole pane over to Need to Order / FIFO.
    // Replenish used to keep controls in the left rail; that column is gone
    // with the rest of the inventory context panel (operator 2026-09-15).
    if (searchParams.get('section') === 'replenish') {
        return (
            <div className="flex h-full min-h-0 flex-col bg-surface-canvas">
                <ReplenishWorkspace />
            </div>
        );
    }

    // Triage/Pulse are full-pane workspaces driven by the sidebar's `?open=`
    // selection (an exception id / serial-unit id). They MUST be handled before
    // the ledger `hasOpenDetail` overlay below — otherwise any `?open=` would be
    // swallowed by the ledger detail overlay and these would never render.
    if (mode === 'triage') {
        return (
            <div className="flex h-full min-h-0 flex-col bg-surface-card">
                <TriageWorkspace selectedId={sidebar.open} />
            </div>
        );
    }
    if (mode === 'pulse') {
        return (
            <div className="flex h-full min-h-0 flex-col bg-surface-card">
                <PulseWorkspace unitId={sidebar.open} />
            </div>
        );
    }

    const hasNonFilterTarget =
        state.view === 'by-sku' || state.view === 'by-bin' || state.view === 'by-unit';
    const hasAnyTarget = hasNonFilterTarget || state.view === 'by-filter';
    const hasOpenDetail = Boolean(sidebar.open);

    // When the sidebar has a detail selection, the detail view becomes the
    // main pane's content — no header chrome, no max-width container, so the
    // panel's own header takes over the top of the right pane.
    if (hasOpenDetail) {
        return (
            <div className="flex h-full min-h-0 flex-col bg-surface-card">
                <InventoryDetailsOverlay />
            </div>
        );
    }

    return (
        /*
         * No title row and no measure of its own (2026-08-31).
         *
         * This drew a hand-rolled `PageHeader` reading "Inventory" at
         * `max-w-5xl` — a second page-header primitive on a second measure,
         * one level below the frame that already prints the page's name. The
         * desk chrome (`@/design-system/components/DeskPageChrome`, mounted by
         * `src/app/inventory/layout.tsx`) owns the title and the stage now, so
         * what is left here is the body.
         *
         * "Back to recent activity" survives as a row above the list rather
         * than a header slot: it is a state reset for THIS view, not a
         * page-level action, and the header's right slot is the desk's primary
         * CTA.
         */
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {hasAnyTarget ? (
                <div className="flex shrink-0 items-center justify-end px-2 py-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAll}
                        className="px-0 text-xs text-text-soft underline hover:bg-transparent hover:text-text-default"
                    >
                        Back to recent activity
                    </Button>
                </div>
            ) : null}

            <div
                className={
                    hasAnyTarget
                        ? 'flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto'
                        : 'flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden'
                }
            >
                {state.view === 'by-sku' && state.sku ? (
                    <BySkuView sku={state.sku} />
                ) : state.view === 'by-bin' && state.bin ? (
                    <ByBinView barcode={state.bin} />
                ) : state.view === 'by-unit' && state.unit ? (
                    <ByUnitView ref={state.unit} />
                ) : state.view === 'by-filter' ? (
                    <ByFilterResultList
                        states={state.states}
                        conditions={state.conditions}
                    />
                ) : (
                    <PulseView />
                )}
            </div>
        </div>
    );
}
