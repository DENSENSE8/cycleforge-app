'use client';

/**
 * Print station › **Print at** — the one station picker every FNSKU print
 * shares: the open record, the select bar's Print labels and a row's Print
 * (owner 2026-10-04, handoff Phase B). Managing stations is the Stations mode.
 *
 * - Rows: this computer, the org's label default (even offline, so its
 *   outage shows), every live station, and the chosen one (a pick never
 *   hides). The rest wait behind **Show offline (N)**.
 * - A station wears the printer glyph: ink when its label printer is ready,
 *   faint when offline or unset.
 * - Row hover reveals the pencil (rename for the whole org — this computer, or
 *   any with Hardware settings) and **Make default** (Hardware settings), which
 *   sets the org's label station (FBA labels here, every label desk too —
 *   `assignment.label`); the default row is badged *Default*.
 */

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Printer, User } from '@/components/Icons';
import { InlineEditableValue } from '@/design-system/components/InlineEditableValue';
import { motion, motionContentSwap, useReducedMotion } from '@/design-system/motion';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import type { PrintStationEntry, PrintStations } from '@/hooks/usePrintStations';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { PRINT_STATION_NAME_MAX } from '@/lib/print/print-station';
import { UNNAMED_PRINT_STATION } from '@/lib/print/staff-print-bridge';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

/** What the picker reads and writes of `usePrintStations`. */
export type StationPickerPort = Pick<PrintStations, 'stations' | 'target' | 'orgAssignment' | 'setOrgAssignment' | 'canManage' | 'rename'>;

/** A row's verbs: shown on its hover / focus, always on touch. */
const ROW_VERB_REVEAL =
  'opacity-0 transition-opacity duration-150 group-hover/station:opacity-100 group-focus-within/station:opacity-100 [@media(hover:none)]:opacity-100';

const TAG_CLASS = 'shrink-0 rounded-mode-control bg-surface-card px-1.5 text-role-micro font-medium text-text-muted ring-1 ring-inset ring-border-hairline';

/**
 * Why this station cannot print a label right now; null when it can. The page
 * requires `print.label`, the same grant that publishes to any org station.
 */
export function stationBlocked(station: PrintStationEntry): string | null {
  if (station.thisComputer) return null;
  if (station.paused) return 'Paused';
  if (!station.live) return 'Offline';
  if (!station.label.ready) return 'No label printer set up';
  return null;
}

/**
 * The station a print goes to: the pick, while that computer is still in the
 * roster; a station that stops heartbeating drops out, and the target falls
 * back to the staffer's label station (this device's pick › the org default ›
 * this computer), else the first. Never written back — sending a sticker to a
 * packer's table must not move the manager's own default.
 */
export function resolvePrintStation(stations: Pick<PrintStations, 'stations' | 'target'>, chosenId: string | null): PrintStationEntry | null {
  const byId = (id: string | null) => (id ? (stations.stations.find((s) => s.stationId === id) ?? null) : null);
  return byId(chosenId) ?? byId(stations.target.label?.stationId ?? null) ?? stations.stations[0] ?? null;
}

/** This computer, then the default, then the rest in registry (name) order; offline non-default stations apart. */
function splitStations(stations: readonly PrintStationEntry[], defaultId: string | null, chosenId: string | null) {
  const rank = (s: PrintStationEntry) => (s.thisComputer ? 0 : s.stationId === defaultId ? 1 : 2);
  const shown: PrintStationEntry[] = [];
  const offline: PrintStationEntry[] = [];
  for (const s of stations) {
    (s.thisComputer || s.live || s.stationId === defaultId || s.stationId === chosenId ? shown : offline).push(s);
  }
  shown.sort((a, b) => rank(a) - rank(b));
  return { shown, offline };
}

