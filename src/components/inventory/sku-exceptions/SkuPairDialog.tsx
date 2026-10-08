'use client';

/**
 * Pair to SKU — the stock record's action for a floor-minted `TMP-` SKU, the
 * Actions panel verb's centered picker dialog (operator 2026-10-08), the same
 * shape as Report out of stock and Pair SKU to location:
 *   1. identity — what is being paired, with its photo (the operator
 *      identifies the item by it);
 *   2. `MobileStepProgress` — where the action is;
 *   3. one body per step — (1) the search, open and focused, over a photo
 *      list; Enter picks the highlighted SKU; (2) a side-by-side review of what
 *      moves and what is deleted, with ONE confirm button, focused, so Enter
 *      pairs — the verb's own key never confirms.
 * Pairing merges into the chosen permanent CycleForge SKU (stock, photos and
 * description move) and deletes the temporary SKU; the done face says so. The
 * record is gone after the merge, so `onPaired` runs when the dialog closes.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Link2, Pencil } from '@/components/Icons';
import { MobileStepProgress } from '@/design-system/components/MobileStepProgress';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { RecordSquarePhoto } from '@/design-system/components/record-card/RecordCardMobile';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { Button } from '@/design-system/primitives/Button';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import type { SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { cn } from '@/utils/_cn';
import { useSkuPairSearch } from './useSkuPairSearch';

const STEPS = [
  { id: 'choose', label: 'Choose the permanent SKU' },
  { id: 'review', label: 'Review and pair' },
] as const;

const GLYPH = 'size-4';

export function SkuPairDialog({
  item,
  onPaired,
  done,
}: {
  item: ProvisionalSkuDetail;
  /** The merge landed — the temporary SKU and this record no longer exist. Runs as the dialog closes. */
  onPaired: () => void;
  done: () => void;
}) {
  const pairing = useSkuPairSearch(item);
  const { chosen, busy } = pairing;
  const [step, setStep] = useState(0);
  const [paired, setPaired] = useState<string | null>(null);
  const reviewing = step === 1 && chosen != null;
  const tmpPhoto = item.photos[0]?.thumbUrl ?? null;

  // Done, Escape or the close button: the record behind is gone either way.
  const pairedRef = useRef(false);
  const onPairedRef = useRef(onPaired);
  useEffect(() => {
    onPairedRef.current = onPaired;
  });
  useEffect(
    () => () => {
      if (pairedRef.current) onPairedRef.current();
    },
    [],
  );

  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (reviewing) confirmRef.current?.focus({ preventScroll: true });
  }, [reviewing]);

  if (paired) {
    return <VerbDoneState title="SKU paired" detail={`${item.sku} → ${paired}`} onDone={done} testId="sku-pair-done" />;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2" data-testid="sku-pair">
      <p className="text-role-caption font-semibold text-text-muted">
        Temporary SKU · <span className={RECORD_ID_CLASS}>{item.sku}</span>
      </p>
      <MobileStepProgress
        steps={STEPS}
        currentIndex={reviewing ? 1 : 0}
        onStepPress={busy ? undefined : () => setStep(0)}
        testId="sku-pair-steps"
      />

      {reviewing ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="sku-pair-review">
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
          <div className="flex flex-col gap-1.5 border-t border-border-soft pt-3">
            <Button
              ref={confirmRef}
              type="button"
              variant="primary"
              size="md"
              icon={<Link2 className={GLYPH} />}
              className="w-full"
              loading={busy}
              onClick={() =>
                pairing.pair(() => {
                  pairedRef.current = true;
                  setPaired(chosen.sku);
                })
              }
              data-testid="sku-pair-confirm"
            >
              Pair and delete temporary SKU
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<Pencil className={GLYPH} />}
              className="w-full"
              disabled={busy}
              onClick={() => setStep(0)}
              data-testid="sku-pair-change"
            >
              Change SKU
            </Button>
          </div>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
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
