'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { InventorySidebar } from '@/components/inventory/sidebar/InventorySidebar';
import { InventoryGraphSidebar } from '@/components/inventory/sidebar/InventoryGraphSidebar';
import { InventoryTriageSidebar } from '@/components/inventory/sidebar/InventoryTriageSidebar';
import { InventoryPulseSidebar } from '@/components/inventory/sidebar/InventoryPulseSidebar';
import { ReplenishSidebarPanel } from '@/components/sidebar/ReplenishSidebarPanel';
import { WarehouseSidebarPanel } from '@/components/sidebar/WarehouseSidebarPanel';
import { appChromeClass } from '@/design-system/tokens/app-surface';

/**
 * Sidebar panel for the inventory area. L2 modes (ledger · triage · pulse ·
 * graph · replenish · locations) live in GlobalHeader (`HeaderPageSwitcher` ←
 * SIDEBAR_PAGE_NAV) — no sidebar mode rail twin.
 *
 * Body switches on path / `?section=` the same way the main pane does.
 */
export function InventorySidebarPanel() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const section =
        searchParams.get('section') === 'replenish' ? 'replenish' : 'inventory';

    if (
        pathname?.startsWith('/inventory/locations') ||
        pathname === '/warehouse' ||
        pathname?.startsWith('/warehouse/')
    ) {
        return (
            <div className={`flex h-full flex-col overflow-hidden ${appChromeClass}`}>
                <WarehouseSidebarPanel />
            </div>
        );
    }
    if (pathname?.startsWith('/inventory/graph')) {
        return (
            <div className={`flex h-full flex-col overflow-hidden ${appChromeClass}`}>
                <InventoryGraphSidebar />
            </div>
        );
    }
    if (pathname?.startsWith('/inventory/triage')) {
        return (
            <div className={`flex h-full flex-col overflow-hidden ${appChromeClass}`}>
                <InventoryTriageSidebar />
            </div>
        );
    }
    if (pathname?.startsWith('/inventory/pulse')) {
        return (
            <div className={`flex h-full flex-col overflow-hidden ${appChromeClass}`}>
                <InventoryPulseSidebar />
            </div>
        );
    }

    return (
        <div className={`flex h-full flex-col overflow-hidden ${appChromeClass}`}>
            <div className="min-h-0 flex-1 overflow-hidden">
                {section === 'replenish' ? (
                    <ReplenishSidebarPanel />
                ) : (
                    <div className="h-full overflow-y-auto">
                        <InventorySidebar embedded />
                    </div>
                )}
            </div>
        </div>
    );
}
