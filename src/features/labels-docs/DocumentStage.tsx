'use client';

/**
 * The open label's documents — the record's main column. Top: the label, then
 * the paired order's packing slips and manuals, as one inline strip; a chip
 * previews its document, its checkbox puts it in the next print. Below: the
 * locked frame — the active document exactly as it prints, at its stock's
 * proportion (4×6 label, letter paperwork). The frame never unmounts: the last
 * document stays painted until the next is rastered.
 */

import { useEffect, useState } from 'react';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Checkbox } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { rasterizeDocument, type LabelPages } from '@/lib/label-prints/label-raster';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import { STOCK_PAPER } from '@/lib/label-prints/print-route';
import { cn } from '@/utils/_cn';
import type { DeskDocumentsState } from './use-desk-documents';

const KIND_LABEL: Record<DeskDocument['kind'], string> = { label: 'Label', packing_slip: 'Packing slip', manual: 'Manual' };

export function DocumentStage({
  paired,
  state,
  activeKey,
  onActivate,
  included,
  onInclude,
}: {
  /** The open label is on an order (so it can carry paperwork). */
  paired: boolean;
  state: DeskDocumentsState;
  activeKey: string | null;
  onActivate: (key: string) => void;
  included: ReadonlySet<string>;
  onInclude: (key: string, next: boolean) => void;
}) {
  const active = state.documents.find((doc) => doc.key === activeKey) ?? state.documents[0] ?? null;
  const [shown, setShown] = useState<{ key: string; stockId: string; pages: LabelPages } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    const paper = STOCK_PAPER[active.stock];
    rasterizeDocument(active.src, paper).then(
      (pages) => {
        if (!live) return;
        setShown({ key: active.key, stockId: paper.id, pages });
        setFailure(null);
      },
      (error: unknown) => {
        if (live) setFailure({ key: active.key, message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [active]);

  const rendering = active != null && shown?.key !== active.key && failure?.key !== active.key;
  const letter = shown?.stockId === 'letter';
  const status = state.loading
    ? 'Reading the order’s paperwork…'
    : state.error
      ? state.error
      : paired
        ? `${state.documents.length} printable · check what goes in the next print`
        : 'No order yet — pair the label to bring its packing slip and manuals.';

  return (
    <RecordGroup title="Documents" testId="document-stage">
      {/* Inline document selection — preview on click, print on check. */}
      <div role="toolbar" aria-label="Documents for this label" className="flex flex-wrap items-stretch gap-1.5 px-4 pt-1">
        {state.documents.map((doc) => {
          const isActive = doc.key === active?.key;
          return (
            <div
              key={doc.key}
              className={cn(
                'flex items-stretch rounded-mode-control border',
                isActive ? 'border-mode-frame bg-mode-well' : 'border-mode-divide bg-mode-panel',
              )}
            >
              <label className="flex items-center pl-2" title="Include in the next print">
                <Checkbox
                  checked={included.has(doc.key)}
                  onCheckedChange={(next) => onInclude(doc.key, next === true)}
                  aria-label={`Print ${doc.title}`}
                />
              </label>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onActivate(doc.key)}
                className={cn('flex min-h-mode-hit max-w-64 flex-col items-start justify-center rounded-mode-control px-2 text-left', focusRing('control'))}
              >
                <span className={cn(RECORD_LABEL_CLASS, 'text-mode-faint')}>
                  {KIND_LABEL[doc.kind]} · {doc.stock === 'label' ? '4×6' : 'Letter'}
                </span>
                <span className="max-w-full truncate text-role-caption font-semibold text-mode-ink">{doc.title}</span>
              </button>
            </div>
          );
        })}
        {state.unprintable.map((doc) => (
          <span
            key={doc.key}
            className="flex min-h-mode-hit flex-col justify-center rounded-mode-control border border-dashed border-mode-divide px-2"
            title="Stored on Drive only — upload the file to print it here"
          >
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-faint')}>Manual · Drive only</span>
            <span className="max-w-48 truncate text-role-caption text-mode-faint">{doc.title}</span>
          </span>
        ))}
      </div>
      <p className="px-4 pb-2 pt-1.5 text-role-caption text-mode-muted">{status}</p>

      {/* The locked frame: the page at its stock's proportion, pages scroll inside it. */}
      <div className="relative flex justify-center border-t border-mode-divide bg-mode-well p-4" data-testid="document-frame">
        <div
          className={cn(
            'relative flex w-full flex-col overflow-y-auto border border-mode-frame bg-white shadow-sm',
            letter ? 'aspect-[17/22] max-w-xl' : 'aspect-[2/3] max-w-sm',
          )}
        >
          {shown ? (
            shown.pages.map((src, index) => (
              // eslint-disable-next-line @next/next/no-img-element -- a data-URL raster, not a remote asset
              <img
                key={index}
                src={src}
                alt={`Page ${index + 1}`}
                className={cn('block h-full w-full shrink-0 object-contain', index > 0 && 'border-t border-dashed border-mode-divide')}
              />
            ))
          ) : (
            <p className={cn(RECORD_LABEL_CLASS, 'm-auto text-mode-faint')}>{active ? 'Rendering' : 'No document'}</p>
          )}
        </div>
        {rendering && shown ? (
          <span className={cn(RECORD_LABEL_CLASS, 'absolute right-3 top-3 rounded-mode-control border border-mode-divide bg-mode-panel px-1.5 py-0.5 text-mode-muted')}>
            Rendering
          </span>
        ) : null}
        {shown && shown.pages.length > 1 ? (
          <span className={cn(RECORD_LABEL_CLASS, 'absolute left-3 top-3 rounded-mode-control border border-mode-divide bg-mode-panel px-1.5 py-0.5 text-mode-muted')}>
            {shown.pages.length} pages · scroll
          </span>
        ) : null}
        {failure && failure.key === active?.key ? (
          <p role="alert" className="absolute inset-x-3 bottom-3 rounded-mode-control border border-mode-divide bg-mode-panel px-3 py-2 text-role-caption text-text-danger">
            {failure.message}
          </p>
        ) : null}
      </div>
    </RecordGroup>
  );
}
