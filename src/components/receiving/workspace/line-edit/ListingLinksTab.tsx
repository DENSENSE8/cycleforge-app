'use client';

/**
 * Unbox Listings tab — nested SectionTabsSlider over resolvable listing URLs
 * (manual / catalog / sync_notes / derived) plus a manual override field.
 */

import { useMemo, useState } from 'react';
import { Copy, ExternalLink, FileText, Link2 } from '@/components/Icons';
import { SearchBar } from '@/components/ui/SearchBar';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { SectionTabsSlider, WorkspaceCard, type SectionTab } from '@/design-system/components';
import { Button, IconButton } from '@/design-system/primitives';
import { WorkspaceFieldLabel } from '@/components/receiving/workspace/WorkspaceSectionLabel';
import { RECEIVING_SCAN_RULE_LINE_CLASS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { CartonListingLink } from '@/lib/receiving/listing-links';
import { recordCopy } from '@/lib/clipboard-history';
import { cn } from '@/utils/_cn';

function sourceIcon(source: CartonListingLink['source']) {
  switch (source) {
    case 'manual':
      return Link2;
    case 'sync_notes':
      return FileText;
    case 'catalog':
      return ExternalLink;
    default:
      return ExternalLink;
  }
}

function sourceLabel(source: CartonListingLink['source'], fallback: string): string {
  switch (source) {
    case 'manual':
      return 'Manual';
    case 'sync_notes':
      return 'Synced';
    case 'catalog':
      return fallback || 'Catalog';
    case 'derived':
      return 'Storefront';
    default:
      return fallback || 'Listing';
  }
}

function ListingLinkPanel({
  link,
  listingLink,
  setListingLink,
  isManualSlot,
}: {
  link: CartonListingLink | null;
  listingLink: string;
  setListingLink: (v: string) => void;
  isManualSlot: boolean;
}) {
  const href = link?.href ?? '';
  const copyHref = () => {
    if (!href) return;
    void navigator.clipboard.writeText(href);
    recordCopy(href, { kind: 'id', display: href });
  };

  return (
    <div className="space-y-3">
      {href ? (
        <div className="rounded-lg border border-border-hairline bg-surface-card/70 px-3 py-2.5">
          <p className="mb-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
            URL
          </p>
          <p className="break-all font-mono text-role-caption text-text-default">{href}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
              ariaLabel="Open listing in new tab"
            >
              Open
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={<Copy className="h-3.5 w-3.5" />}
              onClick={copyHref}
              ariaLabel="Copy listing URL"
            >
              Copy
            </Button>
            {link?.source === 'sync_notes' ? (
              <HoverTooltip label="Scroll to Zoho Notes editor (to edit the synced list)" asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const el = document.getElementById('zoho-notes-card');
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  Edit Zoho notes
                </Button>
              </HoverTooltip>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-role-caption text-text-faint">No listing URL on this slot yet.</p>
      )}

      {isManualSlot ? (
        <div className="group min-w-0">
          <div className="mb-1.5">
            <WorkspaceFieldLabel className="whitespace-nowrap">Manual override URL</WorkspaceFieldLabel>
          </div>
          <SearchBar
            value={listingLink}
            onChange={setListingLink}
            placeholder="https://…"
            variant="blue"
            size="compact"
            hideUnderline
            pasteOnlyTrailing
            leadingIcon={
              <HoverTooltip label={href ? 'Open primary link' : 'Enter a valid URL'} asChild>
                <IconButton
                  type="button"
                  tone="accent"
                  onClick={(e) => {
                    e.preventDefault();
                    if (href) window.open(href, '_blank', 'noopener,noreferrer');
                  }}
                  disabled={!href}
                  ariaLabel="Open primary listing URL in new tab"
                  className="-m-0.5 rounded p-0.5 text-blue-600 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-text-faint disabled:opacity-60"
                  icon={<ExternalLink className="h-[14px] w-[14px]" />}
                />
              </HoverTooltip>
            }
            className="w-full"
          />
          <div className={RECEIVING_SCAN_RULE_LINE_CLASS} aria-hidden />
        </div>
      ) : null}
    </div>
  );
}

export function ListingLinksTab({
  listingLinks,
  listingLink,
  setListingLink,
}: {
  listingLinks: CartonListingLink[];
  listingLink: string;
  setListingLink: (v: string) => void;
}) {
  const hasManual = listingLinks.some((l) => l.source === 'manual');
  const tabs: SectionTab[] = useMemo(() => {
    const fromLinks = listingLinks.map((l, i) => {
      const label = sourceLabel(l.source, (l.label || '').trim() || `Listing ${i + 1}`);
      const Icon = sourceIcon(l.source);
      return {
        id: `link-${i}-${l.source}`,
        label,
        icon: Icon,
        content: (
          <ListingLinkPanel
            link={l}
            listingLink={listingLink}
            setListingLink={setListingLink}
            isManualSlot={l.source === 'manual'}
          />
        ),
      };
    });
    if (!hasManual) {
      fromLinks.push({
        id: 'manual-override',
        label: 'Manual',
        icon: Link2,
        content: (
          <ListingLinkPanel
            link={null}
            listingLink={listingLink}
            setListingLink={setListingLink}
            isManualSlot
          />
        ),
      });
    }
    return fromLinks;
  }, [listingLinks, listingLink, setListingLink, hasManual]);

  const [active, setActive] = useState(tabs[0]?.id ?? 'manual-override');
  const activeId = tabs.some((t) => t.id === active) ? active : tabs[0]?.id ?? 'manual-override';

  if (tabs.length === 0) {
    return (
      <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested">
        <ListingLinkPanel
          link={null}
          listingLink={listingLink}
          setListingLink={setListingLink}
          isManualSlot
        />
      </WorkspaceCard>
    );
  }

  return (
    <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested" className={cn('min-w-0')}>
      <SectionTabsSlider
        tabs={tabs}
        value={activeId}
        onChange={setActive}
        ariaLabel="Listing links"
      />
    </WorkspaceCard>
  );
}
