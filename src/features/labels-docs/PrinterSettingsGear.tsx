'use client';

/**
 * Printer settings gear — one icon in a pane header that opens THIS
 * workstation's print settings where the operator is printing: an anchored
 * popover on a wide viewport, a bottom sheet on a narrow one.
 *
 *   Silent printing                              [on]
 *   Shipping labels · 4×6
 *   ● Thermal bench                     Change  Test
 *     Online · Zebra GK420
 *   Paperwork · Letter
 *   ● Packing bench                          Change
 *     Online
 *   Print stations settings
 *
 * It owns no settings: the silent switch and the thermal test are
 * `usePrinterConnect` (the Printers rail card's logic), the station per stock
 * and the org default are `usePrintStations` (the Print stations card's). A
 * change repaints every mounted reader through their window events.
 */

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Printer, Settings } from '@/components/Icons';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button, IconButton, Switch } from '@/design-system/primitives';
import { Popover } from '@/design-system/primitives/Popover';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { useIsMobile } from '@/hooks/_ui';
import { usePrintStations, type PrintStations } from '@/hooks/usePrintStations';
import type { PrintStock } from '@/lib/label-prints/print-route';
import { PRINT_STATION_PATHS } from '@/lib/nav/route-tree';
import { cn } from '@/utils/_cn';
import { STATION_DOT_CLASS, stationHealth, stationName } from './PrintStationsCard';
import { usePrintRoutes } from './use-print-routes';
import { usePrinterConnect, type PrinterConnect } from './use-printer-connect';

const STOCK_HEADING: Record<PrintStock, string> = {
  label: 'Shipping labels · 4×6',
  paper: 'Paperwork · Letter',
};

const HEADING_CLASS = cn(RECORD_LABEL_CLASS, 'text-mode-faint');
const PANEL_TITLE = 'Printer settings';

/** Where one stock prints: the station, its state, Change (inline picker), Test where this computer can. */
function StockSection({
  stock,
  stations,
  printers,
  onError,
}: {
  stock: PrintStock;
  stations: PrintStations;
  printers: PrinterConnect;
  onError: (message: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const target = stations.target[stock];
  const health = stationHealth(target, stock);
  const blocked = stations.blockedReason(stock);
  const orgId = stations.orgAssignment[stock];
  const isOrgDefault = target != null && orgId === target.stationId;
  const printer = target?.[stock].printer ?? null;
  const name = target ? stationName(target) : 'No station';
  const detail = [blocked ?? health.words, printer, isOrgDefault ? 'Org default' : null].filter(Boolean).join(' · ');
  // Only a label on THIS computer's raw thermal printer has a test that needs no document.
  const canTest = stock === 'label' && target?.thisComputer === true && printers.thermal != null;
  const showUseOrg = orgId != null && !isOrgDefault;
  const showMakeOrg = stations.canManage && target != null && !isOrgDefault;

  const makeOrgDefault = async () => {
    if (!target) return;
    setAssigning(true);
    onError(null);
    try {
      await stations.setOrgAssignment(stock, target.stationId);
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : 'The org default was not saved.');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <section className="flex min-w-0 flex-col gap-1" data-testid={`printer-settings-${stock}`}>
      <h3 className={HEADING_CLASS}>{STOCK_HEADING[stock]}</h3>
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden className={cn('size-2 shrink-0 rounded-full', STATION_DOT_CLASS[blocked && target ? 'warn' : health.tone])} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-role-caption font-medium text-mode-ink" title={name}>
            {name}
          </span>
          <span className={cn('truncate text-role-caption', blocked ? 'text-text-warning' : 'text-mode-muted')} title={detail}>
            {detail}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
          data-testid={`printer-settings-${stock}-change`}
        >
          Change
        </Button>
        {stock === 'label' ? (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            icon={<Printer />}
            disabled={!canTest || printers.busy}
            title={canTest ? `Print a test sticker on ${printers.thermal?.name}` : 'Test needs a 4×6 printer connected to this computer'}
            onClick={() => void printers.test()}
            data-testid="printer-settings-label-test"
          >
            Test
          </Button>
        ) : null}
      </div>
      {picking ? (
        <ul className="flex min-w-0 flex-col" aria-label={`${STOCK_HEADING[stock]} print station`}>
          {stations.stations.map((station) => {
            const row = stationHealth(station, stock);
            const current = target?.stationId === station.stationId;
            const label = stationName(station);
            return (
              <li key={station.stationId} className="min-w-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full min-w-0 justify-start"
                  aria-pressed={current}
                  title={`${label} · ${row.words}`}
                  onClick={() => {
                    stations.pick(stock, station.stationId);
                    setPicking(false);
                  }}
                  data-testid={`printer-settings-${stock}-option`}
                >
                  <span aria-hidden className={cn('size-2 shrink-0 rounded-full', STATION_DOT_CLASS[row.tone])} />
                  <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                  {current ? <Check className="size-4 shrink-0" /> : null}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {showUseOrg || showMakeOrg ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {showUseOrg ? (
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => stations.pick(stock, null)} data-testid={`printer-settings-${stock}-use-org`}>
              Use org default
            </Button>
          ) : null}
          {showMakeOrg ? (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              loading={assigning}
              onClick={() => void makeOrgDefault()}
              data-testid={`printer-settings-${stock}-make-org`}
            >
              Make org default
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** The panel body; mounted only while open, so the station roster polls only then. */
function PrinterSettingsPanel() {
  const stations = usePrintStations();
  const printers = usePrinterConnect(usePrintRoutes());
  const [error, setError] = useState<string | null>(null);
  const message = error ?? printers.status;

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="printer-settings-panel">
      <label className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-role-caption font-medium text-mode-ink">Silent printing</span>
        <Switch
          checked={printers.silent}
          onCheckedChange={printers.setSilent}
          aria-label="Silent printing"
          className="shrink-0"
          data-testid="printer-settings-silent"
        />
      </label>
      <StockSection stock="label" stations={stations} printers={printers} onError={setError} />
      <StockSection stock="paper" stations={stations} printers={printers} onError={setError} />
      {message ? (
        <p aria-live="polite" className={cn('text-role-caption', error ? 'text-text-danger' : 'text-mode-muted')}>
          {message}
        </p>
      ) : null}
      <Link
        href={PRINT_STATION_PATHS.stations}
        className={cn('self-start truncate text-role-caption font-medium text-text-muted hover:text-text-default', focusRing('control'))}
        data-testid="printer-settings-stations-link"
      >
        Print stations settings
      </Link>
    </div>
  );
}

export function PrinterSettingsGear({ className }: { className?: string }) {
  const gearRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const narrow = useIsMobile();

  return (
    <>
      <IconButton
        ref={gearRef}
        icon={<Settings className="size-4" />}
        ariaLabel="Printer and silent-print settings"
        title={PANEL_TITLE}
        size="md"
        radius="control"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className={className}
        data-testid="printer-settings-gear"
      />
      {narrow ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              gearRef.current?.focus({ preventScroll: true });
            }}
          >
            <SheetHeader>
              <SheetTitle>{PANEL_TITLE}</SheetTitle>
            </SheetHeader>
            <SheetBody>{open ? <PrinterSettingsPanel /> : null}</SheetBody>
          </SheetContent>
        </Sheet>
      ) : (
        <Popover
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={gearRef}
          placement="bottom-end"
          gap={4}
          role="group"
          aria-label={PANEL_TITLE}
          className="w-80 max-w-[calc(100vw-1rem)] p-3"
        >
          <PrinterSettingsPanel />
        </Popover>
      )}
    </>
  );
}
