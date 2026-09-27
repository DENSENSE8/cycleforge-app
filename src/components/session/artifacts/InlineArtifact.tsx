'use client';

/**
 * InlineArtifact — DATA in the chat column (the display rule,
 * `artifact-placement.ts`).
 *
 * A table renders right under the question, design-system quiet: a header
 * built from the TOOL's data (the resolved product title in bold, then
 * click-to-copy chips for its SKU / FNSKU / bins), then a card whose top bar
 * names the result ("Bin contents · 1 SKU") and carries icon-only controls at
 * its right — Copy · Download CSV · Expand — above the rows: every row up to
 * {@link INLINE_TABLE_FULL_ROWS}, else the first {@link INLINE_TABLE_PREVIEW_ROWS}
 * and "Show all N rows". Show all / Expand open the entry in the right panel.
 *
 * Records, charts, timelines and reports render their panel renderer inline
 * in the same card, with the same controls.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Download, Maximize2 } from '@/components/Icons';
import { CHIP_TONES, type ChipTone } from '@/components/ui/CopyChip';
import {
  AI_FOCUS_CLASS,
  AI_ID_CHIP_CLASS,
  AiTurnActions,
  aiPresence,
  aiTransition,
  useAiActionStates,
  useMotionPresence,
  useMotionTransition,
  type AiTurnAction,
} from '@/design-system/ai';
import { motion } from '@/design-system/motion';
import { recordCopy } from '@/lib/clipboard-history';
import { writeClipboardText } from '@/lib/clipboard';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { idColumnKind, type AnswerIdKind } from '@/lib/assistant/answer-emphasis';
import { INLINE_TABLE_FULL_ROWS, INLINE_TABLE_PREVIEW_ROWS, type InlineArtifactData } from '@/lib/assistant/artifact-placement';
import type { ArtifactTable } from '@/lib/assistant/ui-artifacts';
import { copyArtifact, downloadTableCsv } from './artifact-export';
import type { ArtifactSummary } from './artifact-summary';
import { ChartArtifact, RecordArtifact, ReportArtifact, TimelineArtifact, cellText, rowLookup } from './renderers';
import { OrderDraftArtifact } from './OrderDraftArtifact';
import { PoDraftArtifact } from './PoDraftArtifact';

/** An identifier kind → the house chip tone that paints it (`CopyChip`'s registry). */
const TONE_BY_KIND: Readonly<Record<AnswerIdKind, ChipTone>> = {
  SKU: 'sku',
  FNSKU: 'fnsku',
  UPC: 'sku',
  Bin: 'bin',
  LPN: 'serial',
  Order: 'id',
  Tracking: 'tracking',
  Serial: 'serial',
  PO: 'id',
  Email: 'id',
  Phone: 'id',
};

/** How long the ✓ holds after a copy. */
const COPIED_MS = 1600;

/**
 * A click-to-copy identifier: mono value, the house tone glyph, ✓ + "Copied
 * <value>" on click (and into the clipboard history, like every id chip).
 * A `<button>`, so it sits inside a prose paragraph as well as a header row.
 */
