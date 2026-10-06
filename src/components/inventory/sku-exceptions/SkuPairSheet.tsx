'use client';

/**
 * Pair to SKU — the stock record's action for a floor-minted `TMP-` SKU,
 * opened from the header verb (Z) or the pencil on the temporary SKU.
 *
 * Display method (owner 2026-10-05): an action, not a combobox. A tiny
 * popover hid the product photo the operator identifies the item by, so this
 * is THE house bottom sheet (`side="bottom" size="full"`): full screen on a
 * phone, a fixed-width floating card on the desk — portaled, so the record
 * underneath never moves. Its frame is the bottom-sheet action law:
 *   1. identity header — what is being paired;
 *   2. `MobileStepProgress` at the top — where the action is;
 *   3. one body per step — (1) a search with a photo list, (2) a side-by-side
 *      review of what moves and what is deleted;
 *   4. `DetailDock placement="sheet"` — the step's one primary verb in the
 *      thumb zone.
 * Pairing merges into the chosen permanent CycleForge SKU (stock, photos and
 * description move) and deletes the temporary SKU.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Link2, Pencil } from '@/components/Icons';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { MobileStepProgress } from '@/design-system/components/MobileStepProgress';
import { RecordSquarePhoto } from '@/design-system/components/record-card/RecordCardMobile';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { useRegisterOverlay } from '@/design-system/hooks';
import type { SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { cn } from '@/utils/_cn';
import { useSkuPairSearch } from './useSkuPairSearch';

const STEPS = [
  { id: 'choose', label: 'Choose the permanent SKU' },
  { id: 'review', label: 'Review and pair' },
] as const;

type PairVerb = 'change' | 'pair';

const GLYPH = 'size-4';

export function SkuPairSheet({
  open,
  onClose,
  item,
  onPaired,
}: {
  open: boolean;
  onClose: () => void;
  /** The temporary SKU; null while it loads (the opener stays disabled until then). */
  item: ProvisionalSkuDetail | null;
  /** The merge landed — the temporary SKU and this record no longer exist. */
  onPaired: () => void;
}) {
  // The record behind keeps its keys (verb letters, Escape-to-close) quiet while the action is up.
  useRegisterOverlay(open && item != null);
  // Closing hands focus back to what opened the action (the Pair verb or the
  // SKU's pair button). Read before the sheet moves focus into itself.
  const openerRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);
  return (
    <Sheet open={open && item != null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        side="bottom"
        size="full"
        className="p-0 md:max-w-xl"
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          const opener = openerRef.current;
          if (!opener?.isConnected) return;
          event.preventDefault();
          opener.focus({ preventScroll: true });
        }}
        data-testid="sku-pair-sheet"
      >
        {/* Mounted per open: every pairing starts at step 1 with a fresh search. */}
        {open && item ? (
          <SkuPairFlow
            item={item}
            onPaired={() => {
              onClose();
              onPaired();
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SkuPairFlow({ item, onPaired }: { item: ProvisionalSkuDetail; onPaired: () => void }) {
  const pairing = useSkuPairSearch(item);
  const { chosen, busy } = pairing;
  const [step, setStep] = useState(0);
  const reviewing = step === 1 && chosen != null;
  const tmpPhoto = item.photos[0]?.thumbUrl ?? null;

  const verbs: DetailDockVerb<PairVerb>[] = reviewing
    ? [
        { id: 'change', label: 'Change SKU', icon: <Pencil className={GLYPH} />, disabled: busy, testId: 'sku-pair-change' },
        {
          id: 'pair',
          label: 'Pair and delete temporary SKU',
          icon: <Link2 className={GLYPH} />,
          primary: true,
          loading: busy,
          testId: 'sku-pair-confirm',
        },
      ]
    : [];

  return (
    <>
      <SheetHeader className="shrink-0 gap-0.5 px-mode-page pb-1 pr-12 pt-4">
        <p className="text-role-caption font-semibold text-text-muted">
          Temporary SKU · <span className={RECORD_ID_CLASS}>{item.sku}</span>
        </p>
        <SheetTitle className="text-left text-role-title">Pair to SKU</SheetTitle>
        <SheetDescription className="sr-only">
          Choose the permanent SKU, review, then pair. Its stock, photos and description move there and the temporary SKU
          is deleted.
        </SheetDescription>
      </SheetHeader>
      <MobileStepProgress
        steps={STEPS}
        currentIndex={reviewing ? 1 : 0}
        onStepPress={busy ? undefined : () => setStep(0)}
        testId="sku-pair-steps"
      />

      {reviewing ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-mode-page pb-3 pt-2" data-testid="sku-pair-review">
          <PairSide
            eyebrow="Temporary SKU — deleted after pairing"
            photo={tmpPhoto}
            title={item.productTitle}
            sku={item.sku}
            tone="from"
          />
          <div className="flex justify-center py-1.5 text-text-faint" aria-hidden>
            <ArrowDown className="size-5" />
          </div>
          <PairSide eyebrow="Permanent SKU" photo={chosen.image_url} title={chosen.product_title} sku={chosen.sku} tone="to" />
          <ul className="mt-3 flex flex-col gap-1 text-role-data text-text-default" data-testid="sku-pair-moves">
            <li>
              <span className="font-semibold tabular-nums">{item.stock}</span> unit{item.stock === 1 ? '' : 's'} of stock
              move{item.stock === 1 ? 's' : ''} to {chosen.sku}
            </li>
            <li>
              <span className="font-semibold tabular-nums">{item.photoCount}</span> photo{item.photoCount === 1 ? '' : 's'}{' '}
              and the description move with {item.photoCount === 1 ? 'it' : 'them'}
            </li>
            <li className="text-text-warning">{item.sku} is deleted</li>
          </ul>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-mode-page pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <div className="flex min-w-0 items-center gap-3" data-testid="sku-pair-current">
            <RecordSquarePhoto url={tmpPhoto} size="md" alt={item.productTitle} />
            <div className="min-w-0">
              <p className="line-clamp-2 text-role-data font-semibold text-text-default">{item.productTitle}</p>
              <p className={cn(RECORD_ID_CLASS, 'text-text-muted')}>{item.sku}</p>
            </div>
          </div>
          <SearchableSelectField<SkuCatalogItem>
            presentation="inline"
            autoFocus
            className="min-h-0 flex-1"
            value={chosen?.sku ?? null}
            onChange={(value) => {
              pairing.choose(value);
              if (value != null) setStep(1);
            }}
            options={pairing.options}
            onSearchChange={pairing.setQuery}
            loading={pairing.searching}
            searchPlaceholder="Search permanent SKU or title…"
            emptyMessage={pairing.searching ? 'Searching…' : 'No permanent SKU matches.'}
            ariaLabel="Permanent SKU to pair this temporary SKU into"
            testId="sku-pair-search"
            paste={{ label: 'Paste a SKU or item ID', onPaste: pairing.setQuery }}
            renderOption={(option, { active }) => (
              <span className="flex min-w-0 flex-1 items-center gap-3 py-0.5">
                <RecordSquarePhoto url={option.data?.image_url ?? null} size="md" alt={option.meta ?? option.label} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-role-data font-medium text-text-default">{option.meta ?? option.label}</span>
                  <span className={cn(RECORD_ID_CLASS, 'block text-text-muted', active && 'text-text-info')}>{option.label}</span>
                </span>
              </span>
            )}
          />
        </div>
      )}

      {verbs.length > 0 ? (
        <DetailDock
          label="Pair to SKU actions"
          placement="sheet"
          verbs={verbs}
          onVerb={(id) => {
            if (id === 'change') setStep(0);
            else pairing.pair(onPaired);
          }}
        />
      ) : null}
    </>
  );
}

function PairSide({
  eyebrow,
  photo,
  title,
  sku,
  tone,
}: {
  eyebrow: string;
  photo: string | null;
  title: string;
  sku: string;
  tone: 'from' | 'to';
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 items-start gap-3 rounded-xl border p-3',
        tone === 'from' ? 'border-border-default bg-surface-sunken' : 'border-fill-info/40 bg-surface-card',
      )}
      data-testid={`sku-pair-${tone}`}
    >
      <RecordSquarePhoto url={photo} size="xl" alt={title} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-role-caption font-semibold', tone === 'from' ? 'text-text-warning' : 'text-text-info')}>{eyebrow}</p>
        <p className="mt-0.5 line-clamp-3 text-role-data font-semibold text-text-default">{title || sku}</p>
        <p className={cn(RECORD_ID_CLASS, 'mt-0.5 text-text-muted')}>{sku}</p>
      </div>
    </section>
  );
}
