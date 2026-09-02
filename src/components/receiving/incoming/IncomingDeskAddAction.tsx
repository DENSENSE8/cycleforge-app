'use client';

/**
 * Inbound desk header CTA — **Add purchase order** plus bulk Import menu.
 *
 * Pressed face swaps the Incoming sheet for the record walk (exceptions / Labels).
 */

import { useCallback, useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FileText, Package, RefreshCw, RotateCcw, X } from '@/components/Icons';
import { DeskActionSlotRegistrar } from '@/design-system/components/DeskActionSlot';
import { SlicedActionDock } from '@/design-system/primitives';
import {
  GLOBAL_ADD_INTENT_EVENT,
  consumeGlobalAddIntent,
  type GlobalAddIntent,
} from '@/lib/global-add/catalog';
import { useIncomingSyncActions } from '@/components/sidebar/receiving/incoming/useIncomingSyncActions';
import { IncomingSyncDialog } from '@/components/sidebar/receiving/IncomingSyncDialog';
import { INBOUND_RETURNS_IMPORT_DESCRIPTOR } from '@/lib/inbound/inbound-returns-import-descriptor';
import { useTableImportFilePicker } from '@/components/tables/import/TableImportFileButton';
import {
  parseIncomingIntake,
  writeIncomingIntake,
  type IncomingIntakeKind,
} from '@/lib/inbound/incoming-intake';
import { INCOMING_SURFACE_ROUTE } from '@/lib/receiving/surface-path';

function applyIncomingGlobalIntent(
  intent: GlobalAddIntent,
  helpers: {
    openIntake: (kind: IncomingIntakeKind) => void;
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
      helpers.openIntake(intent.leaf === 'add-return' ? 'return' : 'po');
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
  const intakeKind = parseIncomingIntake(searchParams.get('intake'));
  const addInboundOpen = intakeKind != null;

  const patchIntake = useCallback(
    (kind: IncomingIntakeKind | null) => {
      const params = new URLSearchParams(searchParams.toString());
      writeIncomingIntake(params, kind);
      const qs = params.toString();
      const base = pathname || INCOMING_SURFACE_ROUTE;
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const toggleIntake = useCallback(() => {
    patchIntake(addInboundOpen ? null : 'po');
  }, [addInboundOpen, patchIntake]);

  const openIntake = useCallback(
    (kind: IncomingIntakeKind) => {
      patchIntake(kind);
    },
    [patchIntake],
  );

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
      if (pathname && !pathname.startsWith(INCOMING_SURFACE_ROUTE)) {
        const leaf = intent.kind === 'incoming-add' && intent.leaf === 'add-return'
          ? 'return'
          : 'po';
        const intake =
          intent.kind === 'incoming-add' && intent.leaf !== 'import-returns' ? leaf : null;
        router.push(
          intake
            ? `${INCOMING_SURFACE_ROUTE}?intake=${intake}`
            : INCOMING_SURFACE_ROUTE,
        );
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
      <div className="shrink-0" data-testid="incoming-add-purchase-order">
        <SlicedActionDock
          embedded
          embeddedChrome="header"
          tone="blue"
          icon={addInboundOpen ? <X aria-hidden className="h-3.5 w-3.5" /> : <Package aria-hidden className="h-3.5 w-3.5" />}
          label={addInboundOpen ? 'Close add purchase order' : 'Add purchase order'}
          onClick={toggleIntake}
          pressed={addInboundOpen}
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
      toggleIntake,
      armReturnsImport,
      importZoho,
      importEbay,
      sync.zohoRefreshing,
      sync.marketplaceRefreshing,
      returnsCsv.live,
      returnsCsv.input,
      addInboundOpen,
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
