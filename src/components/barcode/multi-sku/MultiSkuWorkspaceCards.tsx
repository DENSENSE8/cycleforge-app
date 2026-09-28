import React from 'react';
import { Search, Clipboard, Printer } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { SkeletonBase } from '@/design-system/components/Skeletons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { LabelPreviewCard } from '@/components/labels/LabelPreviewCard';
import type { ProductLabelDraft } from '@/components/labels/ProductLabelEditPopover';
import type { BarcodeMode } from '@/components/barcode/ModeSelector';
import type { ModeAccent } from './mode-accent';

/** Helper hint under the SKU field in the comfortable (horizontal) layout. */
export function comfyHelperHint(mode: BarcodeMode) {
  const text =
    mode === 'reprint'
      ? 'Scan or paste a SKU to bring up its last label.'
      : mode === 'auto-unit'
        ? 'Scan a SKU, choose a quantity, and mint trackable house unit IDs.'
      : 'Scan or paste a SKU to load product info.';
  return <p className="mt-2 text-xs text-text-soft">{text}</p>;
}

interface WorkspaceCardProps {
  label?: string;
  tone?: ModeAccent['tone'];
  children: React.ReactNode;
  actions?: React.ReactNode;
}

/** Generic white surface card used across the horizontal workspace. */
export function WorkspaceCard({ label, children, actions }: WorkspaceCardProps) {
  return (
    <section className="rounded-2xl bg-surface-card p-5 shadow-sm ring-1 ring-border-soft/60">
      {(label || actions) && (
        <div className="mb-3 flex items-center justify-between">
          {label && (
            <h3 className="text-xs font-semibold text-text-soft">{label}</h3>
          )}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

interface AutoUnitQuantityFieldProps {
  quantity: number;
  accent: ModeAccent;
  compact?: boolean;
  onChange: (quantity: number) => void;
}

/** Quantity input for minting house unit identities without OEM serials. */
export function AutoUnitQuantityField({
  quantity,
  accent,
  compact = false,
  onChange,
}: AutoUnitQuantityFieldProps) {
  return (
    <div className={compact ? 'flex items-center gap-4 border-y border-border-soft inset-field' : 'flex items-center gap-4'}>
      <div className="min-w-0 flex-1">
        <p className="text-role-caption font-semibold text-text-default">Labels to issue</p>
        <p className="mt-1 text-role-micro text-text-soft">
          Each label creates one trackable unit ID. No manufacturer serial is required.
        </p>
      </div>
      <input
        type="number"
        min={1}
        max={100}
        inputMode="numeric"
        aria-label="Number of unit labels"
        value={quantity}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? Math.max(1, Math.min(100, Math.trunc(next))) : 1);
        }}
        className={`h-11 w-24 shrink-0 rounded-xl border border-border-soft bg-surface-card text-center font-mono text-base font-semibold tabular-nums text-text-default ${accent.focusRing}`}
      />
    </div>
  );
}

interface ModernSkuFieldProps {
  value: string;
  inputRef: React.RefObject<HTMLInputElement>;
  accent: ModeAccent;
  onChange: (v: string) => void;
  onNext: () => void;
  onFillAndSearch: (v: string) => void;
}

/** SKU input + clipboard-paste + search button row. */
export function ModernSkuField({ value, inputRef, accent, onChange, onNext, onFillAndSearch }: ModernSkuFieldProps) {
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (trimmed) onFillAndSearch(trimmed);
    } catch {}
  };

  return (
    <div className="flex items-stretch gap-2">
      <div className="relative flex-1">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onNext()}
          placeholder="Scan or type a SKU…"
          autoComplete="off"
          spellCheck={false}
          className={`block h-12 w-full rounded-xl border border-border-soft bg-surface-card px-4 font-mono text-base text-text-default placeholder:text-text-faint focus:outline-none focus:ring-2 ${accent.focusRing}`}
        />
      </div>
      <HoverTooltip label="Paste from clipboard and search" asChild>
        <IconButton
          icon={<Clipboard className="h-4 w-4" />}
          onClick={handlePaste}
          ariaLabel="Paste from clipboard and search"
          className="h-12 w-12 rounded-xl border border-border-soft bg-surface-card hover:bg-surface-hover"
        />
      </HoverTooltip>
      <HoverTooltip label="Search" asChild>
        {/* ds-raw-button: solid accent CTA (renders emerald in sn-to-sku mode) */}
        <button
          type="button"
          onClick={onNext}
          aria-label="Search"
          className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white shadow-sm transition-colors ${accent.ctaBg} ${accent.ctaHover}`}
        >
          <Search className="h-4 w-4" />
          <span>Search</span>
        </button>
      </HoverTooltip>
    </div>
  );
}

interface ProductContextCardProps {
  title: string;
  stock: string;
  imageUrl?: string;
  isLoading: boolean;
}

/** Thumbnail + title + stock-level chip for the looked-up product. */
export function ProductContextCard({ title, stock, imageUrl, isLoading }: ProductContextCardProps) {
  const stockNum = parseInt(stock || '0', 10) || 0;
  const stockClass =
    stockNum <= 0
      ? 'bg-red-50 text-red-700 ring-red-200'
      : stockNum <= 5
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-emerald-50 text-emerald-700 ring-emerald-200';

  return (
    <section className="flex items-start gap-4 rounded-2xl bg-surface-card p-5 shadow-sm ring-1 ring-border-soft/60">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-canvas ring-1 ring-border-soft">
        {isLoading ? (
          <SkeletonBase className="h-full w-full rounded-none bg-surface-strong" />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <Printer className="h-5 w-5 text-text-faint" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {isLoading ? (
          <div className="space-y-2">
            <SkeletonBase width="75%" height="1rem" className="bg-surface-strong" />
            <SkeletonBase width="50%" height="0.75rem" className="bg-surface-sunken" />
          </div>
        ) : (
          <p className="text-base font-semibold leading-snug text-text-default">
            {title || <span className="italic text-text-faint">SKU not in catalog</span>}
          </p>
        )}
      </div>

      <span className={`shrink-0 rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums ring-1 ${stockClass}`}>
        {stock || '0'} <span className="text-role-micro font-semibold">stock</span>
      </span>
    </section>
  );
}

interface NotesCardProps {
  notes: string;
  showNotes: boolean;
  accent: ModeAccent;
  onToggleNotes: () => void;
  onNotesChange: (v: string) => void;
}

/** Collapsible optional notes field. */
export function NotesCard({ notes, showNotes, accent, onToggleNotes, onNotesChange }: NotesCardProps) {
  return (
    <section className="rounded-2xl bg-surface-card p-5 shadow-sm ring-1 ring-border-soft/60">
      {/* ds-raw-button: full-width text-left collapsible header row (label + ± affordance) */}
      <button
        type="button"
        onClick={onToggleNotes}
        className="flex w-full items-center justify-between text-xs font-semibold text-text-soft hover:text-text-muted"
      >
        <span>
          Notes{' '}
          {notes ? (
            <span className="ml-1 text-text-faint normal-case tracking-normal">(filled)</span>
          ) : (
            <span className="ml-1 text-text-faint normal-case tracking-normal">(optional)</span>
          )}
        </span>
        <span aria-hidden>{showNotes ? '−' : '+'}</span>
      </button>
      {showNotes && (
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Anything worth recording with this unit…"
          rows={3}
          className={`mt-3 block w-full resize-none rounded-xl border border-border-soft bg-surface-card p-3 text-sm text-text-default placeholder:text-text-faint focus:outline-none focus:ring-2 ${accent.focusRing}`}
        />
      )}
    </section>
  );
}

interface PreviewCardModernProps {
  mode: BarcodeMode;
  uniqueSku: string;
  title: string;
  serialNumbers: string[];
  condition?: string | null;
  color?: string | null;
  location: string;
  accent: ModeAccent;
  /** DataMatrix payload — same value/symbology the printed label will encode. */
  dataMatrixValue: string;
  dataMatrixSymbology: 'gs1datamatrix' | 'datamatrix';
  /** Surfaces the Edit-label pencil + custom print on the preview card. */
  onApplyAndPrint?: (draft: ProductLabelDraft) => void;
}

/** Live label preview (print/reprint) or a review summary (sn-to-sku). */
export function PreviewCardModern({
  mode,
  uniqueSku,
  title,
  serialNumbers,
  condition,
  color,
  location,
  dataMatrixValue,
  dataMatrixSymbology,
  onApplyAndPrint,
}: PreviewCardModernProps) {
  const isPrintMode = mode === 'print' || mode === 'auto-unit' || mode === 'reprint';

  if (isPrintMode) {
    return (
      <LabelPreviewCard
        sku={uniqueSku}
        title={title}
        condition={mode === 'print' || mode === 'auto-unit' ? condition : null}
        color={color}
        serialNumber={mode === 'print' ? serialNumbers[0] : null}
        dataMatrixValue={dataMatrixValue}
        dataMatrixSymbology={dataMatrixSymbology}
        onApplyAndPrint={onApplyAndPrint}
      />
    );
  }

  return (
    <section className="rounded-2xl bg-surface-card p-5 shadow-sm ring-1 ring-border-soft/60">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-soft">Review</h3>
      </div>
      <div className="space-y-2 rounded-xl bg-surface-canvas p-5 ring-1 ring-border-soft/50">
        <div>
          <p className="text-role-micro font-semibold text-text-soft">SKU</p>
          <p className="font-mono text-base font-semibold text-text-default">{uniqueSku}</p>
        </div>
        <div>
          <p className="text-role-micro font-semibold text-text-soft">
            Serials ({serialNumbers.length})
          </p>
          <p className="break-all font-mono text-xs text-text-muted">{serialNumbers.join(', ') || '—'}</p>
        </div>
        {location && (
          <div>
            <p className="text-role-micro font-semibold text-text-soft">Location</p>
            <p className="font-mono text-xs text-text-muted">{location}</p>
          </div>
        )}
      </div>
    </section>
  );
}

interface PreviewPlaceholderProps {
  mode: BarcodeMode;
  sku: string;
}

/** Empty-state shown before a SKU/serial is entered. */
export function PreviewPlaceholder({ mode, sku }: PreviewPlaceholderProps) {
  return (
    <section className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-default bg-surface-card/50 p-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken">
        <Printer className="h-5 w-5 text-text-faint" />
      </div>
      <p className="text-sm font-semibold text-text-muted">
        {mode === 'sn-to-sku' ? 'Review will appear once a serial is added' : 'Label preview will appear here'}
      </p>
      <p className="mt-1 max-w-[280px] text-xs text-text-soft">
        {sku
          ? mode === 'sn-to-sku'
            ? 'Scan at least one serial number to enable the log action.'
            : 'Generating the next unit ID for this product…'
          : 'Scan a SKU above to begin.'}
      </p>
    </section>
  );
}
