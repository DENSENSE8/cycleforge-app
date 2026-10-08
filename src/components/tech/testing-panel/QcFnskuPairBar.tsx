'use client';

/**
 * /test › Pair FNSKU — the dock footer's always-visible FBA verb, left of the
 * location control (operator 2026-10-08).
 *
 * One inventory SKU holds many FNSKUs, one per HOUSE grade; the unit's grade
 * (picked inline, keys 1–7) chooses which one Pass prints. The button reads
 * the pairing for (this SKU, this grade): a chain + the FNSKU when paired,
 * "Pair FNSKU" in amber when not.
 *
 * `K` opens a rounded dropdown with the best row already highlighted — the
 * FNSKU paired at this grade, else this SKU's FNSKUs, else an automatic
 * search on the product title. Nothing pairs on open: `K` again (or Enter, or
 * a click on any row) pairs the highlighted row to (SKU, grade) and prints
 * its sticker. ↑↓ choose another row; typing searches.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Package } from '@/components/Icons';
import { CopyChip } from '@/components/ui/CopyChip';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button, Panel } from '@/design-system/primitives';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import { DROPDOWN_ITEM_CORNER, DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { conditionLabel } from '@/lib/conditions';
import { fbaConditionLabel } from '@/lib/fba/fba-conditions';
import {
  qcFnskuFace,
  rankQcFnskuCandidates,
  resolveQcFnsku,
  type QcFnskuCandidate,
} from '@/lib/qc/fnsku-pairing';
import { resolveTestingLineTitle } from '@/lib/print/printProductLabel';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import {
  fetchQcFnskuCandidates,
  QC_FNSKU_CANDIDATES_KEY,
  useQcFnskuCandidates,
} from './useQcFnskuCandidates';

const SEARCH_MIN = 2;
const SEARCH_DEBOUNCE_MS = 250;

export function QcFnskuPairButton({
  row,
  grade,
  open,
  onOpenChange,
  pairNonce,
}: {
  row: ReceivingLineRow;
  /** The active unit's house grade — the pairing key with the SKU. */
  grade: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bumped by the station's `K` while the dropdown is open: pair the highlighted row. */
  pairNonce: number;
}) {
  const chipRef = useRef<HTMLButtonElement>(null);
  const title = resolveTestingLineTitle(row);
  const { candidates, isLoading } = useQcFnskuCandidates(row);
  const skuCatalogId = row.sku_catalog_id ?? null;
  const resolution = useMemo(
    () => resolveQcFnsku(candidates, skuCatalogId, grade),
    [candidates, skuCatalogId, grade],
  );

  const noCatalog = skuCatalogId == null;
  const paired = !noCatalog && !isLoading && resolution.kind === 'paired';
  const needsPair = !noCatalog && !isLoading && resolution.kind === 'unpaired';
  const gradeWords = conditionLabel(grade, 'full');

  const chipLabel = noCatalog
    ? 'Pair FNSKU — link this line to a catalog SKU first (Package Pairing).'
    : isLoading
      ? 'Checking this SKU for a paired FNSKU…'
      : resolution.kind === 'paired'
        ? `FNSKU ${resolution.candidate.fnsku} is paired to this SKU at ${gradeWords} — prints with Pass. K to change.`
        : `Pair FNSKU — nothing paired to this SKU at ${gradeWords}. K to pair.`;

  return (
    <>
      <Button
        ref={chipRef}
        type="button"
        variant="secondary"
        size="sm"
        radius="pill"
        icon={paired ? <Link2 className="size-3.5" /> : <Package className="size-3.5" />}
        title={chipLabel}
        aria-keyshortcuts="k"
        aria-expanded={open}
        aria-label={chipLabel}
        disabled={noCatalog}
        onClick={() => onOpenChange(!open)}
        data-testid="qc-fnsku-pair-chip"
        data-fnsku-state={noCatalog ? 'no-catalog' : isLoading ? 'loading' : paired ? 'paired' : 'needs-pair'}
        className={cn(paired && 'text-emerald-700', needsPair && 'text-amber-700 ring-1 ring-inset ring-amber-300')}
      >
        {paired && resolution.kind === 'paired' ? (
          <CopyChip value={resolution.candidate.fnsku} display={resolution.candidate.fnsku} tone="fnsku" />
        ) : (
          'Pair FNSKU'
        )}
      </Button>
      {open && !noCatalog ? (
        <QcFnskuPairDropdown
          row={row}
          skuCatalogId={skuCatalogId}
          title={title}
          grade={grade}
          catalogCandidates={candidates}
          pairNonce={pairNonce}
          onClose={() => onOpenChange(false)}
          chipRef={chipRef}
        />
      ) : null}
    </>
  );
}

