'use client';

/**
 * Unbox Listings display — multi-open surface (when 2+ links) + nested detail
 * slider for each resolvable listing URL (manual / catalog / sync_notes /
 * derived) plus a manual override field.
 *
 * Flush Displays body (no WorkspaceCard glass island) — parent push column
 * owns inset.
 */

import { useCallback, useMemo, useState } from 'react';
import { Copy, ExternalLink, FileText, Link2 } from '@/components/Icons';
import { SearchBar } from '@/components/ui/SearchBar';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { InlineNotice, SectionTabsSlider, type SectionTab } from '@/design-system/components';
import { Button, IconButton } from '@/design-system/primitives';
import { WorkspaceFieldLabel } from '@/components/receiving/workspace/WorkspaceSectionLabel';
import { RECEIVING_SCAN_RULE_LINE_CLASS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { CartonListingLink } from '@/lib/receiving/listing-links';
import { recordCopy } from '@/lib/clipboard-history';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { OpenListingLinksPanel } from './OpenListingLinksPanel';
import { ListingVendorViewPanel } from './ListingVendorViewPanel';

/** Flush Displays body — parent push column owns inset; no glass island. */
const FLUSH_HOST_CLASS = cn('min-w-0', cornerClass('flush'));

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
        <InlineNotice tone="neutral" size="sm" title="URL">
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
        </InlineNotice>
      ) : (
        <InlineNotice tone="neutral" size="sm">
          No listing URL on this slot yet.
        </InlineNotice>
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
  const hrefs = useMemo(() => listingLinks.map((l) => l.href).filter(Boolean), [listingLinks]);
  const showOpenAll = hrefs.length > 1;

  const tabs: SectionTab[] = useMemo(() => {
    const fromLinks = listingLinks.map((l, i) => {
      // The buyer's own name for the link wins — it is the only thing that
      // tells several links of one source apart (three sync-note links all
      // resolve `sourceLabel` to "Synced"). The source stays readable as the
      // row's icon. Falls back to the kind, then a positional name.
      const authored = (l.title || '').trim();
      const label = authored || sourceLabel(l.source, (l.label || '').trim() || `Listing ${i + 1}`);
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

  /**
   * While a listing is embedded, the viewport IS the display — the URL band,
   * the manual-override field and the per-link slider below it were the exact
   * height the marketplace page needed, and they say nothing the page in front
   * of the operator does not already show. Everything they offered is still
   * reachable: pick / close from the combo, and "Edit listing link…" inside it.
   */
  const [embedOpen, setEmbedOpen] = useState(false);
  const handleEmbedOpenChange = useCallback((next: boolean) => setEmbedOpen(next), []);

  if (tabs.length === 0) {
    return (
      <div className={cn(FLUSH_HOST_CLASS, 'flex h-full min-h-0 flex-col')}>
        <ListingVendorViewPanel
          links={listingLinks}
          listingLink={listingLink}
          setListingLink={setListingLink}
          onOpenChange={handleEmbedOpenChange}
          className={embedOpen ? 'min-h-0 flex-1' : 'mb-4'}
        />
        {embedOpen ? null : (
          <ListingLinkPanel
            link={null}
            listingLink={listingLink}
            setListingLink={setListingLink}
            isManualSlot
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn(FLUSH_HOST_CLASS, 'flex h-full min-h-0 flex-col', embedOpen ? null : 'space-y-4')}>
      {/* Embedded marketplace browser leads the display on the desktop shell —
          the combo box is the pick surface for multi-link cartons. Renders
          nothing in a browser, where Open/Copy below stays the whole story. */}
      <ListingVendorViewPanel
        links={listingLinks}
        listingLink={listingLink}
        setListingLink={setListingLink}
        onOpenChange={handleEmbedOpenChange}
        className={embedOpen ? 'min-h-0 flex-1' : undefined}
      />
      {embedOpen ? null : (
        <>
          {showOpenAll ? (
            <div className="min-w-0">
              <OpenListingLinksPanel hrefs={hrefs} compact />
            </div>
          ) : null}
          <div className="min-w-0">
            <SectionTabsSlider
              tabs={tabs}
              value={activeId}
              onChange={setActive}
              ariaLabel="Listing links"
            />
          </div>
        </>
      )}
    </div>
  );
}
