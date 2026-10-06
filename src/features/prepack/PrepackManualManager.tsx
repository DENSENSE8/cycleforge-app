'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, Link2, Unlink, Upload } from '@/components/Icons';
import { ArmedDangerButton } from '@/design-system/components/ArmedDangerButton';
import { DocumentSlideOver } from '@/design-system/components/DocumentSlideOver';
import { AnimatePresence, motion } from '@/design-system/motion';
import { motionPresence } from '@/design-system/foundations/motion-presets';
import { useMotionPresence } from '@/design-system/foundations/motion-presets-hooks';
import { Button, Popover, TextField } from '@/design-system/primitives';
import { productManualContentPath } from '@/lib/blob/vercel-blob-url';
import type { PrepackKit, PrepackManual } from '@/lib/prepack/types';
import {
  linkPrepackManual,
  prepackErrorText,
  removePrepackManual,
  searchPrepackManuals,
  uploadPrepackManual,
} from './prepack-client';

/** Where a manual is used today, one fact per line — what the operator checks before pairing. */
function usageLines(manual: PrepackManual): string[] {
  const { usage } = manual;
  const lines = [
    usage.sku ? `SKU ${usage.sku}${usage.productTitle ? ` — ${usage.productTitle}` : ''}` : null,
    usage.itemNumber ? `Item number ${usage.itemNumber}` : null,
    usage.orderId ? `Order ${usage.orderLabel || usage.orderId}` : null,
  ].filter((line): line is string => Boolean(line));
  if (lines.length === 0) return [usage.status === 'archived' ? 'Archived — not printed for any product' : 'Not paired to any product'];
  return lines;
}