export function AnswerIdChip({ value, kind, showKind = false }: { value: string; kind: AnswerIdKind; showKind?: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const tone = CHIP_TONES[TONE_BY_KIND[kind]];
  return (
    <button
      type="button"
      title={`Copy ${value}`}
      aria-label={`Copy ${kind} ${value}`}
      data-copy-id={value}
      data-copied={copied || undefined}
      onClick={() => {
        if (!writeClipboardText(value)) {
          toast.error('Copy failed — the browser blocked the clipboard');
          return;
        }
        recordCopy(value, { kind: TONE_BY_KIND[kind], display: value });
        setCopied(true);
        toast.success(`Copied ${value}`);
      }}
      className={cn('ds-raw-button', AI_ID_CHIP_CLASS, AI_FOCUS_CLASS)}
    >
      {showKind ? <span className="font-sans text-ai-label text-ai-faint">{kind}</span> : null}
      <span
        aria-hidden
        className={cn('inline-flex h-3 w-3 shrink-0 [&_svg]:h-3 [&_svg]:w-3', copied ? 'text-text-success' : tone.iconClass)}
      >
        {copied ? <Check /> : tone.icon}
      </span>
      <span className="min-w-0 truncate">{value}</span>
    </button>
  );
}

export function InlineArtifact({
  artifact,
  summary,
  open,
  onExpand,
}: {
  artifact: InlineArtifactData;
  summary: ArtifactSummary;
  /** This entry is the one open in the right panel. */
  open: boolean;
  onExpand: () => void;
}) {
  const router = useRouter();
  const states = useAiActionStates();
  const presence = useMotionPresence(aiPresence.turn);
  const transition = useMotionTransition(aiTransition.turn);
  const identity = artifact.kind === 'table' || artifact.kind === 'record' ? artifact.identity : undefined;

  // Icon-only, top-right of the card: Copy (TSV / record lines) · Download CSV · Expand.
  const controls: AiTurnAction[] = [];
  if (artifact.kind === 'table' || artifact.kind === 'record') {
    controls.push({
      id: 'copy',
      label: artifact.kind === 'table' ? 'Copy table' : 'Copy record',
      hint: artifact.kind === 'table' ? 'Copy table (pastes as spreadsheet cells)' : 'Copy record',
      icon: <Copy className="h-3.5 w-3.5" />,
      onClick: () => states.set('copy', copyArtifact(artifact) ? 'done' : 'error'),
      state: states.get('copy'),
    });
  }
  if (artifact.kind === 'table') {
    controls.push({
      id: 'csv',
      label: 'Download CSV',
      icon: <Download className="h-3.5 w-3.5" />,
      onClick: () => states.set('csv', downloadTableCsv(artifact) ? 'done' : 'error'),
      state: states.get('csv'),
    });
  }
  controls.push({
    id: 'expand',
    label: 'Expand',
    hint: 'Open on the right',
    icon: <Maximize2 className="h-3.5 w-3.5" />,
    pressed: open,
    onClick: onExpand,
  });

  return (
    <motion.section
      {...presence}
      transition={transition}
      aria-label={summary.title}
      data-inline-artifact={artifact.kind}
      className="flex min-w-0 flex-col gap-2"
    >
      <header className="flex min-w-0 flex-col gap-1.5">
        <h3 className="min-w-0 text-ai-title font-semibold text-ai-ink" data-inline-title>
          {summary.title}
        </h3>
        {identity?.subtitle ? (
          <p className="min-w-0 truncate text-ai-prose-sm text-ai-muted" data-identity-subtitle>
            {identity.subtitle}
          </p>
        ) : null}
        {identity && (identity.ids.length > 0 || identity.chips?.length || identity.href) ? (
          <div className="flex flex-wrap items-center gap-1.5" data-identity-ids>
            {identity.chips?.map((chip) => (
              <span
                key={`chip:${chip}`}
                className="inline-flex items-center rounded-ai-control border border-ai-line bg-ai-sunken px-1.5 py-px text-ai-label text-ai-muted"
                data-identity-chip
              >
                {chip}
              </span>
            ))}
            {identity.ids.map((id) => (
              <AnswerIdChip key={`${id.label}:${id.value}`} value={id.value} kind={id.label} showKind />
            ))}
            {identity.href ? (
              <a
                href={identity.href}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                  event.preventDefault();
                  router.push(identity.href as string);
                }}
                className={cn(
                  'inline-flex items-center gap-1 text-ai-label font-medium text-ai-muted underline-offset-2 hover:text-ai-ink hover:underline',
                  AI_FOCUS_CLASS,
                )}
                data-identity-open
              >
                Open record
              </a>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="min-w-0 overflow-hidden rounded-ai-card border border-ai-line bg-ai-surface">
        <div className="flex items-center justify-between gap-2 border-b border-ai-line py-0.5 pl-3 pr-1">
          <span className="min-w-0 truncate text-ai-label text-ai-faint">
            {[summary.kind, summary.count].filter(Boolean).join(' · ')}
          </span>
          <AiTurnActions actions={controls} visible ariaLabel="Result actions" className="ml-0" />
        </div>
        {artifact.kind === 'table' ? (
          <InlineTable artifact={artifact} onShowAll={onExpand} />
        ) : artifact.kind === 'order_draft' ? (
          <OrderDraftArtifact artifact={artifact} />
        ) : artifact.kind === 'po_draft' ? (
          <PoDraftArtifact artifact={artifact} />
        ) : (
          <div className="max-h-[28rem] min-w-0 overflow-auto">
            {artifact.kind === 'record' ? (
              <RecordArtifact artifact={artifact} onOpen={(path) => router.push(path)} />
            ) : artifact.kind === 'chart' ? (
              <ChartArtifact artifact={artifact} />
            ) : artifact.kind === 'timeline' ? (
              <TimelineArtifact artifact={artifact} />
            ) : (
              <ReportArtifact artifact={artifact} />
            )}
          </div>
        )}
      </div>
    </motion.section>
  );
}

/** Every column's cells are numbers (or blank) → right-aligned, tabular. */
function numericColumns(columns: readonly string[], lookups: ReadonlyArray<ReturnType<typeof rowLookup>>): Set<string> {
  const numeric = new Set<string>();
  for (const column of columns) {
    const values = lookups.map((lookup) => lookup(column)).filter((v) => v !== null && v !== '');
    if (values.length > 0 && values.every((v) => typeof v === 'number')) numeric.add(column);
  }
  return numeric;
}

function InlineTable({ artifact, onShowAll }: { artifact: ArtifactTable; onShowAll: () => void }) {
  const total = artifact.rows.length;
  const lookups = useMemo(() => artifact.rows.map((row) => rowLookup(row)), [artifact.rows]);
  const numeric = useMemo(() => numericColumns(artifact.columns, lookups), [artifact.columns, lookups]);
  const shown = total > INLINE_TABLE_FULL_ROWS ? lookups.slice(0, INLINE_TABLE_PREVIEW_ROWS) : lookups;
  if (total === 0) return <p className="text-ai-prose-sm text-ai-muted">No rows.</p>;
  return (
    <div className="min-w-0" data-inline-table>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-ai-prose-sm">
          <thead className="bg-ai-sunken">
            <tr>
              {artifact.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-3 py-1.5 text-ai-label font-medium text-ai-muted',
                    numeric.has(column) && 'text-right',
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((lookup, i) => {
              return (
                <tr key={i} className="border-t border-ai-line">
                  {artifact.columns.map((column) => {
                    const value = lookup(column);
                    const kind = idColumnKind(column);
                    return (
                      <td
                        key={column}
                        className={cn(
                          'px-3 py-1.5 align-middle text-ai-ink',
                          numeric.has(column) && 'text-right tabular-nums',
                          kind && 'whitespace-nowrap',
                        )}
                      >
                        {value === null || value === '' ? (
                          <span className="text-ai-faint">—</span>
                        ) : kind && typeof value === 'string' ? (
                          <AnswerIdChip value={value} kind={kind} />
                        ) : (
                          cellText(value)
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {total > INLINE_TABLE_FULL_ROWS ? (
        <button
          type="button"
          onClick={onShowAll}
          data-show-all
          className={cn(
            'ds-raw-button flex w-full items-center justify-center gap-1.5 border-t border-ai-line py-2 text-ai-label font-medium text-ai-muted transition-colors duration-150 hover:bg-ai-hover hover:text-ai-ink',
            AI_FOCUS_CLASS,
          )}
        >
          Show all {total.toLocaleString()} rows
        </button>
      ) : null}
    </div>
  );
}
