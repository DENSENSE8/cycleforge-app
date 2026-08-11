'use client';

/**
 * Incoming workbench-chrome CTAs — Check (Zoho received) · Import (blue platform
 * picker + CSV) · Add (green manual inbound). Labeled solid pills
 * (`WORKBENCH_CHROME_PILL_CLASS`) — Unbox Band 1 CTA altitude.
 */

import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Plus, RefreshCw, Loader2, Package, Upload } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { PlatformMark } from '@/components/ui/PlatformMark';
import {
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
} from '@/components/dashboard/workbench-filter-popover';
import { WORKBENCH_CHROME_PILL_CLASS } from '@/components/dashboard/workbench-shell';
import { ChromeCheckButton } from '@/components/receiving/ChromeCheckButton';
import { cn } from '@/utils/_cn';

export function IncomingChromeActions({
  onCheckZoho,
  onImportZoho,
  onImportEbay,
  onImportCsv,
  onAdd,
  importingZoho = false,
  importingEbay = false,
  canCheckZoho = true,
  canImportZoho = true,
  canImportEbay = false,
  canImportCsv = true,
  canAdd = true,
}: {
  /** Opens the paste → Zoho received check rail. */
  onCheckZoho: () => void;
  onImportZoho: () => void;
  onImportEbay: () => void;
  onImportCsv: () => void;
  onAdd: () => void;
  importingZoho?: boolean;
  importingEbay?: boolean;
  /** Manual Zoho received check — default on for receiving.view surfaces. */
  canCheckZoho?: boolean;
  /** Inventory / Zoho PO sync — default on for receiving orgs. */
  canImportZoho?: boolean;
  /** Marketplace eBay purchase sync — when Universal Incoming + ebay connected. */
  canImportEbay?: boolean;
  /** CSV batch import under Import popover. */
  canImportCsv?: boolean;
  /** Manual Add inbound (purchase / return) — always on for desk operators. */
  canAdd?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const importing = importingZoho || importingEbay;
  const hasAnyImport = canImportZoho || canImportEbay || canImportCsv;

  const closeThen = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  return (
    <>
      {canCheckZoho ? (
        <ChromeCheckButton
          onClick={onCheckZoho}
          ariaLabel="Check Zoho received by tracking"
          testId="incoming-check"
        />
      ) : null}
      {hasAnyImport ? (
        <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Popover.Trigger asChild>
            {/* ds-raw-button: single child of Radix Popover.Trigger asChild — Slot clones onto this element. */}
            {/* ds-allow-title: Radix Trigger asChild — HoverTooltip would disturb the Slot clone. */}
            <button
              type="button"
              disabled={importing}
              aria-expanded={menuOpen}
              aria-label={importing ? 'Importing incoming orders' : 'Import incoming orders'}
              title={importing ? 'Importing…' : 'Import from purchasing source or CSV'}
              className={cn(
                'ds-raw-button inline-flex h-8 shrink-0 items-center gap-1.5 bg-blue-600 px-3 text-white shadow-sm transition-colors hover:bg-blue-700 active:scale-95 disabled:opacity-70',
                WORKBENCH_CHROME_PILL_CLASS,
              )}
            >
              {importing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="text-role-eyebrow uppercase tracking-widest text-white">
                {importing ? 'Syncing…' : 'Import'}
              </span>
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={6}
              className={cn(
                'z-dropdown w-64 overflow-hidden rounded-lg border border-border-soft bg-surface-card p-1 shadow-lg ring-1 ring-black/5 focus:outline-none',
              )}
            >
              <WorkbenchFilterGroupLabel>Import from</WorkbenchFilterGroupLabel>
              {canImportZoho ? (
                <WorkbenchFilterMenuRow
                  label={importingZoho ? 'Zoho…' : 'Zoho'}
                  active={importingZoho}
                  leading={
                    importingZoho ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-teal-600" />
                    ) : (
                      <Package className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                    )
                  }
                  onClick={() => {
                    if (importing) return;
                    closeThen(onImportZoho);
                  }}
                />
              ) : null}
              {canImportEbay ? (
                <WorkbenchFilterMenuRow
                  label={importingEbay ? 'eBay…' : 'eBay'}
                  active={importingEbay}
                  leading={
                    importingEbay ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-yellow-600" />
                    ) : (
                      <PlatformMark platformValue="ebay" />
                    )
                  }
                  onClick={() => {
                    if (importing) return;
                    closeThen(onImportEbay);
                  }}
                />
              ) : null}
              {canImportCsv ? (
                <WorkbenchFilterMenuRow
                  label="Upload CSV…"
                  leading={<Upload className="h-3.5 w-3.5 shrink-0 text-blue-600" />}
                  active={false}
                  onClick={() => closeThen(onImportCsv)}
                />
              ) : null}
              <p className="px-2 pb-1.5 pt-0.5 text-role-micro text-text-faint">
                Zoho / eBay pull live feeds · CSV lands purchases and returns by hand
              </p>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : null}
      {canAdd ? (
        <Button
          size="sm"
          onClick={onAdd}
          ariaLabel="Add inbound purchase or return"
          icon={<Plus />}
          className={cn(
            WORKBENCH_CHROME_PILL_CLASS,
            'font-semibold uppercase tracking-widest bg-emerald-600 shadow-sm shadow-emerald-600/25 hover:bg-emerald-500 active:bg-emerald-700',
          )}
        >
          Add
        </Button>
      ) : null}
    </>
  );
}