function ManualCard({
  manual,
  onPreview,
  children,
  testId,
}: {
  manual: PrepackManual;
  onPreview: () => void;
  children?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="space-y-2 rounded-mode-control border border-mode-rule bg-surface-card p-3" data-testid={testId}>
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 size-4 shrink-0 text-text-muted" />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-mode-ink">{manual.title}</p>
          <p className="break-words text-role-caption text-text-muted">
            {[manual.type, manual.fileName].filter(Boolean).join(' · ') || 'Manual'}
          </p>
        </div>
      </div>
      <div className="space-y-0.5">
        <p className="text-role-caption font-semibold text-text-muted">Used by</p>
        <ul className="space-y-0.5">
          {usageLines(manual).map((line) => (
            <li key={line} className="break-words text-role-caption text-mode-ink">{line}</li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="secondary" size="sm" icon={<FileText />} onClick={onPreview}>
          Preview
        </Button>
        <Button variant="ghost" size="sm" icon={<ExternalLink />} href={productManualContentPath(manual.id)}>
          Open
        </Button>
        {children}
      </div>
    </div>
  );
}

/**
 * The product's manual, managed in one place — the Contents group's Manual
 * popover and the context column both mount it. See exactly where a manual
 * is used before pairing it; preview it; pair, unpair, delete or upload.
 * Packers print the paired manual when they scan the QC label.
 */
export function PrepackManualManager({ kit, onKit }: { kit: PrepackKit; onKit: (kit: PrepackKit) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PrepackManual[]>([]);
  /** The query the shown results answer; null while a search is in flight or failed. */
  const [answered, setAnswered] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | 'upload' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PrepackManual | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const row = useMotionPresence(motionPresence.findListRow);
  const paired = kit.manual;

  useEffect(() => {
    const q = query.trim();
    setSearchError(null);
    setAnswered(null);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchPrepackManuals(q, controller.signal)
        .then((items) => {
          setResults(items);
          setAnswered(q);
        })
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return;
          setResults([]);
          setSearchError(prepackErrorText(cause, 'Could not search the manual library'));
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const run = async (id: number | 'upload', write: () => Promise<PrepackKit>, fallback: string) => {
    setBusyId(id);
    setError(null);
    try {
      onKit(await write());
      setQuery('');
    } catch (cause) {
      setError(prepackErrorText(cause, fallback));
    } finally {
      setBusyId(null);
    }
  };

  const catalogId = kit.catalog.id;
  const candidates = results.filter((manual) => manual.id !== paired?.id);

  return (
    <div className="space-y-4" data-testid="prepack-manual-manager">
      <section className="space-y-2" aria-label="Paired manual">
        <h4 className="text-role-caption font-semibold text-text-muted">Paired manual</h4>
        {paired ? (
          <ManualCard manual={paired} onPreview={() => setPreview(paired)} testId="prepack-manual-paired">
            <Button
              variant="ghost"
              size="sm"
              icon={<Unlink />}
              loading={busyId === paired.id}
              onClick={() => void run(paired.id, () => removePrepackManual(catalogId, { manualId: paired.id, mode: 'unpair' }), 'Could not unpair the manual')}
              data-testid="prepack-manual-unpair"
            >
              Unpair
            </Button>
            <ArmedDangerButton
              size="sm"
              label="Delete"
              confirmLabel="Delete manual?"
              onConfirm={() => run(paired.id, () => removePrepackManual(catalogId, { manualId: paired.id, mode: 'delete' }), 'Could not delete the manual')}
            />
          </ManualCard>
        ) : (
          <p className="text-role-caption text-text-muted">No manual paired — packers print no manual for {kit.catalog.sku}.</p>
        )}
      </section>

      <section className="space-y-2" aria-label="Find a manual">
        <h4 className="text-role-caption font-semibold text-text-muted">{paired ? 'Replace with another manual' : 'Pair a manual'}</h4>
        <TextField label="Find a manual — title, SKU or item number" value={query} onChange={setQuery} autoComplete="off" data-testid="prepack-manual-search" />
        <ul className="space-y-2" aria-label="Manual matches">
          <AnimatePresence initial={false}>
            {candidates.map((manual) => {
              const elsewhere = manual.usage.skuCatalogId != null && manual.usage.skuCatalogId !== catalogId;
              return (
                <motion.li key={manual.id} initial={row.initial} animate={row.animate} exit={row.exit}>
                  <ManualCard manual={manual} onPreview={() => setPreview(manual)}>
                    <Button
                      variant="primarySoft"
                      size="sm"
                      icon={<Link2 />}
                      loading={busyId === manual.id}
                      onClick={() => void run(manual.id, () => linkPrepackManual(catalogId, manual.id), 'Could not pair that manual')}
                      data-testid="prepack-manual-pair"
                    >
                      {elsewhere ? 'Move here' : 'Pair here'}
                    </Button>
                  </ManualCard>
                  {elsewhere ? (
                    <p className="mt-1 text-role-caption text-text-warning">
                      Pairing moves it off {manual.usage.sku ?? 'its current product'} — that product's packers stop getting it.
                    </p>
                  ) : null}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        {searchError ? (
          <p role="alert" className="break-words text-role-caption font-semibold text-text-danger">{searchError}</p>
        ) : query.trim().length >= 2 && answered == null ? (
          <p className="text-role-caption text-text-muted">Searching the manual library…</p>
        ) : answered && candidates.length === 0 ? (
          <p className="text-role-caption text-text-muted">No other manual matches “{answered}”.</p>
        ) : null}
      </section>

      {/* ds-raw-button: the OS file picker needs a native file input; it stays hidden and the Button below is the visible control (house pattern, UploadManualModal). */}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void run('upload', () => uploadPrepackManual(catalogId, file), 'Could not upload the manual');
        }}
      />
      <Button variant="secondary" size="md" icon={<Upload />} loading={busyId === 'upload'} className="w-full" onClick={() => fileRef.current?.click()}>
        Upload a manual for {kit.catalog.sku}
      </Button>
      {error ? <p role="alert" className="text-role-caption font-semibold text-text-danger">{error}</p> : null}

      <DocumentSlideOver
        open={preview != null}
        onClose={() => setPreview(null)}
        title="Manual preview"
        items={preview ? [{ id: String(preview.id), title: preview.title, src: productManualContentPath(preview.id), meta: usageLines(preview).join(' · ') }] : []}
        activeId={preview ? String(preview.id) : undefined}
        showPrint={false}
        storageKey="prepack-manual-slide-over-width"
      />
    </div>
  );
}

/** The Manual row's trigger: the paired manual's title (or "Pair a manual"), opening the manager as a popover. */
export function PrepackManualPopover({ kit, onKit }: { kit: PrepackKit; onKit: (kit: PrepackKit) => void }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={anchorRef}
        variant={kit.manual ? 'ghost' : 'secondary'}
        size="md"
        icon={<FileText />}
        className="h-auto min-h-10 max-w-full justify-start whitespace-normal text-left"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        data-testid="prepack-manual-trigger"
      >
        {kit.manual ? kit.manual.title : 'Pair a manual'}
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} placement="bottom-start" gap={6} padded className="max-h-96 w-96 max-w-full overflow-y-auto">
        <PrepackManualManager kit={kit} onKit={onKit} />
      </Popover>
    </>
  );
}
