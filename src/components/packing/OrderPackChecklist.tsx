'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, AlertCircle, Info, Loader2 } from '@/components/Icons';
import { evaluateKitReadiness, type PackingEnforcement } from '@/lib/packing/kit-readiness';
import type { PackChecklistLineDto } from '@/lib/packing/order-pack-checklist';
import { usePackingCheckPersist } from '@/hooks/usePackingCheckPersist';
import { ReturnScanCard } from '@/components/receiving/workspace/unmatched-items/ReturnScanCard';
import {
  DocumentSlideOver,
  type DocumentSlideItem,
} from '@/design-system/components/DocumentSlideOver';
import { PackChecklistLineRow } from './PackChecklistLineRow';

interface OrderPackChecklistProps {
  lines: PackChecklistLineDto[];
  enforcement?: PackingEnforcement;
  resetKey?: string | null;
  onBlockedChange?: (blocked: boolean) => void;
  variant?: 'station' | 'mobile' | 'panel';
  isLoading?: boolean;
  className?: string;
  /** Highlight + expand this line (e.g. after SKU scan on mobile). */
  highlightOrderRowId?: number | null;
  /**
   * Exception Path B — show Unbox Unfound-style accordion chrome titled
   * "Unknown order" when there are no checklist lines.
   */
  isUnknownOrder?: boolean;
  /** Condition chip on the unknown-order empty row. */
  unknownCondition?: string;
}

function lineKey(line: PackChecklistLineDto): string {
  return line.orderRowId > 0 ? `line-${line.orderRowId}` : `sku-${line.sku || line.productTitle}`;
}

/**
 * Order-scoped pack checklist — one accordion row per order line (SKU).
 * Collapsed: checkmark + title; expanded: catalog photo + kit parts + QC steps.
 */
