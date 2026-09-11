'use client';

/**
 * `/search` browse row — one grammar for every entity type.
 *
 * Title first, quiet entity caption, one identity chip, relative time.
 * Not a Monitor feed, not a 5-col last-8 grid, not a blue Package glyph.
 */

import type { MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { OrderIdChip, SerialChip, getLast8 } from '@/components/ui/CopyChip';
import { StatusBadge } from '@/design-system/components/StatusBadge';
import { formatRelativeTime } from '@/lib/search/search-recents';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { searchHitLineView } from '@/lib/search/search-dossier-model';
import { cn } from '@/utils/_cn';

export function SearchHitLine({
  hit,
  active,
  onNavigate,
}: {
  hit: AiSearchHit;
  active?: boolean;
  onNavigate?: (hit: AiSearchHit, event: ReactMouseEvent) => void;
}) {
  const view = searchHitLineView(hit);
  const when = view.whenSource ? formatRelativeTime(view.whenSource) : null;

  return (
    <Link
      href={hit.href}
      role="option"
      aria-selected={active || undefined}
      data-testid="search-hit-line"
      data-entity={hit.entityType}
      data-sparse={view.sparse ? 'true' : undefined}
      onClick={(event) => onNavigate?.(hit, event)}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover',
        active && 'bg-surface-hover',
      )}
    >
      <span className="shrink-0" data-testid="search-hit-status">
        <StatusBadge status={view.status || 'unknown'} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-role-body font-medium text-text-default">
          {view.title}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-role-caption text-text-soft">
          <span className="shrink-0">{view.entityLabel}</span>
          {view.matchField && view.matchField !== hit.entityType ? (
            <span className="truncate">matched {view.matchField}</span>
          ) : null}
        </span>
      </span>
      {view.identityKind === 'order' && view.identity ? (
        <OrderIdChip
          value={view.identity}
          display={getLast8(view.identity)}
          dense
          truncateDisplay={false}
          fitDisplayWidth
        />
      ) : view.identityKind === 'serial' && view.identity ? (
        <SerialChip value={view.identity} dense width="w-fit max-w-full shrink-0" />
      ) : null}
      {when ? (
        <span className="shrink-0 text-role-caption tabular-nums text-text-faint">{when}</span>
      ) : null}
    </Link>
  );
}
