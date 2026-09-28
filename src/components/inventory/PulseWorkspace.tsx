'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Loader2, MapPin, Package } from '@/components/Icons';
import { getLast8, SerialChip, SkuScanRefChip } from '@/components/ui/CopyChip';
import { DataTable } from '@/components/tables/DataTable';
import { useInventoryEventsSpreadsheet } from './events-grid/useInventoryEventsSpreadsheet';
import { unitStatusBadgeClass } from '@/lib/unit-status';
import type { PulseEventRow, PulseEventsResponse } from './types';
import { cn } from '@/utils/_cn';

interface PulseWorkspaceProps {
    /** `?open=` — the serial_unit id selected in the sidebar. */
    unitId: string | null;
}

/** One unit's timeline, newest-first at the caller. */
async function fetchUnitEvents(
    unitId: string,
    q: string,
    signal: AbortSignal,
): Promise<PulseEventRow[]> {
    const params = new URLSearchParams({ serial_unit_id: unitId });
    if (q) params.set('q', q);
    else params.set('limit', '200');
    const res = await fetch(`/api/inventory-events?${params}`, {
        signal,
        credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as PulseEventsResponse;
    return body.events ?? [];
}

/** The API may return either order; the timeline reads newest-first. */
function newestFirst(rows: PulseEventRow[] | undefined): PulseEventRow[] {
    return [...(rows ?? [])].sort(
        (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    );
}

export function PulseWorkspace({ unitId }: PulseWorkspaceProps) {
    /*
     * The find text is session-local and rides the FETCH KEY — the sidebar
     * already owns `?open=`, and a half-typed filter is not a place to link to.
     * `SearchField` debounces at 320ms, so this is the key as handed over.
     */
    const [query, setQuery] = useState('');
    const q = query.trim();

    const { data, isLoading, isFetching, isError, error } = useQuery<PulseEventRow[]>({
        queryKey: ['pulse-unit-events', unitId, q],
        enabled: !!unitId,
        queryFn: ({ signal }) => fetchUnitEvents(String(unitId), q, signal),
        placeholderData: (prev) => prev,
    });

    /* The IDENTITY read, deliberately UNSEARCHED. */
    const { data: unitData } = useQuery<PulseEventRow[]>({
        queryKey: ['pulse-unit-events', unitId, ''],
        enabled: !!unitId,
        queryFn: ({ signal }) => fetchUnitEvents(String(unitId), '', signal),
    });

    const events = useMemo(() => newestFirst(data), [data]);
    const unitEvents = useMemo(() => newestFirst(unitData), [unitData]);
    const latest = unitEvents[0] ?? null;
    const currentStatus = latest?.next_status ?? latest?.prev_status ?? null;
    const currentLocation = unitEvents.find((e) => e.bin_name)?.bin_name ?? null;
    const serial = latest?.serial_number ?? null;
    const sku = latest?.sku ?? null;
    const productTitle = unitEvents.find((e) => e.product_title)?.product_title ?? null;
    const heroTitle = productTitle || serial || `Unit #${unitId}`;

    // Above the early returns: the ledger's feed is a hook, and a hook may not
    // sit behind a conditional.
    const search = useMemo(
        () => ({
            value: query,
            onChange: setQuery,
            placeholder: "Filter this unit's events…",
            answeredBy: 'server' as const,
            pending: isFetching,
        }),
        [query, isFetching],
    );
    const sheet = useInventoryEventsSpreadsheet({
        events,
        loading: isLoading,
        emptyMessage: 'No recorded events for this unit yet.',
        search,
    });

    if (!unitId) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-surface-canvas text-text-faint">
                <div className="space-y-2 text-center">
                    <History className="mx-auto h-12 w-12 opacity-20" />
                    <p className="text-sm font-medium">Select a unit from the sidebar to see its trace history</p>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-surface-canvas text-text-faint">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="ml-2 text-sm">Loading chain of custody…</span>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
                <div className="mx-6 rounded-md border border-border-danger bg-surface-danger px-4 py-3 text-sm text-text-danger">
                    {error instanceof Error ? error.message : 'Failed to load unit history.'}
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full w-full flex-col overflow-y-auto bg-surface-card">
            <div className="mx-auto w-full max-w-4xl p-8">
                {/* Identity */}
                <div className="mb-8 flex items-end justify-between border-b border-border-hairline pb-6">
                    <div className="flex items-center gap-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
                            <Package className="h-7 w-7" />
                        </div>
                        <div className="min-w-0 space-y-2">
                            {/* Product title on top; serial + SKU are copy chips
                                (last-8, click to copy the full value) below. */}
                            <h1 className="truncate text-2xl font-semibold tracking-tight text-text-default">
                                {heroTitle}
                            </h1>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                {sku ? (
                                    <SkuScanRefChip value={sku} display={getLast8(sku)} />
                                ) : null}
                                {serial ? (
                                    <SerialChip value={serial} width="w-auto shrink-0" />
                                ) : null}
                                {currentStatus ? (
                                    <span
                                        className={cn(
                                            'rounded px-1.5 py-0.5 text-role-micro',
                                            unitStatusBadgeClass(currentStatus),
                                        )}
                                    >
                                        {currentStatus}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </div>
                    {currentLocation ? (
                        <div className="flex flex-col items-end gap-1">
                            <p className="text-role-micro text-text-faint">
                                Last known location
                            </p>
                            <div className="flex items-center gap-2 rounded-2xl border border-border-warning bg-surface-warning px-4 py-2">
                                <MapPin className="h-4 w-4 text-text-warning" />
                                <span className="font-mono text-sm font-semibold text-text-warning">
                                    {currentLocation}
                                </span>
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Chain of custody */}
                <h2 className="mb-3 flex items-center gap-2 text-role-caption font-semibold text-text-faint">
                    <History className="h-4 w-4" /> Chain of custody
                    <span className="font-semibold text-text-faint">· {unitEvents.length} events</span>
                </h2>

                <div className="flex min-h-0 flex-1 flex-col">
                    <DataTable {...sheet} />
                </div>
            </div>
        </div>
    );
}
