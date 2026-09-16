'use client';

/**
 * Inventory › Stock — the strip's **replace** row: which product this stock
 * really is.
 *
 * One row, two directions, and the row SAYS which one it is about to do,
 * because the two writes are not the same size:
 *
 * - **pair** — the selected rows carry a floor placeholder (`TMP-…`). The
 *   press folds it into the real product warehouse-wide: every bin the
 *   placeholder ever reached and its whole ledger history are re-keyed, and the
 *   placeholder stops existing. The face says "every row, warehouse-wide" so
 *   the operator does not read the selection as the extent of the write.
 * - **swap** — the rows carry a real SKU. The press takes the stock off it and
 *   puts it on the target IN THOSE BINS, with a qty that defaults to the whole
 *   row. Nothing historical moves.
 *
 * The target list is the Zoho catalog search the intake composer uses, minus
 * the source SKU and minus every other placeholder — chaining `TMP-` onto
 * `TMP-` is a refusal both endpoints make, so it is not offered here.
 */

import { ArrowLeftRight, Sparkles } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';

import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import type { SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import type { StockSkuReplacementPlan } from '@/lib/inventory/stock-sku-replacement';
import {
  StockCommitFace,
  StockRowError,
  stockQtyDraft,
  StockStripInput,
} from './stock-verb-row-parts';

export interface StockReplaceRowProps {
  plan: StockSkuReplacementPlan;
  /** The source's face — title · SKU. */
  sourceFace: string;
  /** Catalog hits for the target picker. */
  options: readonly { value: string; label: string; meta?: string; data?: SkuCatalogItem }[];
  optionsLoading: boolean;
  onSearchChange: (query: string) => void;
  targetSku: string | null;
  onTargetChange: (sku: string | null, title: string | null) => void;
  /** A refused target (same SKU, another placeholder), printed in place. */
  targetRefusal: string | null;
  /** Swap only — blank means the whole count in each selected bin. */
  qtyDraft: string;
  onQtyDraftChange: (next: string) => void;
  qty: number | null;
  ready: boolean;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onCommit: () => void;
}

export function StockReplaceRow({
  plan,
  sourceFace,
  options,
  optionsLoading,
  onSearchChange,
  targetSku,
  onTargetChange,
  targetRefusal,
  qtyDraft,
  onQtyDraftChange,
  qty,
  ready,
  busy,
  error,
  onBack,
  onCommit,
}: StockReplaceRowProps) {
  const pairing = plan.kind === 'pair';
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={busy}>
        Back
      </Button>
      {pairing ? (
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-text-soft" aria-hidden />
      ) : (
        <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-text-soft" aria-hidden />
      )}
      {/*
        The source face TRUNCATES. A placeholder's name is operator-typed and
        its key carries a whole barcode, so the untruncated pair reads ~45
        characters and wrapped the band onto a second line — which hides the
        rows the verb is about to write.
      */}
      <span
        className="min-w-0 max-w-sm shrink truncate text-role-caption text-text-muted"
        title={sourceFace}
        data-testid="stock-replace-source"
      >
        {sourceFace} →
      </span>
      <SearchableSelectField
        value={targetSku}
        onChange={(next, option) => {
          const hit = option?.data as SkuCatalogItem | undefined;
          onTargetChange(next == null ? null : String(next), hit?.product_title ?? null);
        }}
        options={options}
        // Remote mode: the Zoho catalog is thousands of rows, so the server
        // filters and the field must stop filtering the page it was handed.
        onSearchChange={onSearchChange}
        loading={optionsLoading}
        placeholder={pairing ? 'Real product' : 'New SKU'}
        searchPlaceholder="Product title or SKU…"
        emptyMessage="No matching product"
        ariaLabel={pairing ? 'Real product to pair this placeholder into' : 'SKU to put this stock on'}
        autoFocus
        className="w-80"
        testId="stock-replace-target"
      />
      {/*
        Qty is a SWAP input only. A pairing has no quantity to choose: the
        placeholder's stock is the stock, in every bin it sits in.

        So it is DISABLED for a pairing, not unmounted. `{pairing ? null : …}`
        removed a control when the operator switched target, which moved the
        band's geometry mid-press — the failure
        `slot-table-action-bar-law.ts` forbids.
      */}
      <StockStripInput
        value={qtyDraft}
        onChange={(next) => onQtyDraftChange(stockQtyDraft(next))}
        onEnter={ready ? onCommit : undefined}
        placeholder="all"
        ariaLabel="Quantity to move onto the new SKU — blank moves the whole count"
        testId="stock-replace-qty"
        widthClass="w-16"
        numeric
        disabled={pairing}
      />
      {/* The blast radius, in words, before the press. */}
      <span className="shrink-0 text-role-caption text-text-muted" data-testid="stock-replace-scope">
        {pairing
          ? 'warehouse-wide — every bin + ledger'
          : qty == null
            ? `the whole count in ${plan.targets.length === 1 ? 'this bin' : `${plan.targets.length} bins`}`
            : `${qty} in ${plan.targets.length === 1 ? 'this bin' : `each of ${plan.targets.length} bins`}`}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {error ? (
          <StockRowError error={error} />
        ) : targetRefusal ? (
          <span role="status" className="text-role-caption text-text-muted">
            {targetRefusal}
          </span>
        ) : null}
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!ready || busy}
          data-testid="stock-replace-commit"
          onClick={onCommit}
        >
          <StockCommitFace busy={busy} label={pairing ? 'Pair' : 'Replace'} />
        </Button>
      </div>
    </>
  );
}
