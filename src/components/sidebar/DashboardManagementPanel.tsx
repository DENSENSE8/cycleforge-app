'use client';

import { ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus } from '@/components/Icons';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { SearchBar } from '@/components/ui/SearchBar';
import { IconButton } from '@/design-system/primitives';
import { ShippedIntakeForm, type ShippedFormData } from '@/components/shipped';
import { useAuth } from '@/contexts/AuthContext';
import { OrderSyncDialog } from '@/components/sidebar/OrderSyncDialog';
import { containerVariants, itemVariants } from './dashboard-management/dashboard-management-shared';
import { useOrdersImport } from './dashboard-management/useOrdersImport';
import { OrdersImportCard } from './dashboard-management/OrdersImportCard';
import { SyncStatusBanner } from './dashboard-management/SyncStatusBanner';

interface DashboardManagementPanelProps {
  showIntakeForm?: boolean;
  onCloseForm?: () => void;
  onFormSubmit?: (data: ShippedFormData) => void;
  filterControl?: ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

/**
 * Dashboard sidebar management panel — an in-context list filter (local
 * SearchBar over the dashboard `?search=` param) + order import
 * (Sheets/Ecwid/exceptions). The global header pill stays global (search any
 * order across the app); the import stream lives in {@link useOrdersImport}; the
 * cards live under `./dashboard-management/`.
 */
export function DashboardManagementPanel({
  showIntakeForm = false,
  onCloseForm,
  onFormSubmit,
  filterControl,
  searchValue = '',
  onSearchChange,
}: DashboardManagementPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { has } = useAuth();
  const canImportOrders = has('orders.import');

  const imp = useOrdersImport();

  const handleOpenIntakeForm = () => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('new', 'true');
    const nextSearch = nextParams.toString();
    router.replace(nextSearch ? `${pathname || '/dashboard'}?${nextSearch}` : pathname || '/dashboard');
  };

  if (showIntakeForm) {
    return <ShippedIntakeForm onClose={onCloseForm || (() => {})} onSubmit={onFormSubmit || (() => {})} />;
  }

  return (
    <>
      <SidebarShell
        as={motion.div}
        containerProps={{ initial: 'hidden', animate: 'visible', variants: containerVariants }}
        headerAbove={
          <>
            {filterControl ? (
              <motion.div variants={itemVariants} className="relative z-20">
                {filterControl}
              </motion.div>
            ) : null}
            {/* In-context list filter — local base SearchBar over ?search=; the
                global header pill stays global (search any order app-wide). */}
            <motion.div variants={itemVariants} className={`${SIDEBAR_GUTTER} pt-4 pb-2`}>
              <SearchBar
                size="compact"
                variant="blue"
                value={searchValue}
                onChange={(v) => onSearchChange?.(v)}
                onClear={() => onSearchChange?.('')}
                placeholder="Filter order ID, tracking, SKU…"
                rightElement={
                  <HoverTooltip label="New Order Entry" asChild>
                    <IconButton
                      ariaLabel="Open new order entry form"
                      onClick={handleOpenIntakeForm}
                      className="rounded-xl bg-emerald-500 p-2.5 text-white transition-colors hover:bg-emerald-600 disabled:bg-surface-strong"
                      icon={<Plus className="h-5 w-5" />}
                    />
                  </HoverTooltip>
                }
              />
            </motion.div>
          </>
        }
        bodyClassName="flex flex-col space-y-6 scrollbar-hide pb-6"
      >
        <div className="space-y-4">
          <motion.div variants={itemVariants} className="space-y-3">
            <OrdersImportCard imp={imp} canImportOrders={canImportOrders} />
          </motion.div>

          <SyncStatusBanner status={imp.status} onDismiss={() => imp.setStatus(null)} />
        </div>
      </SidebarShell>

      <OrderSyncDialog
        open={imp.isSyncDialogOpen}
        onClose={() => imp.setIsSyncDialogOpen(false)}
        isRunning={imp.isTransferring}
        elapsedMs={imp.elapsedMs}
        onCancel={imp.handleCancelTransfer}
        sheets={imp.sheetsTask}
        ecwid={imp.ecwidTask}
        exceptions={imp.exceptionsTask}
      />
    </>
  );
}
