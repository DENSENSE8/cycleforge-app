'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X, PrinterAlt, DollarSign } from '../Icons';
import { SourceOrderChip, TicketChip } from '../ui/CopyChip';
import { RSRecord, type RepairTab } from '@/lib/neon/repair-service-queries';
import { RepairDetailsPanel } from './RepairDetailsPanel';
import DateRangeHeader from '@/components/ui/DateRangeHeader';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { useRepairsTable } from '@/hooks/useRepairs';
import { formatPhoneNumber } from '@/utils/phone';
import { toPSTDateKey } from '@/utils/date';
import { Button } from '@/design-system/primitives';
import { WorkbenchTablePane } from '@/components/dashboard/workbench-shell';
import { LedgerGrid } from '@/design-system/components/grid';
import { useMemo, useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { cn } from '@/utils/_cn';

interface RepairTableProps {
  filter: RepairTab;
}

export function RepairTable({ filter }: RepairTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.get('search');
  const [selectedRepair, setSelectedRepair] = useState<RSRecord | null>(null);
  const [payingRepairId, setPayingRepairId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: repairs = [], isLoading: loading, refetch: refetchRepairs } = useRepairsTable(search, filter);

  /** Open RepairDetailsPanel when landing from printed repair QR (/walk-in?openRepair=). */
  useEffect(() => {
    const raw = searchParams.get('openRepair');
    if (!raw) return;
    const openId = parseInt(raw, 10);
    if (!Number.isFinite(openId) || openId <= 0) return;
    if (loading) return;

    let cancelled = false;

    const run = async () => {
      const fromList = repairs.find((r) => r.id === openId);
      if (fromList) {
        if (!cancelled) setSelectedRepair(fromList);
      } else {
        try {
          const res = await fetch(`/api/repair-service/${openId}`);
          if (!res.ok) return;
          const data = (await res.json()) as RSRecord;
          if (!cancelled && data?.id) setSelectedRepair(data);
        } catch {
          /* ignore */
        }
      }

      if (cancelled) return;
      const next = new URLSearchParams(searchParams.toString());
      if (!next.has('openRepair')) return;
      next.delete('openRepair');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [loading, pathname, repairs, router, searchParams]);

  const handleRowClick = (repair: RSRecord) => setSelectedRepair(repair);
  const handleCloseDetails = () => setSelectedRepair(null);

  const clearSearch = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('search');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const getLast4 = (value: string | null | undefined) => {
    const raw = String(value || '');
    return raw.length > 4 ? raw.slice(-4) : raw || '---';
  };

  const parsePriceToMinorUnits = (value: string | null | undefined): number | null => {
    const cleaned = String(value || '').replace(/[^0-9.-]/g, '');
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    const amount = Math.round(parsed * 100);
    return amount > 0 ? amount : null;
  };

  const getRepairSourceSku = (repair: RSRecord): string =>
    String(repair.source_sku || '').trim();

  const canCreateSquarePayment = (repair: RSRecord): boolean =>
    Boolean(getRepairSourceSku(repair)) || parsePriceToMinorUnits(repair.price) !== null;

  const openSquarePayment = async (repair: RSRecord) => {
    if (payingRepairId === repair.id) return;
    const sourceSku = getRepairSourceSku(repair);
    const amount = parsePriceToMinorUnits(repair.price);
    if (!sourceSku && amount === null) {
      window.alert('Add a source SKU or set a valid repair price before creating a Square payment link.');
      return;
    }

    const pendingWindow = window.open('', '_blank');
    setPayingRepairId(repair.id);

    try {
      const response = await fetch('/api/repair/square-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repairId: repair.id,
          sourceSku: sourceSku || null,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        paymentUrl?: string;
        error?: string;
      };

      if (!response.ok || !payload.success || !payload.paymentUrl) {
        throw new Error(payload.error || 'Failed to create Square payment link');
      }

      if (pendingWindow) {
        pendingWindow.location.href = payload.paymentUrl;
      } else {
        window.open(payload.paymentUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      if (pendingWindow && !pendingWindow.closed) pendingWindow.close();
      const message = error instanceof Error ? error.message : 'Failed to open Square checkout';
      window.alert(message);
    } finally {
      setPayingRepairId((current) => (current === repair.id ? null : current));
    }
  };

  const filteredRepairs = repairs;

  const daySections = useMemo<[string, RSRecord[]][]>(() => {
    const groupedRepairs: Record<string, RSRecord[]> = {};
    filteredRepairs.forEach((record) => {
      if (!record.created_at) return;
      let date = '';
      try {
        date = toPSTDateKey(String(record.created_at)) || 'Unknown';
      } catch {
        date = 'Unknown';
      }
      if (!groupedRepairs[date]) groupedRepairs[date] = [];
      groupedRepairs[date].push(record);
    });
    return Object.entries(groupedRepairs).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredRepairs]);

  // Flat sorted list matching the render order (oldest date first, same order as groups)
  const flatRepairs = daySections.flatMap(([, records]) => records);

  const selectedIndex = selectedRepair
    ? flatRepairs.findIndex((r) => r.id === selectedRepair.id)
    : -1;

  const handleMoveUp = () => {
    if (selectedIndex > 0) setSelectedRepair(flatRepairs[selectedIndex - 1]);
  };

  const handleMoveDown = () => {
    if (selectedIndex < flatRepairs.length - 1) setSelectedRepair(flatRepairs[selectedIndex + 1]);
  };

  const rowActionButtonClass =
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent bg-surface-canvas text-text-faint transition-colors hover:border-border-soft disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex h-full w-full bg-surface-canvas relative">
      <WorkbenchTablePane>
        <DateRangeHeader
          count={filteredRepairs.length}
          rightSlot={
            <div className="flex items-center gap-2">
              {search && (
                <div className="flex items-center gap-2 px-2 py-0.5 bg-orange-50 text-orange-700 rounded-lg border border-orange-100">
                  <Search className="w-3 h-3" />
                  <span className="text-role-eyebrow uppercase tracking-widest">{search}</span>
                  {/* ds-raw-button: dismiss embedded inside an orange filter chip; inherits the chip hue, not a DS variant */}
                  <button
                    onClick={clearSearch}
                    className="hover:text-orange-900 transition-colors"
                    aria-label="Clear search filter"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
              {selectedRepair && (
                <Button variant="primary" size="sm" onClick={() => setSelectedRepair(null)}>
                  Close Panel
                </Button>
              )}
            </div>
          }
        />

        {/* LedgerGrid SoT — day-banded repair queue */}
        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-40 text-text-soft">
            <LoadingSpinner size="lg" className="text-blue-600" />
            <p className="text-role-micro uppercase tracking-widest">Loading Repairs...</p>
          </div>
        ) : (
          <LedgerGrid<RSRecord>
            daySections={daySections}
            showDayHeaders
            bodyRef={scrollRef}
            columnHeader={
              <div
                className={cn(
                  'grid grid-cols-[1fr_220px] items-center gap-1 border-b border-border-soft bg-surface-card py-2 text-role-micro uppercase tracking-widest text-text-soft',
                  QUEUE_ROW.px,
                )}
              >
                <span>Product</span>
                <span className="text-right">Ticket</span>
              </div>
            }
            getRowKey={(repair) => String(repair.id)}
            emptyState={
              search ? (
                <div className="mx-auto max-w-xs animate-in fade-in zoom-in duration-300">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                    <Search className="h-8 w-8 text-red-400" />
                  </div>
                  <h3 className="mb-1 text-lg font-black uppercase tracking-tight text-text-default">
                    Repair not found
                  </h3>
                  <p className="text-xs font-bold uppercase leading-relaxed tracking-widest text-text-soft">
                    We couldn&apos;t find any repairs matching &quot;{search}&quot;
                  </p>
                </div>
              ) : (
                <p className="font-medium italic text-text-soft opacity-20">No repairs found</p>
              )
            }
            isSearching={Boolean(search)}
            searchEmptyState={
              <div className="mx-auto max-w-xs animate-in fade-in zoom-in duration-300">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                  <Search className="h-8 w-8 text-red-400" />
                </div>
                <h3 className="mb-1 text-lg font-black uppercase tracking-tight text-text-default">
                  Repair not found
                </h3>
                <p className="text-xs font-bold uppercase leading-relaxed tracking-widest text-text-soft">
                  We couldn&apos;t find any repairs matching &quot;{search}&quot;
                </p>
              </div>
            }
            renderRow={(repair, index) => (
              <motion.div
                key={
                  repair.id != null
                    ? `rep-${repair.id}`
                    : `rep-${index}-${repair.ticket_number || repair.source_tracking_number || 'row'}`
                }
                {...framerPresence.tableRow}
                transition={framerTransition.tableRowMount}
                onClick={() => handleRowClick(repair)}
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleRowClick(repair);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-pressed={selectedRepair?.id === repair.id}
                aria-label={`Open repair details for ${repair.product_title || `record ${repair.id}`}`}
                className={cn(
                  'grid grid-cols-[1fr_220px] items-center gap-1 border-b border-border-hairline py-3 transition-all cursor-pointer hover:bg-blue-50/50',
                  QUEUE_ROW.px,
                  selectedRepair?.id === repair.id
                    ? 'bg-blue-50/80'
                    : index % 2 === 0
                      ? 'bg-surface-card'
                      : 'bg-surface-canvas/10',
                )}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="truncate text-sm font-black leading-tight text-text-default">
                    {repair.product_title || 'Unknown Product'}
                  </div>
                  <div className="truncate text-role-caption font-black leading-tight text-text-muted">
                    {repair.issue || repair.source_tracking_number || 'No issue specified'}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3">
                    <div className="rounded border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-role-micro text-emerald-600">
                      {repair.price ? `$${repair.price}` : '---'}
                    </div>
                    <div className="truncate text-role-micro uppercase tracking-tight text-text-muted">
                      {repair.customer_name ||
                        (() => {
                          if (!repair.contact_info) return 'No Name';
                          const parts = repair.contact_info.split(',').map((p: string) => p.trim());
                          return parts[0] || 'No Name';
                        })()}
                    </div>
                    <div className="truncate text-role-eyebrow font-bold text-text-soft">
                      {formatPhoneNumber(
                        repair.customer_phone ||
                          (() => {
                            if (!repair.contact_info) return '';
                            const parts = repair.contact_info.split(',').map((p: string) => p.trim());
                            return parts[1] || '';
                          })(),
                      )}
                    </div>
                    <div className="truncate text-role-micro font-bold lowercase text-text-default">
                      {repair.source_tracking_number ||
                        repair.customer_email ||
                        (() => {
                          if (!repair.contact_info) return '';
                          const parts = repair.contact_info.split(',').map((p: string) => p.trim());
                          return parts[2] || '';
                        })()}
                    </div>
                  </div>
                </div>
                <div className="flex w-full items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex shrink-0 flex-col items-start">
                    <SourceOrderChip
                      value={String(repair.source_order_id || '').trim() || 'WALK-IN'}
                      display={
                        String(repair.source_order_id || '').trim()
                          ? getLast4(repair.source_order_id)
                          : 'WALK-IN'
                      }
                      disableCopy={!String(repair.source_order_id || '').trim()}
                    />
                  </div>
                  <div className="flex shrink-0 flex-col items-start">
                    <TicketChip
                      value={repair.ticket_number || ''}
                      display={getLast4(repair.ticket_number)}
                    />
                  </div>
                  <HoverTooltip label="View Repair Document" focusable={false} asChild>
                    {/* ds-raw-button: table row-action icon button — fixed h-8 w-8 keeps the trailing-column alignment */}
                    <button
                      type="button"
                      onClick={() =>
                        window.open(`/api/repair-service/print/${repair.id}`, '_blank', 'noopener,noreferrer')
                      }
                      className={`${rowActionButtonClass} hover:bg-blue-50 hover:text-blue-600`}
                      aria-label="View Repair Document"
                    >
                      <PrinterAlt className="h-5 w-5" />
                    </button>
                  </HoverTooltip>
                  <HoverTooltip
                    label={
                      !canCreateSquarePayment(repair)
                        ? 'Set source SKU or valid price to enable Square payment'
                        : getRepairSourceSku(repair)
                          ? 'Create Square payment link from matching catalog SKU'
                          : 'Create Square payment link (price fallback)'
                    }
                    focusable={false}
                    asChild
                  >
                    {/* ds-raw-button: table row-action icon button — fixed h-8 w-8 keeps the trailing-column alignment */}
                    <button
                      type="button"
                      onClick={() => void openSquarePayment(repair)}
                      disabled={!canCreateSquarePayment(repair) || payingRepairId === repair.id}
                      className={`${rowActionButtonClass} hover:bg-emerald-50 hover:text-emerald-600`}
                      aria-label={
                        !canCreateSquarePayment(repair)
                          ? 'Set source SKU or valid price to enable Square payment'
                          : getRepairSourceSku(repair)
                            ? 'Create Square payment link from matching catalog SKU'
                            : 'Create Square payment link (price fallback)'
                      }
                    >
                      <DollarSign className={`h-5 w-5 ${payingRepairId === repair.id ? 'animate-pulse' : ''}`} />
                    </button>
                  </HoverTooltip>
                </div>
              </motion.div>
            )}
          />
        )}
      </WorkbenchTablePane>

      <AnimatePresence>
        {selectedRepair && (
          <RepairDetailsPanel
            repair={selectedRepair}
            onClose={handleCloseDetails}
            onUpdate={() => {
              void refetchRepairs();
            }}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            disableMoveUp={selectedIndex <= 0}
            disableMoveDown={selectedIndex < 0 || selectedIndex >= flatRepairs.length - 1}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
