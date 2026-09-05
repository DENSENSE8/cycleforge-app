'use client';

/**
 * Tool cluster on the compose shell's BOTTOM ACTION BAR, right of the
 * Internal|Public toggle. Each glyph opens one accessory face; icons mount
 * only when that context applies.
 *
 * It rides the footer, not a float in the field's top-right (operator
 * 2026-09-02). Absolutely positioned inside the textarea box the cluster
 * overhung its own `pr-10` reserve, so body text ran under the trailing glyph
 * and the block read as chrome sitting ON the composer. Tools belong on the
 * action bar beside the other things you DO to the draft.
 *
 * Hit targets stay BARE (no IconButton `size`) so scan-station
 * `data-density="floor"` does not lift them to 44px and spill over Create
 * ticket. Draft (Sparkles) opens the Hermes review plate; Link opens the
 * existing-ticket picker.
 */

import { Link2, Mail, Sparkles, Tag } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import type { ComposerAccessoryFace } from './composer-accessory-face';

export type { ComposerAccessoryFace };

export function ComposerAccessoryCluster({
  face,
  onFaceChange,
  showClaim,
  showLink,
  showSeller,
  showDraft = false,
  draftDegraded = false,
}: {
  face: ComposerAccessoryFace | null;
  onFaceChange: (next: ComposerAccessoryFace | null) => void;
  showClaim: boolean;
  showLink: boolean;
  showSeller: boolean;
  /** Claim AI draft tool — Ticket mode, unlinked carton. */
  showDraft?: boolean;
  /** AI fell back to the factual template — badge the Draft tool, never toast. */
  draftDegraded?: boolean;
}) {
  const toggle = (next: ComposerAccessoryFace) => {
    onFaceChange(face === next ? null : next);
  };

  if (!showClaim && !showLink && !showSeller && !showDraft) return null;

  return (
    <div
      className="flex items-center gap-0.5"
      data-testid="composer-accessory-cluster"
      role="toolbar"
      aria-label="Composer accessories"
    >
      {showClaim ? (
        <IconButton
          tone={face === 'claim' ? 'accent' : 'neutral'}
          ariaLabel="Claim type"
          icon={<Tag className="h-3.5 w-3.5" />}
          aria-pressed={face === 'claim'}
          className={cn('p-0.5', face === 'claim' && 'bg-surface-sunken')}
          onClick={() => toggle('claim')}
        />
      ) : null}
      {showLink ? (
        <IconButton
          tone={face === 'link' ? 'accent' : 'neutral'}
          ariaLabel="Link existing ticket"
          icon={<Link2 className="h-3.5 w-3.5" />}
          aria-pressed={face === 'link'}
          className={cn('p-0.5', face === 'link' && 'bg-surface-sunken')}
          onClick={() => toggle('link')}
        />
      ) : null}
      {showDraft ? (
        <IconButton
          tone={face === 'draft' || draftDegraded ? 'accent' : 'neutral'}
          ariaLabel={
            draftDegraded
              ? 'AI draft kept the factual template — review before filing'
              : 'AI draft'
          }
          icon={<Sparkles className="h-3.5 w-3.5" />}
          aria-pressed={face === 'draft'}
          className={cn(
            'p-0.5',
            face === 'draft' && 'bg-surface-sunken',
            draftDegraded && face !== 'draft' && 'text-text-warning hover:text-text-warning',
          )}
          onClick={() => toggle('draft')}
        />
      ) : null}
      {showSeller ? (
        <IconButton
          tone={face === 'seller' ? 'accent' : 'neutral'}
          ariaLabel="Seller message"
          icon={<Mail className="h-3.5 w-3.5" />}
          aria-pressed={face === 'seller'}
          className={cn('p-0.5', face === 'seller' && 'bg-surface-sunken')}
          onClick={() => toggle('seller')}
        />
      ) : null}
    </div>
  );
}