export function StationPicker({
  port,
  chosenId,
  onChoose,
  disabled,
}: {
  port: StationPickerPort;
  chosenId: string | null;
  onChoose: (id: string) => void;
  disabled: boolean;
}) {
  const reduce = useReducedMotion();
  const [showOffline, setShowOffline] = useState(false);
  const defaultId = port.orgAssignment.label;
  const { shown, offline } = useMemo(() => splitStations(port.stations, defaultId, chosenId), [port.stations, defaultId, chosenId]);
  if (port.stations.length === 0) {
    return <p className="px-4 pb-4 text-role-caption text-text-muted">Looking for print stations…</p>;
  }
  const rows = showOffline ? [...shown, ...offline] : shown;
  return (
    <div className="flex flex-col gap-1 pb-2">
      <ul role="radiogroup" aria-label="Print at" className="flex flex-col gap-1 px-2" data-testid="fnsku-stations">
        {rows.map((station, index) => (
          <motion.li
            key={station.stationId}
            className="group/station relative"
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { ...motionContentSwap.enter, delay: Math.min(index, 8) * 0.025 }}
          >
            <StationRow
              station={station}
              chosen={station.stationId === chosenId}
              isDefault={station.stationId === defaultId}
              onChoose={() => onChoose(station.stationId)}
              disabled={disabled}
              port={port}
            />
          </motion.li>
        ))}
      </ul>
      {offline.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="mx-2 self-start"
          iconRight={<ChevronDown className={cn('transition-transform', showOffline && 'rotate-180')} />}
          aria-expanded={showOffline}
          onClick={() => setShowOffline((open) => !open)}
          data-testid="fnsku-stations-offline"
        >
          {showOffline ? 'Hide offline' : `Show offline (${offline.length})`}
        </Button>
      ) : null}
    </div>
  );
}

/** How long "Name saved" stays in the row's meta line. */
const NAME_SAVED_MS = 2_500;

/**
 * One station. The whole row is the radio (a stretched button under the
 * content); the name is the rename editor — click it on the chosen row, or
 * the pencil on any row's hover. Enter or click away saves for the whole org,
 * Esc puts it back. The meta line reports saving / saved / the refusal.
 */