export function OrderPackChecklist({
  lines,
  enforcement = 'advisory',
  resetKey,
  onBlockedChange,
  variant = 'station',
  isLoading = false,
  className,
  highlightOrderRowId,
  isUnknownOrder = false,
  unknownCondition = '—',
}: OrderPackChecklistProps) {
  const [tickedLines, setTickedLines] = useState<Set<string>>(new Set());
  const [tickedKitParts, setTickedKitParts] = useState<Set<number>>(new Set());
  const [tickedChecks, setTickedChecks] = useState<Set<number>>(new Set());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [openDocumentPartId, setOpenDocumentPartId] = useState<number | null>(null);
  const { persistTick } = usePackingCheckPersist();

  const setInSet = (
    setter: React.Dispatch<React.SetStateAction<Set<number>>>,
    id: number,
    on: boolean,
  ) =>
    setter((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  useEffect(() => {
    setTickedLines(new Set());
    setTickedKitParts(new Set());
    setTickedChecks(new Set());
    setExpandedKey(null);
    // A new order must not inherit the previous order's open insert.
    setOpenDocumentPartId(null);
  }, [resetKey]);

  useEffect(() => {
    if (highlightOrderRowId == null || highlightOrderRowId <= 0) return;
    const match = lines.find((l) => l.orderRowId === highlightOrderRowId);
    if (match) setExpandedKey(lineKey(match));
  }, [highlightOrderRowId, lines]);

  const toggleLine = (key: string) =>
    setTickedLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const confirmedPartIds = useMemo(
    () => lines.flatMap((l) => l.kitParts.filter((p) => tickedKitParts.has(p.id)).map((p) => p.id)),
    [lines, tickedKitParts],
  );

  const readiness = useMemo(
    () =>
      evaluateKitReadiness(
        lines.flatMap((l) => l.kitParts.map((p) => ({ id: p.id, critical: p.critical }))),
        confirmedPartIds,
        enforcement,
      ),
    [lines, confirmedPartIds, enforcement],
  );

  useEffect(() => {
    onBlockedChange?.(readiness.blocked);
  }, [readiness.blocked, onBlockedChange]);

  /**
   * Every insert on this ORDER, not just the one clicked — `DocumentSlideOver`
   * lists all types for a context in its switcher, so a packer comparing two
   * papers flips between them without going back to the list.
   *
   * `src` is the part's own Blob url. It is NEVER `/api/documents/:id/content`:
   * `packing.*` does not imply `orders.view`, so that proxy 403s the packer
   * (see 2026-08-01d_kit_part_reference_document.sql).
   */
  const documentItems: DocumentSlideItem[] = useMemo(
    () =>
      lines.flatMap((line) =>
        line.kitParts
          .filter((part) => part.document)
          .map((part) => ({
            id: `part-${part.id}`,
            title: part.document!.title,
            src: part.document!.url,
            mimeHint: part.document!.mime,
            emptyTitle: 'Insert unavailable',
            emptyHint: 'This part has no readable document attached.',
          })),
      ),
    [lines],
  );

  const hasDocuments = documentItems.length > 0;

  const doneCount = tickedLines.size;
  const totalCount = lines.length;

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center gap-2 rounded-none border border-border-soft bg-surface-card py-8 ${className ?? ''}`}
      >
        <Loader2 className="h-4 w-4 animate-spin text-text-faint" />
        <span className="text-role-caption font-semibold text-text-faint">Loading checklist…</span>
      </div>
    );
  }

  if (lines.length === 0) {
    if (!isUnknownOrder) return null;
    return (
      <div className={className}>
        <ReturnScanCard
          title="Unknown order"
          body="none"
          condition={unknownCondition || '—'}
          onConditionChange={() => {}}
          onAdd={() => {}}
        />
      </div>
    );
  }

  return (
    <>
      {/* Flush sheet host — clip for accordion expand; slide-over is a sibling
          so nested overflow does not crop the document preview. */}
      <div
        className={`rounded-none border border-border-soft bg-surface-card overflow-hidden ${className ?? ''}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-hairline bg-surface-canvas px-3 py-2">
          <p className="text-role-micro uppercase tracking-widest text-text-soft">Pack checklist</p>
          <span
            className={`text-role-eyebrow tabular-nums ${
              doneCount === totalCount ? 'text-emerald-600' : 'text-text-soft'
            }`}
          >
            {doneCount}/{totalCount} verified
          </span>
        </div>

        <ul>
          {lines.map((line) => {
            const key = lineKey(line);
            return (
              <PackChecklistLineRow
                key={key}
                line={line}
                checked={tickedLines.has(key)}
                expanded={expandedKey === key}
                onToggleCheck={() => toggleLine(key)}
                onToggleExpand={() => setExpandedKey((prev) => (prev === key ? null : key))}
                tickedKitParts={tickedKitParts}
                onToggleKitPart={(partId) => {
                  // Optimistic apply → quiet revert on persist failure (Phase 2).
                  // Tap on a document-bearing part is the advisory acknowledgement
                  // override (step-document-reveal-RULING §3); Print on the strip
                  // is the durable path and uses origin='print' below.
                  const nowChecked = !tickedKitParts.has(partId);
                  setInSet(setTickedKitParts, partId, nowChecked);
                  void persistTick(
                    line.orderRowId,
                    'KIT_PART',
                    partId,
                    nowChecked,
                    'acknowledgement',
                  ).then((ok) => {
                    if (!ok) setInSet(setTickedKitParts, partId, !nowChecked);
                  });
                }}
                tickedChecks={tickedChecks}
                onToggleCheckItem={(checkId) => {
                  const nowChecked = !tickedChecks.has(checkId);
                  setInSet(setTickedChecks, checkId, nowChecked);
                  void persistTick(line.orderRowId, 'PACKING_CHECK', checkId, nowChecked).then((ok) => {
                    if (!ok) setInSet(setTickedChecks, checkId, !nowChecked);
                  });
                }}
                variant={variant}
                onOpenPartDocument={hasDocuments ? setOpenDocumentPartId : undefined}
                onPrintPartDocument={
                  hasDocuments
                    ? (partId) => {
                        const part = line.kitParts.find((p) => p.id === partId);
                        const src = part?.document?.url;
                        // Open the slide-over so the packer can confirm the
                        // paper, and fire the browser spool in parallel — the
                        // print intent is the durable evidence for an insert.
                        setOpenDocumentPartId(partId);
                        if (src) {
                          const w = window.open(src, '_blank', 'noopener,noreferrer');
                          w?.addEventListener('load', () => {
                            try {
                              w.print();
                            } catch {
                              /* cross-origin — operator uses browser print */
                            }
                          });
                        }
                        if (!tickedKitParts.has(partId)) {
                          setInSet(setTickedKitParts, partId, true);
                          void persistTick(
                            line.orderRowId,
                            'KIT_PART',
                            partId,
                            true,
                            'print',
                          ).then((ok) => {
                            if (!ok) setInSet(setTickedKitParts, partId, false);
                          });
                        }
                      }
                    : undefined
                }
              />
            );
          })}
        </ul>

        {readiness.requiredTotal > 0 ? (
          <div
            className={`flex items-center gap-1.5 border-t px-3 py-2 text-role-eyebrow font-semibold ${
              readiness.allRequiredIn
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : readiness.blocked
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  : 'border-amber-100 bg-amber-50 text-amber-700'
            }`}
          >
            {readiness.allRequiredIn ? (
              <>
                <Check className="h-3.5 w-3.5 shrink-0" />
                All required items in the box
              </>
            ) : readiness.blocked ? (
              <>
                <Info className="h-3.5 w-3.5 shrink-0" />
                {readiness.missingRequiredIds.length} required to include
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {readiness.missingRequiredIds.length} required not confirmed
              </>
            )}
          </div>
        ) : null}
      </div>

      {hasDocuments ? (
        <DocumentSlideOver
          open={openDocumentPartId != null}
          onClose={() => setOpenDocumentPartId(null)}
          title="Inserts"
          items={documentItems}
          activeId={openDocumentPartId != null ? `part-${openDocumentPartId}` : undefined}
          onActiveIdChange={(id) => {
            const partId = Number(id.replace('part-', ''));
            if (Number.isFinite(partId)) setOpenDocumentPartId(partId);
          }}
          storageKey="pack-inserts-slide-over-width"
          aria-label="Pack inserts preview"
        />
      ) : null}
    </>
  );
}
