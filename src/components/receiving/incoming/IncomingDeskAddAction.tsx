'use client';

/**
 * Inbound desk header CTA — **Add purchase order** (primary) plus Import menu.
 *
 * Opens the inline PO intake band under the Incoming grid (not a right-rail
 * form). Also consumes Global Header Add intents for Incoming.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FileText, Package, RefreshCw, RotateCcw } from '@/components/Icons';
import { DeskActionSlotRegistrar } from '@/design-system/components/DeskActionSlot';
import { DeskHeaderSplitAction } from '@/design-system/components/DeskHeaderSplitAction';
import {
  GLOBAL_ADD_INTENT_EVENT,
  consumeGlobalAddIntent,
  type GlobalAddIntent,
} from '@/lib/global-add/catalog';
import { openPoIntake } from '@/lib/inbound/po-intake-store';
import { useIncomingSyncActions } from '@/components/sidebar/receiving/incoming/useIncomingSyncActions';
import { IncomingSyncDialog } from '@/components/sidebar/receiving/IncomingSyncDialog';
import { INBOUND_RETURNS_IMPORT_DESCRIPTOR } from '@/lib/inbound/inbound-returns-import-descriptor';
import { useTableImportFilePicker } from '@/components/tables/import/TableImportFileButton';

function applyIncomingGlobalIntent(
  intent: GlobalAddIntent,
  helpers: {
    openIntake: () => void;
    armReturnsImport: () => void;
    importZoho: () => void;
    importEbay: () => void;
  },
): boolean {
  switch (intent.kind) {
    case 'incoming-add':
      if (intent.leaf === 'import-returns') {
        helpers.armReturnsImport();
        return true;
      }
      helpers.openIntake();
      return true;
    case 'incoming-import-zoho':
      helpers.importZoho();
      return true;
    case 'incoming-import-ebay':
      helpers.importEbay();
      return true;
    default:
      return false;
  }
}

export function IncomingDeskAddAction() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sync = useIncomingSyncActions();
  const returnsCsv = useTableImportFilePicker(INBOUND_RETURNS_IMPORT_DESCRIPTOR);

  const openIntake = useCallback(() => {
    openPoIntake({ reset: true });
  }, []);

  const armReturnsImport = useCallback(() => {
    returnsCsv.open();
  }, [returnsCsv]);

  const importZoho = useCallback(() => {
    void sync.refreshZoho();
  }, [sync]);

  const importEbay = useCallback(() => {
    void sync.refreshMarketplace();
  }, [sync]);

  useEffect(() => {
    const parked = consumeGlobalAddIntent();
    if (parked) {
      applyIncomingGlobalIntent(parked, {
        openIntake,
        armReturnsImport,
        importZoho,
        importEbay,
      });
    }
  }, [openIntake, armReturnsImport, importZoho, importEbay, pathname, searchParams]);

  useEffect(() => {
    const onGlobalAdd = (event: Event) => {
      const intent = (event as CustomEvent<GlobalAddIntent>).detail;
      if (!intent) return;
      if (
        intent.kind !== 'incoming-add'
        && intent.kind !== 'incoming-import-zoho'
        && intent.kind !== 'incoming-import-ebay'
      ) {
        return;
      }
      consumeGlobalAddIntent();
      applyIncomingGlobalIntent(intent, {
        openIntake,
        armReturnsImport,
        importZoho,
        importEbay,
      });
      if (pathname && !pathname.startsWith('/incoming')) {
        router.push('/incoming');
      }
    };
    window.addEventListener(GLOBAL_ADD_INTENT_EVENT, onGlobalAdd);
    return () => window.removeEventListener(GLOBAL_ADD_INTENT_EVENT, onGlobalAdd);
  }, [
    openIntake,
    armReturnsImport,
    importZoho,
    importEbay,
    pathname,
    router,
  ]);

  const control = useMemo(
    () => (
      <div className="flex shrink-0" data-testid="incoming-add-purchase-order">
        <DeskHeaderSplitAction
          tone="blue"
          icon={<Package aria-hidden className="h-3.5 w-3.5" />}
          label="Add purchase order"
          onClick={openIntake}
          menuPlacement="bottom"
          menuChrome="dropdown"
          menuLabel="More inbound intake"
          menu={[
            ...(returnsCsv.live
              ? [
                  {
                    label: 'Import returns (CSV/TSV)',
                    icon: <FileText aria-hidden className="h-3.5 w-3.5" />,
                    onClick: armReturnsImport,
                  },
                ]
              : []),
            {
              label: sync.zohoRefreshing ? 'Importing Zoho…' : 'Import Zoho POs',
              icon: <RefreshCw aria-hidden className="h-3.5 w-3.5" />,
              onClick: importZoho,
              separatorBefore: true,
            },
            {
              label: sync.marketplaceRefreshing
                ? 'Importing eBay…'
                : 'Import eBay purchases',
              icon: <RotateCcw aria-hidden className="h-3.5 w-3.5" />,
              onClick: importEbay,
            },
          ]}
          className="shrink-0"
        />
        {returnsCsv.input}
      </div>
    ),
    [
      openIntake,
      armReturnsImport,
      importZoho,
      importEbay,
      sync.zohoRefreshing,
      sync.marketplaceRefreshing,
      returnsCsv.live,
      returnsCsv.input,
    ],
  );

  return (
    <>
      <DeskActionSlotRegistrar role="primary">{control}</DeskActionSlotRegistrar>
      <IncomingSyncDialog
        open={sync.incSyncOpen}
        kind={sync.incSyncKind}
        isRunning={sync.incSyncRunning}
        elapsedMs={sync.incSyncElapsedMs}
        result={sync.incSyncResult}
        onClose={() => sync.setIncSyncOpen(false)}
      />
    </>
  );
}