function StationRow({
  station,
  chosen,
  isDefault,
  onChoose,
  disabled,
  port,
}: {
  station: PrintStationEntry;
  chosen: boolean;
  isDefault: boolean;
  onChoose: () => void;
  disabled: boolean;
  port: StationPickerPort;
}) {
  const { getStaffName } = useStaffNameMap();
  const reduce = useReducedMotion();
  const blocked = stationBlocked(station);
  const canRename = station.thisComputer || port.canManage;
  const who = station.lastSeenStaffId ? getStaffName(station.lastSeenStaffId) : null;
  // Unnamed opens blank, never pre-filled with the "Unnamed computer" filler.
  const saved = station.stationName === UNNAMED_PRINT_STATION ? '' : station.stationName;
  // null = untouched: the row follows the registry (a rename from another computer lands here too).
  const [draft, setDraft] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [defaulting, setDefaulting] = useState(false);

  const save = async () => {
    const name = (draft ?? saved).trim().slice(0, PRINT_STATION_NAME_MAX);
    if (draft === null || name === saved) {
      setDraft(null);
      return;
    }
    setRenaming('saving');
    setError(null);
    try {
      await port.rename(station.stationId, name);
      setRenaming('saved');
      window.setTimeout(() => setRenaming((now) => (now === 'saved' ? 'idle' : now)), NAME_SAVED_MS);
    } catch (failure) {
      setRenaming('idle');
      setError(failure instanceof Error ? failure.message : 'The station name was not saved.');
    } finally {
      setDraft(null);
    }
  };

  const makeDefault = async () => {
    setDefaulting(true);
    try {
      await port.setOrgAssignment('label', station.stationId);
      toast.success(`${station.stationName} is now the org's label station`);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : 'The default station was not saved.');
    } finally {
      setDefaulting(false);
    }
  };

  const meta =
    error != null
      ? { text: error, tone: 'text-text-danger' }
      : renaming === 'saving'
        ? { text: 'Saving name…', tone: 'text-text-muted' }
        : renaming === 'saved'
          ? { text: 'Name saved for everyone', tone: 'text-text-success' }
          : blocked
            ? { text: blocked, tone: 'text-text-warning' }
            : { text: station.label.printer ?? (station.thisComputer ? 'Prints here' : 'Label printer ready'), tone: '' };

  return (
    <>
      {/* ds-raw-button: the stretched radio UNDER the row's content (name editor, verbs ride above it); Button paints a face, this must not. */}
      <button
        type="button"
        role="radio"
        aria-checked={chosen}
        aria-label={`${station.stationName}${station.thisComputer ? ' (this computer)' : ''}${isDefault ? ' (default)' : ''}`}
        disabled={disabled || blocked != null}
        onClick={onChoose}
        className={cn(
          'absolute inset-0 rounded-mode-control transition-colors',
          blocked ? 'cursor-not-allowed' : chosen ? '' : 'hover:bg-surface-sunken',
          focusRing('control'),
        )}
        data-testid="fnsku-station"
        data-station-id={station.stationId}
        data-default={isDefault || undefined}
      >
        {chosen ? (
          <motion.span
            layoutId="fnsku-station-plate"
            className="absolute inset-0 rounded-mode-control bg-surface-sunken ring-2 ring-inset ring-fill-info"
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 460, damping: 36 }}
          />
        ) : null}
      </button>
      {/* Content rides above the radio and lets clicks fall through — except the name editor and the verbs. */}
      <div className="pointer-events-none relative flex min-w-0 items-center gap-3 px-3 py-2.5">
        <span
          className={cn(
            'relative flex size-8 shrink-0 items-center justify-center rounded-mode-control bg-surface-card ring-1 ring-inset ring-border-hairline',
            blocked && 'opacity-60',
          )}
        >
          <Printer className={cn('size-4', station.live && station.label.ready ? 'text-text-default' : 'text-text-faint')} data-testid="fnsku-station-glyph" />
          {/* Live dot: the station's heartbeat, not decoration. */}
          <span
            aria-hidden
            className={cn('absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-surface-card', station.live ? 'bg-fill-success' : 'bg-text-faint')}
          />
        </span>
        <span className={cn('min-w-0 flex-1', blocked && 'opacity-60')}>
          <span className="flex min-w-0 items-center gap-2">
            {canRename ? (
              <InlineEditableValue
                value={draft ?? saved}
                placeholder={UNNAMED_PRINT_STATION}
                onChange={(next) => {
                  setDraft(next);
                  setError(null);
                }}
                onSubmit={() => void save()}
                onCancel={() => setDraft(null)}
                editable={!disabled && renaming !== 'saving'}
                ariaLabel={`Rename ${station.stationName}`}
                // The chosen row's name is the editor; any other row's name still picks the row — only its pencil edits.
                className={chosen ? 'pointer-events-auto min-w-0' : 'min-w-0 [&_input]:pointer-events-auto'}
                editIconClassName={cn('pointer-events-auto', !chosen && ROW_VERB_REVEAL)}
                inputClassName="h-6 min-w-48"
              />
            ) : (
              <span className="truncate text-sm font-semibold text-text-default">{station.stationName}</span>
            )}
            {station.thisComputer ? <span className={TAG_CLASS}>This computer</span> : null}
            {station.kind === 'enrolled' ? (
              <span className={TAG_CLASS} data-testid="fnsku-station-enrolled">
                Enrolled
              </span>
            ) : null}
            {isDefault ? (
              <span className={TAG_CLASS} data-testid="fnsku-station-default">
                Default
              </span>
            ) : null}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-role-caption text-text-muted">
            {who ? (
              <>
                <User className="size-3 shrink-0" />
                <span className="truncate">{who}</span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span className={cn('flex min-w-0 items-center gap-1 truncate', meta.tone)} role={error ? 'alert' : undefined}>
              {renaming === 'saved' ? <Check className="size-3 shrink-0" /> : null}
              <span className="truncate">{meta.text}</span>
            </span>
          </span>
        </span>
        {port.canManage && !isDefault ? (
          // Floats over the row's right end on hover, so it never takes the name's width at rest.
          <Button
            variant="secondary"
            size="sm"
            className={cn('pointer-events-auto absolute right-2 top-1/2 -translate-y-1/2', !defaulting && ROW_VERB_REVEAL)}
            loading={defaulting}
            disabled={disabled}
            onClick={() => void makeDefault()}
            aria-label={`Make ${station.stationName} the org's label station`}
            data-testid="fnsku-station-make-default"
          >
            Make default
          </Button>
        ) : null}
        {chosen ? <Check className="size-4 shrink-0 text-text-info" /> : null}
      </div>
    </>
  );
}
