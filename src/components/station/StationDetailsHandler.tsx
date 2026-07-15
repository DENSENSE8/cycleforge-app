'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ShippedDetailsPanel } from '../shipped/ShippedDetailsPanel';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import {
    dispatchCloseShippedDetails,
    getOpenShippedDetailsPayload,
    type ShippedDetailsContext,
} from '@/utils/events';
import { fetchDashboardOrderRowById } from '@/lib/dashboard-table-data';
import {
    resolveStationDetailsPanelContext,
    type StationDetailsPanelContext,
} from '@/components/station/station-details-context';

/**
 * Component that listens for shipped details events and displays the details panel
 * Used in tech and packer station pages
 */
export function StationDetailsHandler({
    viewMode = 'history',
    stationRole = 'tech',
}: {
    viewMode?: 'history' | 'pending' | 'shipped' | 'manual';
    stationRole?: 'tech' | 'packer';
}) {
    const [selectedShipped, setSelectedShipped] = useState<ShippedOrder | null>(null);
    const [panelContext, setPanelContext] = useState<StationDetailsPanelContext>('station');
    const fetchGenRef = useRef(0);

    const openOrder = useCallback(
        (order: ShippedOrder, payloadContext?: ShippedDetailsContext) => {
            setSelectedShipped(order);
            setPanelContext(resolveStationDetailsPanelContext(payloadContext, viewMode, stationRole));

            const orderId = Number(order.id);
            if (!Number.isFinite(orderId) || orderId <= 0) return;

            const gen = ++fetchGenRef.current;
            void fetchDashboardOrderRowById(orderId).then((fetched) => {
                if (gen !== fetchGenRef.current || !fetched) return;
                setSelectedShipped(fetched);
            });
        },
        [viewMode, stationRole],
    );

    const closePanel = useCallback(() => {
        fetchGenRef.current += 1;
        setSelectedShipped(null);
        dispatchCloseShippedDetails();
    }, []);

    // Listen for custom events to coordinate details panel
    useEffect(() => {
        const handleOpenDetails = (e: CustomEvent<unknown>) => {
            const payload = getOpenShippedDetailsPayload(e.detail);
            if (!payload?.order) return;
            openOrder(payload.order, payload.context);
        };
        const handleCloseDetails = () => {
            fetchGenRef.current += 1;
            setSelectedShipped(null);
        };

        window.addEventListener('open-shipped-details' as any, handleOpenDetails as any);
        window.addEventListener('close-shipped-details' as any, handleCloseDetails as any);

        return () => {
            window.removeEventListener('open-shipped-details' as any, handleOpenDetails as any);
            window.removeEventListener('close-shipped-details' as any, handleCloseDetails as any);
        };
    }, [openOrder]);

    return (
        <AnimatePresence>
            {selectedShipped && (
                <ShippedDetailsPanel
                    key="station-details-panel"
                    shipped={selectedShipped}
                    context={panelContext}
                    onClose={closePanel}
                    onUpdate={closePanel}
                />
            )}
        </AnimatePresence>
    );
}