function QcFnskuPairDropdown({
  row,
  skuCatalogId,
  title,
  grade,
  catalogCandidates,
  pairNonce,
  onClose,
  chipRef,
}: {
  row: ReceivingLineRow;
  skuCatalogId: number;
  title: string;
  grade: string;
  catalogCandidates: QcFnskuCandidate[];
  pairNonce: number;
  onClose: () => void;
  chipRef: RefObject<HTMLButtonElement | null>;
}) {
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [highlighted, setHighlighted] = useState<string>('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  // Focus the list, not the field: arrows move the highlight and the station's
  // `K` pairs it; typing a printable key hands focus to the search field.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  // A typed query searches; with none, the product title searches by itself.
  const typed = debouncedQ.length >= SEARCH_MIN ? debouncedQ : '';
  const searchQuery = useQuery({
    queryKey: [QC_FNSKU_CANDIDATES_KEY, 'search', skuCatalogId, typed || `title:${title}`],
    queryFn: () =>
      fetchQcFnskuCandidates(typed ? { skuCatalogId, q: typed } : { skuCatalogId, title }),
    staleTime: 15_000,
  });

  const rows = useMemo(() => {
    const seen = new Set(catalogCandidates.map((c) => c.fnsku));
    const merged = [...catalogCandidates, ...(searchQuery.data ?? []).filter((c) => !seen.has(c.fnsku))];
    return rankQcFnskuCandidates(merged, skuCatalogId, grade);
  }, [catalogCandidates, searchQuery.data, skuCatalogId, grade]);

  // Highlight the best row whenever the list's head changes and nothing valid is highlighted.
  const firstPairable = rows.find((c) => c.paired_to == null || c.paired_to === skuCatalogId)?.fnsku ?? '';
  useEffect(() => {
    if (!rows.some((c) => c.fnsku === highlighted)) setHighlighted(firstPairable);
  }, [rows, highlighted, firstPairable]);

  const pair = useMutation({
    mutationFn: async (candidate: QcFnskuCandidate) => {
      const res = await fetch('/api/qc/fnsku-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fnsku: candidate.fnsku, sku_catalog_id: skuCatalogId, condition_grade: grade }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Pair failed (${res.status})`);
      return candidate;
    },
    onSuccess: async (candidate) => {
      void queryClient.invalidateQueries({ queryKey: [QC_FNSKU_CANDIDATES_KEY] });
      onClose();
      try {
        // Dynamic on purpose: a static import would put bwip-js (~250 KB gz)
        // on every desk page that mounts a composer — see printFnskuStationJob.
        const m = await import('@/lib/print/fnskuLabel');
        await m.printFnskuLabelJob(qcFnskuFace(candidate, title), 1);
        toast.success(`Paired ${candidate.fnsku} at ${conditionLabel(grade, 'full')} · label printed`);
      } catch (err) {
        toast.error(err instanceof Error ? `Paired, but the label did not print: ${err.message}` : 'Paired, but the label did not print');
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pairRow = (fnsku: string) => {
    const candidate = rows.find((c) => c.fnsku === fnsku);
    if (!candidate || pair.isPending) return;
    if (candidate.paired_to != null && candidate.paired_to !== skuCatalogId) {
      toast.error(`${candidate.fnsku} is paired to another SKU`);
      return;
    }
    pair.mutate(candidate);
  };

  // The station's `K` while open: pair the highlighted row.
  const lastNonce = useRef(pairNonce);
  useEffect(() => {
    if (pairNonce === lastNonce.current) return;
    lastNonce.current = pairNonce;
    if (highlighted) pairRow(highlighted);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on the nonce only
  }, [pairNonce]);

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target === inputRef.current) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    // Printable keys start a search — except the station's own keys: K pairs,
    // 1–7 re-grade (and so re-target the pairing).
    if (event.key.length === 1 && !/^[k1-7]$/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      inputRef.current?.focus();
    }
  };

  const selected = rows.find((c) => c.fnsku === highlighted) ?? null;

  return (
    <AnchoredLayer open onClose={onClose} anchorRef={chipRef} placement="top-start" level="panelPopover" gap={8}>
      <Panel
        padding="none"
        radius="xl"
        elevation="overlay"
        className={cn('w-[440px] max-w-[min(92vw,440px)] overflow-hidden', DROPDOWN_SHELL_CORNER)}
        data-testid="qc-fnsku-dropdown"
      >
        <Command
          ref={rootRef}
          tabIndex={-1}
          shouldFilter={false}
          value={highlighted}
          onValueChange={setHighlighted}
          onKeyDown={onRootKeyDown}
          className="overflow-hidden outline-none"
        >
          <div className="flex items-baseline justify-between gap-2 px-3 pt-2.5 pb-1">
            <span className="truncate text-role-caption font-semibold text-text-default">
              Pair to {row.sku || 'this SKU'} · {conditionLabel(grade, 'full')}
            </span>
            <span className="shrink-0 text-role-caption text-text-muted">One FNSKU per grade</span>
          </div>
          <CommandInput ref={inputRef} value={q} onValueChange={setQ} placeholder="Search title, FNSKU, ASIN or SKU" />
          <CommandList className="max-h-72 p-1">
            {rows.length === 0 ? (
              <p className="px-3 py-6 text-center text-role-caption text-text-muted">
                {searchQuery.isFetching
                  ? 'Searching…'
                  : 'No FNSKU matches this title — search another word, or add it on the Print station'}
              </p>
            ) : (
              rows.map((candidate) => {
                const isTaken = candidate.paired_to != null && candidate.paired_to !== skuCatalogId;
                const pairedHere = candidate.paired_to === skuCatalogId && candidate.paired_grade === grade;
                const otherGrade =
                  candidate.paired_to === skuCatalogId && candidate.paired_grade && candidate.paired_grade !== grade
                    ? candidate.paired_grade
                    : null;
                return (
                  <CommandItem
                    key={candidate.fnsku}
                    value={candidate.fnsku}
                    disabled={isTaken}
                    data-testid="qc-fnsku-candidate"
                    data-fnsku={candidate.fnsku}
                    onSelect={() => pairRow(candidate.fnsku)}
                    className={cn('gap-2', DROPDOWN_ITEM_CORNER)}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <CopyChip value={candidate.fnsku} display={candidate.fnsku} tone="fnsku" />
                        {candidate.condition ? (
                          <span className="text-role-caption text-text-muted">{fbaConditionLabel(candidate.condition)}</span>
                        ) : null}
                        {pairedHere ? (
                          <span className="inline-flex items-center gap-1 text-role-caption font-semibold text-emerald-700">
                            <Link2 className="size-3" /> paired here
                          </span>
                        ) : otherGrade ? (
                          <span className="text-role-caption text-text-muted">
                            paired at {conditionLabel(otherGrade, 'pill')}
                          </span>
                        ) : null}
                        {isTaken ? (
                          <span className="text-role-caption font-semibold text-text-faint">on another SKU</span>
                        ) : null}
                      </span>
                      <span className="truncate text-role-data text-text-default">
                        {candidate.product_title || title}
                        {candidate.asin ? (
                          <span className="ml-1.5 text-role-caption text-text-muted">{candidate.asin}</span>
                        ) : null}
                      </span>
                    </span>
                  </CommandItem>
                );
              })
            )}
          </CommandList>
        </Command>

        <div className="flex items-center gap-3 border-t border-border-hairline px-3 py-2">
          {selected ? <QcFnskuPreview candidate={selected} title={title} /> : null}
          <p className="text-role-caption text-text-muted" data-testid="qc-fnsku-microcopy">
            {pair.isPending
              ? 'Pairing…'
              : selected
                ? `Press K again to pair ${selected.fnsku} and print · ↑↓ for another row · type to search`
                : 'Type to search for the FNSKU'}
          </p>
        </div>
      </Panel>
    </AnchoredLayer>
  );
}

/** The physical label face (drawFnskuLabel via fnskuLabelPreviewUrl) — never a second sticker renderer. */
function QcFnskuPreview({ candidate, title }: { candidate: QcFnskuCandidate; title: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Dynamic on purpose: a static import would put bwip-js (~250 KB gz) on
    // every desk page that mounts a composer — see printFnskuStationJob.
    void import('@/lib/print/fnskuLabel').then((m) => {
      // bwip-js is client-only; a failed draw still leaves a pairable row.
      try {
        if (alive) setUrl(m.fnskuLabelPreviewUrl(qcFnskuFace(candidate, title)));
      } catch {
        if (alive) setUrl(null);
      }
    });
    return () => {
      alive = false;
    };
  }, [candidate, title]);

  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element -- raster label preview, not content imagery
  return <img src={url} alt={`FNSKU label ${candidate.fnsku}`} className={cn('h-14 w-28 shrink-0 ring-1 ring-border-soft', DROPDOWN_ITEM_CORNER)} />;
}
