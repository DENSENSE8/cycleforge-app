'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { SidebarShell } from '@/components/layout/SidebarShell';
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
}: DashboardManagementPanelProps) {
  const { has } = useAuth();
  const canImportOrders = has('orders.import');

  const imp = useOrdersImport();

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
