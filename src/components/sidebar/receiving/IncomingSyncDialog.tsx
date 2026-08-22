'use client';

import { motion } from '@/design-system/motion';
import { AlertTriangle, Check, Loader2, Package, RefreshCw } from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import { sectionLabel, fieldLabel, microBadge, dataValue } from '@/design-system/tokens/typography/presets';

export type IncomingSyncKind = 'zoho' | 'marketplace';

export interface SyncDialogTile {
  label: string;
  value: number;
  tone: 'emerald' | 'blue' | 'gray' | 'red';
}

export interface SyncDialogSection {
  label: string;
  /** "field: value" rows shown as a small key/value grid. */
  rows: Array<{ k: string; v: string | number }>;
}

export interface IncomingSyncResult {
  ok: boolean;
  tiles: SyncDialogTile[];
  sections: SyncDialogSection[];
  /** Carrier-style "what changed" bullets — the headline outcomes. */
  updated: string[];
  /** Error messages to list (e.g. Zoho mirror errors), if any. */
  errors: string[];
  /** Shown when nothing changed, or the failure message. */
  note: string | null;
}

interface IncomingSyncDialogProps {
  open: boolean;
  kind: IncomingSyncKind;
  isRunning: boolean;
  elapsedMs: number;
  result: IncomingSyncResult | null;
  onClose: () => void;
}

const KIND_META: Record<IncomingSyncKind, { eyebrow: string; icon: typeof RefreshCw; runningTitle: string; tone: string }> = {
  zoho: { eyebrow: 'Inventory Sync', icon: RefreshCw, runningTitle: 'Refreshing purchase orders', tone: 'text-emerald-600' },
  marketplace: { eyebrow: 'Marketplace Sync', icon: Package, runningTitle: 'Importing marketplace purchases', tone: 'text-amber-600' },
};

const TONE_MAP = {
  emerald: 'border-emerald-200 bg-emerald-50/60 text-emerald-700',
  blue: 'border-blue-200 bg-blue-50/60 text-blue-700',
  gray: 'border-border-soft bg-surface-canvas/60 text-text-muted',
  red: 'border-red-200 bg-red-50/60 text-red-700',
} as const;

function SummaryStat({ label, value, tone }: SyncDialogTile) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${TONE_MAP[tone]}`}>
      <p className={microBadge}>{label}</p>
      <p className={`${dataValue} mt-0.5 tabular-nums text-xl`}>{value}</p>
    </div>
  );
}

/**
 * Incoming Zoho / marketplace Import progress — non-modal RightRailHost
 * occupant (`detail:incoming-sync`). Same float metric as Add eBay purchase /
 * order import progress; dismiss blocked while a sync is in flight.
 *
 * **ONE band, and it is the shell's** (2026-08-21). The panel used to paint its
 * own header: a stacked `Inventory Sync` eyebrow over a `Sync complete` title,
 * a `disabled` `X` beside the elapsed float, and a footer `Close` twin under
 * the report. Three dismiss-shaped controls for the one the host already paints
 * at the flush top-right, and a two-line title where the band contract wants a
 * single current segment. It now mounts {@link DeskInspectorIndexShell} in the
 * `standalone` stance — no index routes here (the Incoming chrome opens it
 * directly), so it owes no Back and says so — with the elapsed float as the
 * band's read-only metric and the reserved host-close cell after it.
 *
 * The run status (`Refreshing purchase orders` / `Sync complete` / `Sync
 * failed`) and which connector ran are IDENTITY that does not fit one word, so
 * they lead the body rather than growing a second header line.
 */
export function IncomingSyncDialog({
  open,
  kind,
  isRunning,
  elapsedMs,
  result,
  onClose,
}: IncomingSyncDialogProps) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const status = isRunning
    ? meta.runningTitle
    : result?.ok === false
      ? 'Sync failed'
      : 'Sync complete';

  const handleClose = () => {
    if (!isRunning) onClose();
  };

  if (!open) return null;

  return (
    <DetailStackRailRegistrar
      id="detail:incoming-sync"
      onClose={handleClose}
      // `handleClose` can only decline to act; it cannot stop the host's
      // lifecycle half, which parked this panel and toasted "Draft saved."
      // over a live progress readout while the transfer kept running.
      canClose={() => !isRunning}
      modal={false}
      ariaLabel="Incoming import progress"
    >
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card"
        data-testid="incoming-sync-panel"
      >
        <DeskInspectorIndexShell
          // No index above this rail — the Incoming chrome opens it directly —
          // so it owes no Back, and declaring the stance is how it says so.
          stance="standalone"
          title="Sync"
          ariaLabel="Incoming import progress"
          testId="incoming-sync-inspector"
          headerRightSlot={
            <motion.span
              key={Math.floor(elapsedMs / 100)}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              className={`flex h-full items-center px-2 font-mono text-role-caption font-semibold tabular-nums ${meta.tone}`}
            >
              {(elapsedMs / 1000).toFixed(1)}s
            </motion.span>
          }
          body={
            <div className="px-5 py-4">
              {/* Run identity on ONE line — the band's title is the segment
                  (`Sync`); which connector ran, and how it ended, are body facts. */}
              <p className="mb-3 flex min-w-0 items-center gap-2">
                <Icon className={`h-4 w-4 shrink-0 ${meta.tone} ${isRunning ? 'animate-pulse' : ''}`} />
                <span className={`${sectionLabel} truncate text-text-default`}>{status}</span>
                <span className={`${microBadge} shrink-0 text-text-soft`}>{meta.eyebrow}</span>
              </p>
              {isRunning || !result ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-soft">
                  <Loader2 className="h-5 w-5 animate-spin text-text-faint" />
                  <p className={fieldLabel}>{meta.runningTitle}…</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {result.tiles.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {result.tiles.map((t) => (
                        <SummaryStat key={t.label} {...t} />
                      ))}
                    </div>
                  ) : null}

                  {result.updated.length > 0 ? (
                    <ul className="space-y-1">
                      {result.updated.map((line, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm font-semibold text-text-muted">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span className="tabular-nums">{line}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {result.sections.map((s) => (
                    <div key={s.label} className="overflow-hidden rounded-xl border border-border-soft">
                      <div className="border-b border-border-hairline bg-surface-canvas px-3 py-1.5">
                        <p className={`${microBadge} text-text-soft`}>{s.label}</p>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3 py-2.5">
                        {s.rows.map((r) => (
                          <div key={r.k} className="flex items-baseline justify-between gap-2">
                            <dt className={`${fieldLabel} text-text-soft`}>{r.k}</dt>
                            <dd className="text-sm font-semibold tabular-nums text-text-default">{r.v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}

                  {result.errors.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-red-200 bg-red-50/60">
                      <div className="flex items-center gap-1.5 border-b border-red-100 px-3 py-1.5 text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <p className={microBadge}>Errors</p>
                      </div>
                      <ul className="max-h-40 space-y-1 overflow-y-auto inset-field">
                        {result.errors.map((e, i) => (
                          <li key={i} className="text-role-caption font-medium text-red-700">{e}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {result.note ? (
                    <p className={`text-sm font-semibold ${result.ok ? 'text-text-soft' : 'text-red-600'}`}>
                      {result.note}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          }
        />
        {/* NO footer `Close`. The dismiss is the host's singleton `X` at the
            flush top-right, and `canClose` above already refuses it mid-run —
            which is all the old disabled footer button and header `X` did, at
            the cost of two more dismiss-shaped controls. */}
      </div>
    </DetailStackRailRegistrar>
  );
}
