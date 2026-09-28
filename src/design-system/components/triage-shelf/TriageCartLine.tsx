'use client';

/**
 * The intake line's identity — ONE face for the desk (`/orders/new`) and the
 * phone (`/m/orders/new`): photo, two-line title, the "Repair service" tag and
 * the facts in one fixed order (`cartLineFacts`: SKU · Item # · stock · bin).
 * The same line reads the same on the cart and on Team, on both surfaces;
 * only the controls around it differ (typed on the desk, thumbed on a phone).
 *
 * `ConditionChipFace` is the To-ship ledger's condition chip face (grade tone,
 * tag glyph, table label) — the phone's tap target and the desk's
 * `LedgerCondition` paint the same chip.
 */

import type { ReactNode } from 'react';
import { Package, Tag } from '@/components/Icons';
import { RECORD_CONDITION_CHIP_CLASS } from '@/design-system/tokens/industrial-record';
import { conditionGradeTone } from '@/lib/condition-tone';
import { conditionGradeTableLabel, EMPTY_META_DASH } from '@/lib/conditions';
import { cn } from '@/utils/_cn';
import { TRIAGE_SHELF_META, TRIAGE_SHELF_TAG, TRIAGE_SHELF_TITLE } from './triage-shelf-tokens';

export const TRIAGE_REPAIR_TAG_LABEL = 'Repair service';

export interface TriageLineIdentityProps {
  title: string;
  /** Ordered identity facts — `cartLineFacts(line)`. */
  facts: readonly string[];
  /** A repair-service line (`…-RS`): wears the tag, has no condition. */
  repair?: boolean;
  /** `md` — with the photo (cart); `sm` — text only (Team). */
  size?: 'md' | 'sm';
  imageUrl?: string | null;
  /** Prefixes the title with `N ×` (Team reads the quantity it assigns). */
  quantity?: number;
  /** Right edge — the remove control on a cart line. */
  trailing?: ReactNode;
  repairTestId?: string;
}

export function TriageLineIdentity({
  title,
  facts,
  repair = false,
  size = 'md',
  imageUrl = null,
  quantity,
  trailing,
  repairTestId,
}: TriageLineIdentityProps) {
  const name = title.trim() || 'Untitled line';
  return (
    <div className="flex items-start gap-3">
      {size === 'md' ? (
        imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- catalog photos are remote, unsized thumbnails
          <img src={imageUrl} alt="" className="size-12 shrink-0 rounded-mode-control bg-mode-well object-cover" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-mode-control bg-mode-well text-mode-muted">
            <Package className="size-5" aria-hidden />
          </span>
        )
      ) : null}
      <div className="min-w-0 flex-1">
        <p className={TRIAGE_SHELF_TITLE}>
          {quantity != null ? <span className="tabular-nums">{quantity} × </span> : null}
          {name}
        </p>
        {repair || facts.length > 0 ? (
          <p className={cn('mt-0.5 flex min-w-0 items-center gap-1.5', TRIAGE_SHELF_META)}>
            {repair ? (
              <span className={TRIAGE_SHELF_TAG} data-testid={repairTestId}>
                {TRIAGE_REPAIR_TAG_LABEL}
              </span>
            ) : null}
            <span className="truncate">{facts.join(' · ')}</span>
          </p>
        ) : null}
      </div>
      {trailing}
    </div>
  );
}

/** The condition chip face — grade tone + tag glyph + table label; "—" when not set. */
export function ConditionChipFace({ value, className }: { value: string | null; className?: string }) {
  const label = conditionGradeTableLabel(value);
  const empty = label === EMPTY_META_DASH;
  return (
    <span
      aria-hidden
      className={cn(RECORD_CONDITION_CHIP_CLASS, empty ? 'bg-mode-well text-mode-muted' : conditionGradeTone(value).solid, className)}
    >
      <Tag className="h-3 w-3 shrink-0" />
      <span className="truncate">{empty ? '—' : label}</span>
    </span>
  );
}
