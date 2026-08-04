'use client';

/**
 * Incoming workbench-chrome CTAs — Check (Zoho received) · Import (blue platform
 * picker) · Add (green). Icon-only square pills (Incoming Pipeline 2026-08-04);
 * labels live in aria + HoverTooltip. Visual twin of {@link OutboundOrderChromeActions}
 * for tone; density matches Unbox triage refine.
 */

import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Plus, RefreshCw, Loader2, Package, ClipboardList } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
} from '@/components/dashboard/workbench-filter-popover';
import { WORKBENCH_CHROME_PILL_CLASS } from '@/components/dashboard/workbench-shell';
import { cn } from '@/utils/_cn';

const ICON_PILL =
  'h-8 w-8 shrink-0 gap-0 px-0 [&_span]:m-0';

export function IncomingChromeActions({
  onCheckZoho,
  onImportZoho,
  onImportEbay,
  onAdd,
  importingZoho = false,
  importingEbay = false,
  canCheckZoho = true,
  canImportZoho = true,
  canImportEbay = false,
  canAdd = true,
}: {
  /** Opens the paste → Zoho received check rail. */
  onCheckZoho: () => void;
  onImportZoho: () => void;
  onImportEbay: () => void;
  onAdd: () => void;
  importingZoho?: boolean;
  importingEbay?: boolean;
  /** Manual Zoho received check — default on for receiving.view surfaces. */
  canCheckZoho?: boolean;
  /** Inventory / Zoho PO sync — default on for receiving orgs. */
  canImportZoho?: boolean;
  /** Marketplace eBay purchase sync — when Universal Incoming + ebay connected. */
  canImportEbay?: boolean;
  /** When false, Add is hidden (missing `integrations.ebay`). */
  canAdd?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const importing = importingZoho || importingEbay;
  const hasAnyImport = canImportZoho || canImportEbay;

  const closeThen = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  return (
    <>
      {canCheckZoho ? (
        <HoverTooltip label="Check Zoho received by tracking" asChild>
          <Button
            size="sm"
            onClick={onCheckZoho}
            ariaLabel="Check Zoho received by tracking"
            icon={<ClipboardList />}
            className={cn(
              WORKBENCH_CHROME_PILL_CLASS,
              ICON_PILL,
              'bg-slate-700 shadow-sm shadow-slate-700/25 hover:bg-slate-600 active:bg-slate-800',
            )}
          />
        </HoverTooltip>
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
              title={importing ? 'Importing…' : 'Import from purchasing source'}
              className={cn(
                'ds-raw-button inline-flex items-center justify-center bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 active:scale-95 disabled:opacity-70',
                WORKBENCH_CHROME_PILL_CLASS,
                ICON_PILL,
              )}
            >
              {importing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
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
              <p className="px-2 pb-1.5 pt-0.5 text-role-micro text-text-faint">
                {canImportZoho && canImportEbay
                  ? 'Zoho pulls issued POs · eBay pulls buyer purchases'
                  : canImportZoho
                    ? 'Pull issued purchase orders into Incoming'
                    : 'Pull buyer purchases into Incoming'}
              </p>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : null}
      {canAdd ? (
        <HoverTooltip label="Add eBay purchase order" asChild>
          <Button
            size="sm"
            onClick={onAdd}
            ariaLabel="Add eBay purchase order"
            icon={<Plus />}
            className={cn(
              WORKBENCH_CHROME_PILL_CLASS,
              ICON_PILL,
              'bg-emerald-600 shadow-sm shadow-emerald-600/25 hover:bg-emerald-500 active:bg-emerald-700',
            )}
          />
        </HoverTooltip>
      ) : null}
    </>
  );
}
