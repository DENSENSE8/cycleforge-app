'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, Check, Loader2, Package, RefreshCw } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
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
 * Result dialog for Incoming Zoho / marketplace Import — single-shot
 * (non-streaming) progress + result. Same visual language (Dialog shell,
 * eyebrow + title header, summary stat tiles, breakdown sections, footer) as
 * other sync result shells.
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
  const title = isRunning
    ? meta.runningTitle
    : result?.ok === false
      ? 'Sync failed'
      : 'Sync complete';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isRunning) onClose();
      }}
    >
      <DialogContent
        hideClose
        className="max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-2xl"
      >
        <DialogHeader className="flex flex-row items-start gap-3 space-y-0 border-b border-border-soft px-5 py-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Icon className={`h-4 w-4 ${meta.tone} ${isRunning ? 'animate-pulse' : ''}`} />
            <div className="min-w-0">
              <DialogDescription className={`${microBadge} text-text-soft`}>
                {meta.eyebrow}
              </DialogDescription>
              <DialogTitle className={`${sectionLabel} mt-0.5 text-text-default`}>
                {title}
              </DialogTitle>
            </div>
          </div>
          <motion.span
            key={Math.floor(elapsedMs / 100)}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            className={`shrink-0 text-role-caption font-mono font-semibold tabular-nums ${meta.tone}`}
          >
            {(elapsedMs / 1000).toFixed(1)}s
          </motion.span>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {isRunning || !result ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-soft">
              <Loader2 className="h-5 w-5 animate-spin text-text-faint" />
              <p className={fieldLabel}>{meta.runningTitle}…</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {result.tiles.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {result.tiles.map((t) => (
                    <SummaryStat key={t.label} {...t} />
                  ))}
                </div>
              ) : null}

              {/* Headline "what changed" bullets. */}
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

              {/* Per-leg breakdown (Issued sync / Mirror sync / Scan). */}
              {result.sections.map((s) => (
                <div key={s.label} className="overflow-hidden rounded-xl border border-border-soft">
                  <div className="border-b border-border-hairline bg-surface-canvas px-3 py-1.5">
                    <p className={`${microBadge} text-text-soft`}>{s.label}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3 py-2.5 sm:grid-cols-3">
                    {s.rows.map((r) => (
                      <div key={r.k} className="flex items-baseline justify-between gap-2">
                        <dt className={`${fieldLabel} text-text-soft`}>{r.k}</dt>
                        <dd className="text-sm font-semibold tabular-nums text-text-default">{r.v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}

              {/* Error list (e.g. Zoho mirror errors). */}
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

        <DialogFooter className="border-t border-border-soft bg-surface-canvas px-5 py-2.5 sm:justify-end">
          <Button
            variant="brand"
            size="sm"
            onClick={onClose}
            disabled={isRunning}
          >
            {isRunning ? 'Running…' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
