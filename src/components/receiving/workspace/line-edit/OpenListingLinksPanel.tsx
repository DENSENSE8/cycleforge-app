'use client';

/**
 * Multi-listing open surface — shared by `/open-links` (popup-blocker hub) and
 * the Unbox Listings tab. Primary "Open all" must run from a direct user
 * gesture so browsers allow multiple `window.open` calls.
 */

import { ExternalLink } from '@/components/Icons';
import { InlineNotice } from '@/design-system/components';
import { Button } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { openAllListingHrefs } from '@/lib/receiving/listing-links';
import { cn } from '@/utils/_cn';

export function OpenListingLinksPanel({
  hrefs,
  className,
  compact = false,
}: {
  hrefs: string[];
  className?: string;
  /** Dense workbench chrome (inside Listings tab). */
  compact?: boolean;
}) {
  const links = hrefs.map((h) => h.trim()).filter(Boolean);
  const openAll = () => openAllListingHrefs(links);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-role-eyebrow text-text-default">
            {links.length > 1 ? `${links.length} listing links` : 'Listing links'}
          </p>
          {!compact ? (
            <p className="mt-1 text-role-caption text-text-muted">
              Open links from here to avoid popup blockers on “Open all”.
            </p>
          ) : links.length > 1 ? (
            <p className="mt-0.5 text-role-caption text-text-muted">
              Open every marketplace page in a new tab.
            </p>
          ) : null}
        </div>
        <HoverTooltip label={links.length ? 'Open every link' : 'No links'} asChild>
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={openAll}
            disabled={!links.length}
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            ariaLabel={links.length ? `Open all ${links.length} listings` : 'Open all listings'}
          >
            Open all
          </Button>
        </HoverTooltip>
      </div>

      {!links.length ? (
        <InlineNotice tone="neutral" size="sm">
          No links provided.
        </InlineNotice>
      ) : (
        <div className="space-y-2">
          {links.map((href, i) => (
            // ds-raw-button: full-width listing row; primary action is the URL itself
            <button
              key={`${href}-${i}`}
              type="button"
              onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
              className="ds-raw-button flex w-full items-center justify-between gap-2 rounded-md border border-border-hairline bg-surface-card/70 px-3 py-2 text-left text-role-caption font-semibold text-text-muted transition hover:bg-surface-hover"
            >
              <span className="min-w-0 flex-1 truncate">{href}</span>
              <ExternalLink className="h-4 w-4 shrink-0 text-text-faint" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
