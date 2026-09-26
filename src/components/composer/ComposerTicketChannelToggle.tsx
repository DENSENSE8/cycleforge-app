'use client';

/**
 * Internal note ↔ public reply, in the composer's bottom action bar, directly
 * RIGHT OF the `+` (operator ruling 2026-08-30).
 * (`COMPOSER_SHELL_CORNER`, operator 2026-08-24). The default appearance is also
 */

import { VisibilityToggle } from '@/components/ui/VisibilityToggle';

export function ComposerTicketChannelToggle({
  isPublic,
  onIsPublicChange,
}: {
  isPublic: boolean;
  onIsPublicChange: (next: boolean) => void;
}) {
  return (
    <div
      data-testid="composer-ticket-channel"
      data-composer-channel={isPublic ? 'public' : 'internal'}
      className="flex min-w-0 shrink-0 items-center"
    >
      <VisibilityToggle
        value={isPublic}
        onChange={onIsPublicChange}
        internalLabel="Internal"
        publicLabel="Public"
        className="scale-90 origin-left"
      />
    </div>
  );
}
