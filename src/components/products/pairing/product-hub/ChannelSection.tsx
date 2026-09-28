import { useState } from 'react';
import { ChevronDown } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { cn } from '@/utils/_cn';
import type { HubCandidate, HubConfirmed } from '../types';
import { ConfirmedRow } from './ConfirmedRow';
import { SuggestionRow } from './SuggestionRow';
import { ChannelManualAdd } from './ChannelManualAdd';

/** One platform's section: confirmed pairings + ranked suggestions + manual add. */
export function ChannelSection({
  platform,
  confirmed,
  suggestions,
  canonicalTitle,
  skuCatalogId,
  onAdded,
  pendingByRowId,
  onAccept,
  onReject,
  onUnpair,
  onPreview,
  activePreviewUrl,
}: {
  platform: string;
  confirmed: HubConfirmed[];
  suggestions: HubCandidate[];
  canonicalTitle: string | null;
  skuCatalogId: number;
  onAdded: () => void;
  pendingByRowId: Map<number, { kind: 'accept' | 'reject' | 'unpair' }>;
  onAccept: (c: HubCandidate) => void;
  onReject: (c: HubCandidate) => void;
  onUnpair: (c: HubConfirmed) => void;
  onPreview: (url: string, label: string) => void;
  activePreviewUrl: string | null;
}) {
  const meta = sourcePlatformMeta(platform);
  const [showAll, setShowAll] = useState(false);

  const mark = (
    <HoverTooltip label={meta.label} asChild focusable={false}>
      <span className="inline-flex shrink-0" aria-label={meta.label}>
        <PlatformMark platformValue={platform} meta={meta} />
      </span>
    </HoverTooltip>
  );

  if (confirmed.length === 0 && suggestions.length === 0) {
    return (
      <section className={cn('border-l-2 py-2 pl-3', meta.border)}>
        <div className="flex items-center gap-2">
          {mark}
          <span className="text-role-micro text-text-faint">empty</span>
        </div>
        <ChannelManualAdd platform={platform} skuCatalogId={skuCatalogId} onAdded={onAdded} />
      </section>
    );
  }

  const visibleSuggestions = showAll ? suggestions : suggestions.slice(0, 1);
  const moreCount = suggestions.length - visibleSuggestions.length;

  return (
    <section className={cn('border-l-2 py-2 pl-3', meta.border)}>
      <div className="mb-1.5 flex items-center gap-2">{mark}</div>

      <div className="space-y-1">
        {confirmed.map((c) => (
          <ConfirmedRow
            key={`c-${c.platformIdRowId}`}
            confirmed={c}
            canonicalTitle={canonicalTitle}
            pending={pendingByRowId.get(c.platformIdRowId)?.kind}
            onUnpair={onUnpair}
            onPreview={onPreview}
            isPreviewing={!!c.listingUrl && c.listingUrl === activePreviewUrl}
          />
        ))}
        {visibleSuggestions.map((c) => (
          <SuggestionRow
            key={`s-${c.platformIdRowId}`}
            candidate={c}
            canonicalTitle={canonicalTitle}
            pending={pendingByRowId.get(c.platformIdRowId)?.kind}
            onAccept={onAccept}
            onReject={onReject}
            onPreview={onPreview}
            isPreviewing={!!c.listingUrl && c.listingUrl === activePreviewUrl}
          />
        ))}
      </div>

      {!showAll && moreCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAll(true)}
          iconRight={<ChevronDown className="h-3 w-3" />}
          className="mt-1.5 text-role-micro font-semibold text-blue-600 hover:text-blue-800"
        >
          See {moreCount} more
        </Button>
      )}

      <ChannelManualAdd platform={platform} skuCatalogId={skuCatalogId} onAdded={onAdded} />
    </section>
  );
}
