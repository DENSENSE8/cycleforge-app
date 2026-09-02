'use client';

/**
 * Top-right icon cluster on the compose shell. Each glyph opens one accessory
 * face; icons mount only when that context applies.
 */

import { Link2, Mail, Tag } from '@/components/Icons';
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
}: {
  face: ComposerAccessoryFace | null;
  onFaceChange: (next: ComposerAccessoryFace | null) => void;
  showClaim: boolean;
  showLink: boolean;
  showSeller: boolean;
}) {
  const toggle = (next: ComposerAccessoryFace) => {
    onFaceChange(face === next ? null : next);
  };

  if (!showClaim && !showLink && !showSeller) return null;

  return (
    <div
      className="flex items-center gap-0"
      data-testid="composer-accessory-cluster"
      role="toolbar"
      aria-label="Composer accessories"
    >
      {showClaim ? (
        <IconButton
          size="sm"
          tone={face === 'claim' ? 'accent' : 'neutral'}
          ariaLabel="Claim type"
          icon={<Tag className="h-3.5 w-3.5" />}
          aria-pressed={face === 'claim'}
          className={cn(face === 'claim' && 'bg-surface-sunken')}
          onClick={() => toggle('claim')}
        />
      ) : null}
      {showLink ? (
        <IconButton
          size="sm"
          tone={face === 'link' ? 'accent' : 'neutral'}
          ariaLabel="Link existing ticket"
          icon={<Link2 className="h-3.5 w-3.5" />}
          aria-pressed={face === 'link'}
          className={cn(face === 'link' && 'bg-surface-sunken')}
          onClick={() => toggle('link')}
        />
      ) : null}
      {showSeller ? (
        <IconButton
          size="sm"
          tone={face === 'seller' ? 'accent' : 'neutral'}
          ariaLabel="Seller message"
          icon={<Mail className="h-3.5 w-3.5" />}
          aria-pressed={face === 'seller'}
          className={cn(face === 'seller' && 'bg-surface-sunken')}
          onClick={() => toggle('seller')}
        />
      ) : null}
    </div>
  );
}
