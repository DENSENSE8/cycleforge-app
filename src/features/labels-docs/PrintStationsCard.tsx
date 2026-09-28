'use client';

/**
 * Print stations — the rail card that says WHERE each stock prints (owner
 * 2026-09-27: two identified stations, two stocks):
 *
 *   Labels     → Thermal bench · 4×6        ● online
 *   Paperwork  → Packing bench · Letter     ● online
 *
 * Each row picks its station from the roster (this computer, the org's
 * registered stations, the computers signed in as you). The pick is this
 * staffer's, on this device; "Make org default" pins it for every desk.
 */

import { Check, ChevronDown } from '@/components/Icons';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import type { PrintStationEntry, PrintStations } from '@/hooks/usePrintStations';
import type { PrintStock } from '@/lib/label-prints/print-route';
import { UNNAMED_PRINT_STATION } from '@/lib/print/staff-print-bridge';
import { cn } from '@/utils/_cn';

const STOCK_FACE: Record<PrintStock, { term: string; size: string }> = {
  label: { term: 'Labels', size: '4×6' },
  paper: { term: 'Paperwork', size: 'Letter' },
};

const WHEN = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** What the card reads and writes of `usePrintStations`. */
export type PrintStationsPort = Pick<PrintStations, 'stations' | 'target' | 'orgAssignment' | 'pick' | 'setOrgAssignment'>;

/** Online / offline / never heard — the dot and its words agree. */
export function stationHealth(station: PrintStationEntry | null, stock: PrintStock): { tone: 'ok' | 'warn' | 'off'; words: string } {
  if (!station) return { tone: 'off', words: 'No station' };
  if (station.thisComputer) return { tone: 'ok', words: 'This computer' };
  if (!station.live) {
    return { tone: 'off', words: station.lastSeenAt ? `Offline · seen ${WHEN.format(station.lastSeenAt)}` : 'Offline' };
  }
  return station[stock].ready ? { tone: 'ok', words: 'Online' } : { tone: 'warn', words: `No ${stock === 'label' ? 'label' : 'paper'} printer` };
}

const DOT: Record<'ok' | 'warn' | 'off', string> = { ok: 'bg-fill-success', warn: 'bg-fill-warning', off: 'bg-text-faint' };

/** A station's name; unnamed computers are told apart by the tail of their id. */
function stationName(station: PrintStationEntry): string {
  return station.stationName === UNNAMED_PRINT_STATION && !station.thisComputer
    ? `${station.stationName} ·${station.stationId.slice(-4)}`
    : station.stationName;
}

/** One-line face of where a stock goes: "Thermal bench · 4×6". */
export function stationFace(station: PrintStationEntry | null, stock: PrintStock): string {
  return `${station ? stationName(station) : 'No station'} · ${STOCK_FACE[stock].size}`;
}

function StationRow({ stock, port }: { stock: PrintStock; port: PrintStationsPort }) {
  const target = port.target[stock];
  const health = stationHealth(target, stock);
  const orgId = port.orgAssignment[stock];
  const isOrgDefault = target != null && orgId === target.stationId;
  const face = STOCK_FACE[stock];
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid={`print-station-${stock}`}>
      <span className={cn(RECORD_LABEL_CLASS, 'w-[5.5rem] shrink-0 text-mode-faint')}>{face.term}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            radius="control"
            className="min-w-0 flex-1 justify-between"
            data-testid={`print-station-${stock}-pick`}
            aria-label={`${face.term} print station: ${stationFace(target, stock)}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[health.tone])} />
              <span className="truncate">{stationFace(target, stock)}</span>
            </span>
            <ChevronDown className="size-4 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <DropdownMenuLabel>{face.term} print to</DropdownMenuLabel>
          {port.stations.map((station) => {
            const row = stationHealth(station, stock);
            return (
              <DropdownMenuItem
                key={station.stationId}
                onSelect={() => port.pick(stock, station.stationId)}
                data-testid={`print-station-${stock}-option`}
              >
                <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[row.tone])} />
                <span className="min-w-0 flex-1 truncate">{stationName(station)}</span>
                <span className="shrink-0 text-xs text-text-muted">{row.words}</span>
                {target?.stationId === station.stationId ? <Check className="size-4 shrink-0" /> : null}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!target || isOrgDefault}
            onSelect={() => {
              if (target) void port.setOrgAssignment(stock, target.stationId);
            }}
            data-testid={`print-station-${stock}-org`}
          >
            {isOrgDefault ? 'Org default for every desk' : 'Make this the org default'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => port.pick(stock, null)}>Use the org default</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="w-24 shrink-0 truncate text-role-caption text-mode-muted" title={health.words}>
        {health.words}
      </span>
    </div>
  );
}

export function PrintStationsCard({ port }: { port: PrintStationsPort }) {
  return (
    <RecordGroup title="Print stations" testId="print-stations-card">
      <div className="flex flex-col gap-2 px-4 pb-3 pt-1">
        <StationRow stock="label" port={port} />
        <StationRow stock="paper" port={port} />
      </div>
    </RecordGroup>
  );
}
