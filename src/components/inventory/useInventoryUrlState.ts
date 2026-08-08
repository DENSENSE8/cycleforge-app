'use client';

import { startTransition, useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import {
    inventoryTabFromPathname,
    normalizeBuckets,
    normalizeInventoryTab,
    normalizeSearchField,
    type AnyInventoryBucket,
    type AnyInventorySearchField,
    type InventoryTab,
} from '@/lib/inventory-search';
import type { InventoryViewState } from './types';
import { INVENTORY_ROUTE_PARAMS } from '@/lib/routing/query-mode-routes';
import { parseRouteParams } from '@/lib/routing/route-params';

function parseList(raw: string | null): string[] {
    if (!raw) return [];
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * Legacy view state — kept so the rest of the inventory app (ByBinView,
 * BySkuView, etc.) keeps working until the detail-panel refactor in Phase 2.
 * `state.sku/bin/unit` continue to drive the right-pane viewport; the new
 * tabbed sidebar writes into them when a result is clicked.
 */
function readViewState(searchParams: URLSearchParams): InventoryViewState {
    const sku = searchParams.get('sku');
    const bin = searchParams.get('bin');
    const unit = searchParams.get('unit');
    const states = parseList(searchParams.get('state'));
    const conditions = parseList(searchParams.get('condition'));
    if (unit) return { view: 'by-unit', sku: null, bin: null, unit, states, conditions };
    if (sku) return { view: 'by-sku', sku, bin: null, unit: null, states, conditions };
    if (bin) return { view: 'by-bin', sku: null, bin, unit: null, states, conditions };
    if (states.length > 0 || conditions.length > 0) {
        return { view: 'by-filter', sku: null, bin: null, unit: null, states, conditions };
    }
    return { view: 'pulse', sku: null, bin: null, unit: null, states, conditions };
}

export type InventoryMode = 'ledger' | 'triage' | 'pulse' | 'replenish';

export interface InventorySidebarUrlState {
    mode: InventoryMode;
    tab: InventoryTab;
    /** Search input (committed/debounced value, mirrored upstream). */
    q: string;
    /** Scoped-search field id; tab-scoped meaning. */
    field: AnyInventorySearchField;
    /** Multi-select bucket filter ids; tab-scoped meaning. */
    buckets: AnyInventoryBucket[];
    /** Pending detail-panel selection key (Phase 2+). */
    open: string | null;
}

export type UrlPatch = {
    sku?: string | null;
    bin?: string | null;
    unit?: string | null;
    states?: string[];
    conditions?: string[];
};

export type SidebarUrlPatch = {
    tab?: InventoryTab;
    q?: string | null;
    field?: string | null;
    buckets?: string[];
    open?: string | null;
};

const INVENTORY_PATH = '/inventory';

function tabBasePath(tab: InventoryTab): string {
    return `${INVENTORY_PATH}/${tab}`;
}

export function useInventoryUrlState() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const state = useMemo(
        () => readViewState(new URLSearchParams(searchParams.toString())),
        [searchParams],
    );

    const sidebarBase = useMemo(() => {
        const rawMode = searchParams.get('mode');
        const section = searchParams.get('section');
        const pathTab = inventoryTabFromPathname(pathname);
        // `triage`/`pulse` are now their own routes (/inventory/triage,
        // /inventory/pulse) — consistent with /inventory/graph — but they reuse
        // the default (activity) search scope in the sidebar, so keep `tab`
        // neutral on those mode-routes. The legacy `?mode=` form still resolves.
        const pathMode: InventoryMode | null =
            pathTab === 'triage' ? 'triage' : pathTab === 'pulse' ? 'pulse' : null;
        const mode =
            (section === 'replenish'
                ? 'replenish'
                : (rawMode as InventoryMode) || pathMode) || 'ledger';
        const tab = pathMode ? 'activity' : pathTab;
        const rawField = searchParams.get('field');
        const rawBuckets = searchParams.get('filter');
        return {
            mode,
            tab,
            q: (searchParams.get('q') ?? '').trim(),
            field: normalizeSearchField(tab, rawField) as AnyInventorySearchField,
            buckets: normalizeBuckets(tab, rawBuckets) as AnyInventoryBucket[],
            urlOpen: searchParams.get('open'),
        };
    }, [pathname, searchParams]);

    const replaceOpenParams = useCallback(
        (mutate: (params: URLSearchParams) => void) => {
            const sp = new URLSearchParams(searchParams.toString());
            mutate(sp);
            const qs = sp.toString();
            // Open-only writes stay on the current inventory path. Triage/Pulse
            // are mode routes (`/inventory/triage|pulse`) whose sidebar `tab` is
            // forced to `activity` — retargeting via tabBasePath would bounce
            // them to `/inventory/activity` and drop the mode.
            const onModeRoute =
                pathname?.startsWith(`${INVENTORY_PATH}/triage`) ||
                pathname?.startsWith(`${INVENTORY_PATH}/pulse`);
            const targetPath = onModeRoute
                ? pathname
                : pathname?.startsWith(INVENTORY_PATH)
                  ? pathname
                  : tabBasePath(sidebarBase.tab);
            router.replace(qs ? `${targetPath}?${qs}` : targetPath);
        },
        [router, searchParams, pathname, sidebarBase.tab],
    );

    const writeOpen = useCallback((params: URLSearchParams, next: string | null) => {
        if (next) params.set('open', next);
        else params.delete('open');
    }, []);

    const {
        value: open,
        setValue: setOpen,
        paint: paintOpen,
    } = useOptimisticUrlParam<string | null>({
        urlValue: sidebarBase.urlOpen,
        replace: replaceOpenParams,
        write: writeOpen,
        // Sidebar panel + InventoryShell are separate trees — one pending.
        shareKey: 'inventory:open',
    });

    const sidebar = useMemo<InventorySidebarUrlState>(
        () => ({
            mode: sidebarBase.mode,
            tab: sidebarBase.tab,
            q: sidebarBase.q,
            field: sidebarBase.field,
            buckets: sidebarBase.buckets,
            open,
        }),
        [sidebarBase, open],
    );

    const setUrl = useCallback(
        (next: UrlPatch) => {
            const sp = new URLSearchParams(searchParams.toString());
            const applyKey = (key: 'sku' | 'bin' | 'unit') => {
                const v = next[key];
                if (v === undefined) return;
                if (v) sp.set(key, v);
                else sp.delete(key);
            };
            applyKey('sku');
            applyKey('bin');
            applyKey('unit');

            const applyList = (key: 'state' | 'condition', list: string[] | undefined) => {
                if (list === undefined) return;
                if (list.length > 0) sp.set(key, list.join(','));
                else sp.delete(key);
            };
            applyList('state', next.states);
            applyList('condition', next.conditions);

            const singles: Array<'sku' | 'bin' | 'unit'> = ['sku', 'bin', 'unit'];
            for (const k of singles) {
                if (next[k]) {
                    for (const other of singles) {
                        if (other !== k) sp.delete(other);
                    }
                }
            }
            const qs = sp.toString();
            const targetPath = pathname?.startsWith(INVENTORY_PATH) ? pathname : INVENTORY_PATH;
            router.replace(qs ? `${targetPath}?${qs}` : targetPath);
        },
        [pathname, router, searchParams],
    );

    const setSidebarUrl = useCallback(
        (next: SidebarUrlPatch & { mode?: InventoryMode }) => {
            // Open-only patches — paint-pending SoT (same commit as click).
            if (
                next.open !== undefined &&
                next.tab === undefined &&
                next.q === undefined &&
                next.field === undefined &&
                next.buckets === undefined &&
                next.mode === undefined
            ) {
                setOpen(next.open);
                return;
            }

            const sp = new URLSearchParams(searchParams.toString());

            if (next.mode !== undefined) {
                // Mode now lives in the PATH (/inventory/triage, /inventory/pulse)
                // or the base route (ledger) — never a `?mode=` param — so the
                // route exists and the master-nav rail resolves it. Clearing the
                // param here also scrubs any legacy `?mode=` left in the URL.
                sp.delete('mode');

                if (next.mode !== sidebar.mode) {
                    // CONSTRUCT the destination — rule 1 of the isolation contract
                    // (`@/lib/routing/route-params`). This replaces a four-key
                    // clear list (`field`/`filter`/`q`/`open`) that also let the
                    // viewport selectors through, so `?sku=`/`?bin=`/`?unit=` and
                    // the state/condition multi-selects rode a mode switch.
                    //
                    // That made the two paths to the same job DISAGREE: the nav
                    // rail's `applyChildTarget` already constructed and carried only
                    // `staff`, while this in-app switch carried the selection. Two
                    // shapes for one job is the fork the contract bans, so this
                    // side moves to match the nav — a mode switch opens clean.
                    paintOpen(null);
                    const delta = new URLSearchParams();
                    const staff = sp.get('staff') ?? sp.get('staffId');
                    if (staff) delta.set('staff', staff);

                    const targetPath =
                        next.mode === 'triage'
                            ? `${INVENTORY_PATH}/triage`
                            : next.mode === 'pulse'
                              ? `${INVENTORY_PATH}/pulse`
                              : INVENTORY_PATH;
                    const qs = parseRouteParams(INVENTORY_ROUTE_PARAMS, delta).toString();
                    startTransition(() => {
                        router.push(qs ? `${targetPath}?${qs}` : targetPath);
                    });
                    return;
                }
            }
            if (next.q !== undefined) {
                if (next.q && next.q.trim().length > 0) sp.set('q', next.q.trim());
                else sp.delete('q');
            }
            if (next.field !== undefined) {
                if (next.field && next.field !== 'all') sp.set('field', next.field);
                else sp.delete('field');
            }
            if (next.buckets !== undefined) {
                if (next.buckets.length > 0) sp.set('filter', next.buckets.join(','));
                else sp.delete('filter');
            }
            if (next.open !== undefined) {
                paintOpen(next.open);
                if (next.open) sp.set('open', next.open);
                else sp.delete('open');
            }

            const nextTab: InventoryTab = next.tab ?? sidebar.tab;
            if (next.tab && next.tab !== sidebar.tab) {
                const field = normalizeSearchField(nextTab, sp.get('field'));
                if (!field || field === 'all') sp.delete('field');
                const validBuckets = normalizeBuckets(nextTab, sp.get('filter'));
                if (validBuckets.length > 0) sp.set('filter', validBuckets.join(','));
                else sp.delete('filter');
                paintOpen(null);
                sp.delete('open');
            }

            const qs = sp.toString();
            const targetPath = tabBasePath(nextTab);
            const url = qs ? `${targetPath}?${qs}` : targetPath;

            startTransition(() => {
                if (next.tab && next.tab !== sidebar.tab) router.push(url);
                else router.replace(url);
            });
        },
        [router, searchParams, sidebar.mode, sidebar.tab, setOpen, paintOpen],
    );

    const clearAll = useCallback(
        () =>
            setUrl({
                sku: null,
                bin: null,
                unit: null,
                states: [],
                conditions: [],
            }),
        [setUrl],
    );

    return { state, sidebar, setUrl, setSidebarUrl, clearAll };
}

export type { InventoryTab } from '@/lib/inventory-search';

// Keep `normalizeInventoryTab` re-exported for any direct consumer.
export { normalizeInventoryTab };
