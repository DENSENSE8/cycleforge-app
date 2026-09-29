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
 *
 * Names are the org's (the registry owns them): anyone names the computer
 * they sit at; Hardware settings names any computer. A rename reaches every
 * picker, phone and print log at the station's next heartbeat.
 */

import { useState } from 'react';
import { Check, ChevronDown, Pencil } from '@/components/Icons';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  TextField,
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
export type PrintStationsPort = Pick<
  PrintStations,
  'stations' | 'target' | 'orgAssignment' | 'pick' | 'setOrgAssignment' | 'canRenameOthers' | 'rename'
>;

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

/**
 * A station's name with a pencil: Enter saves for the whole org, Esc cancels.
 * Empty resets it to unnamed. The server's refusal (a taken name, no right to
 * rename another computer) shows under the field.
 */
function StationName({ station, port, testId }: { station: PrintStationEntry; port: PrintStationsPort; testId: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canRename = station.thisComputer || port.canRenameOthers;
  const unnamed = station.stationName === UNNAMED_PRINT_STATION;

  const save = async () => {
    if (draft == null || saving) return;
    setSaving(true);
    try {
      await port.rename(station.stationId, draft);
      setDraft(null);
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The name was not saved.');
    } finally {
      setSaving(false);
    }
  };

  if (draft != null) {
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <TextField
          label={station.thisComputer ? 'Name this computer' : `Rename ${stationName(station)}`}
          value={draft}
          onChange={setDraft}
          maxLength={40}
          autoFocus
          disabled={saving}
          data-testid={`${testId}-input`}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void save();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setDraft(null);
              setError(null);
            }
          }}
          onBlur={() => void save()}
        />
        {error ? (
          <p role="alert" className="text-role-caption text-text-danger" data-testid={`${testId}-error`}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <span className={cn('min-w-0 truncate text-role-caption', unnamed ? 'text-mode-muted' : 'text-mode-ink')} data-testid={testId}>
        {unnamed && station.thisComputer ? 'Unnamed — name it so desks can find it' : stationName(station)}
      </span>
      {canRename ? (
        <IconButton
          icon={<Pencil className="size-3.5" />}
          ariaLabel={station.thisComputer ? 'Name this computer' : `Rename ${stationName(station)}`}
          title="Rename for the whole org"
          size="xs"
          radius="control"
          onClick={() => setDraft(unnamed ? '' : station.stationName)}
          data-testid={`${testId}-rename`}
        />
      ) : null}
    </div>
  );
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
  const self = port.stations.find((station) => station.thisComputer) ?? null;
  // Remote targets can be renamed here too (Hardware settings), once each.
  const remote = [port.target.label, port.target.paper].filter(
    (station, index, all): station is PrintStationEntry =>
      station != null && !station.thisComputer && all.findIndex((other) => other?.stationId === station.stationId) === index,
  );
  return (
    <RecordGroup title="Print stations" testId="print-stations-card">
      <div className="flex flex-col gap-2 px-4 pb-3 pt-1">
        {self ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn(RECORD_LABEL_CLASS, 'w-[5.5rem] shrink-0 text-mode-faint')}>This computer</span>
            <StationName station={self} port={port} testId="print-station-self-name" />
          </div>
        ) : null}
        <StationRow stock="label" port={port} />
        <StationRow stock="paper" port={port} />
        {port.canRenameOthers
          ? remote.map((station) => (
              <div key={station.stationId} className="flex min-w-0 items-center gap-2">
                <span className={cn(RECORD_LABEL_CLASS, 'w-[5.5rem] shrink-0 text-mode-faint')}>Station</span>
                <StationName station={station} port={port} testId={`print-station-name-${station.stationId}`} />
              </div>
            ))
          : null}
      </div>
    </RecordGroup>
  );
}
