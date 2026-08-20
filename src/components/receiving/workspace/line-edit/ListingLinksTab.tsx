'use client';

/**
 * Unbox Listings display — every openable listing URL for the carton, and full
 * CRUD over the ones an operator owns.
 *
 * TWO TIERS, ONE FACE:
 *   - DURABLE rows (`receiving_listing_links`, via {@link useCartonListingLinks})
 *     are the buyer-authored links: create · rename · re-point · delete, in the
 *     buyer's triage order. They carry an `id`.
 *   - COMPUTED tiers (`catalog` / `derived`) are resolved at read time by
 *     `collectCartonListingLinks` and are NOT editable — materializing a
 *     fallback would freeze a guess into a fact. They carry no `id`.
 *
 * ANATOMY (top to bottom):
 *   1. **Open · Copy all** — the two verbs, full-bleed chrome. Open takes the
 *      SELECTED link; Copy all takes every href on the carton.
 *   2. **The combo** — display + selection only. It names which link Open acts
 *      on and highlights that row; it is not an edit or create surface.
 *   3. **The link rows** — one row per link, in the buyer's triage order:
 *      open-icon on the left (that exact link, no select-then-open detour),
 *      identity in the middle (click = select), edit-icon on the right. Edit
 *      opens the inline name + URL fields under the row, with delete beside
 *      them. A computed row has no edit glyph — there is nothing to write. The
 *      last row adds a new link.
 *
 * A host with no carton id (order-side Pack / Testing) gets the read-only face
 * plus the legacy single `listing_url` field — CRUD needs a carton to hang off.
 *
 * Flush Displays body (no WorkspaceCard glass island) — parent push column owns
 * the inset; body rows opt into `DISPLAYS_BODY_INSET`, chrome rows stay
 * edge-to-edge.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Plus, Pencil, Trash2 } from '@/components/Icons';
import { SearchBar } from '@/components/ui/SearchBar';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { SearchableSelectField } from '@/design-system/components';
import { Button, IconButton, Row, TextField } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { RECEIVING_SCAN_RULE_LINE_CLASS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { CartonListingLink } from '@/lib/receiving/listing-links';
import { recordCopy } from '@/lib/clipboard-history';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { ListingVendorViewPanel } from './ListingVendorViewPanel';
import { useCartonListingLinks, type CartonListingLinkRow } from './useCartonListingLinks';

/** Flush Displays body — parent push column owns inset; no glass island. */
const FLUSH_HOST_CLASS = cn('min-w-0', cornerClass('flush'));

/**
 * The inline-edit field grain. A `flush` TextField still paints
 * `bg-surface-card` at `h-11`, which on a SELECTED row (canvas step) reads as a
 * little card sitting inside the row — the island the flush host exists to
 * avoid. Transparent fill + the row's own caption size + a shorter box makes
 * the field read as the row continuing, not as chrome dropped on top of it.
 */
const INLINE_FIELD_CLASS = 'h-9';
const INLINE_FIELD_INPUT_CLASS = 'bg-transparent px-0 text-role-caption';

/** One row of the picker — durable rows carry `id`, computed tiers do not. */
interface DisplayLink {
  id: number | null;
  href: string;
  /** What the picker shows: the buyer's name, else the kind. */
  name: string;
  source: CartonListingLink['source'];
}

function hostOf(href: string): string {
  try {
    return new URL(href).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function computedName(link: CartonListingLink, index: number): string {
  const authored = (link.title || '').trim();
  if (authored) return authored;
  const kind = (link.label || '').trim();
  if (kind) return kind;
  return `Listing ${index + 1}`;
}

export function ListingLinksTab({
  listingLinks,
  listingLink,
  setListingLink,
  receivingId = null,
}: {
  listingLinks: CartonListingLink[];
  listingLink: string;
  setListingLink: (v: string) => void;
  /**
   * The carton these links hang off. Omitted by order-side hosts, which get the
   * read-only face — CRUD writes `receiving_listing_links`, which is keyed by
   * carton, so there is nothing honest to write without one.
   */
  receivingId?: number | null;
}) {
  const store = useCartonListingLinks(receivingId);

  /**
   * Durable rows win the display when the carton has any: the server resolver
   * already treats them as superseding the scalar + sync-note parse, so the
   * client must not paint a second answer. No rows yet = the computed read.
   */
  const links: DisplayLink[] = useMemo(() => {
    if (store.rows.length > 0) {
      return store.rows.map((r: CartonListingLinkRow) => ({
        id: r.id,
        href: r.href,
        name: (r.label || '').trim() || hostOf(r.href) || 'Listing',
        source: r.source,
      }));
    }
    return listingLinks.map((l, i) => ({
      id: l.id ?? null,
      href: l.href,
      name: computedName(l, i),
      source: l.source,
    }));
  }, [store.rows, listingLinks]);

  const [selectedHref, setSelectedHref] = useState<string | null>(null);
  const selected = links.find((l) => l.href === selectedHref) ?? links[0] ?? null;

  // A carton switch (or a delete) must not leave the verbs pointing at a link
  // that is no longer on this box.
  useEffect(() => {
    if (selectedHref && !links.some((l) => l.href === selectedHref)) setSelectedHref(null);
  }, [links, selectedHref]);

  /** Draft for the add row; `null` = the row is idle. */
  const [draft, setDraft] = useState<{ href: string; label: string } | null>(null);

  const copyAll = useCallback(() => {
    const all = links.map((l) => l.href).filter(Boolean);
    if (all.length === 0) return;
    const text = all.join('\n');
    void navigator.clipboard.writeText(text);
    recordCopy(text, { kind: 'id', display: `${all.length} listing link${all.length === 1 ? '' : 's'}` });
  }, [links]);

  const commitDraft = useCallback(async () => {
    if (!draft?.href.trim()) return;
    const created = await store.create(draft.href, draft.label);
    if (created) {
      setDraft(null);
      setSelectedHref(created.href);
    }
  }, [draft, store]);

  /**
   * While a listing is embedded, the viewport IS the display — the verbs and
   * the rows below them were the exact height the marketplace page needed, and
   * they say nothing the page in front of the operator does not show.
   */
  const [embedOpen, setEmbedOpen] = useState(false);
  const handleEmbedOpenChange = useCallback((next: boolean) => setEmbedOpen(next), []);

  return (
    <div className={cn(FLUSH_HOST_CLASS, 'flex h-full min-h-0 flex-col')}>
      <ListingVendorViewPanel
        links={listingLinks}
        listingLink={listingLink}
        setListingLink={setListingLink}
        onOpenChange={handleEmbedOpenChange}
        className={embedOpen ? 'min-h-0 flex-1' : undefined}
      />

      {embedOpen ? null : (
        <>
          {/* 1 — the two verbs. Station chrome: full-bleed, one hairline seam. */}
          <div className="grid grid-cols-2 divide-x divide-border-hairline border-b border-border-hairline">
            <Button
              type="button"
              size="sm"
              variant="primarySoft"
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              onClick={() => {
                if (selected?.href) window.open(selected.href, '_blank', 'noopener,noreferrer');
              }}
              disabled={!selected?.href}
              ariaLabel="Open the selected listing in a new tab"
              className="w-full"
            >
              Open
            </Button>
            <HoverTooltip label="Copy every listing link on this carton" asChild>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<Copy className="h-3.5 w-3.5" />}
                onClick={copyAll}
                disabled={links.length === 0}
                ariaLabel="Copy every listing link"
                className="w-full"
              >
                Copy all
              </Button>
            </HoverTooltip>
          </div>

          {/* 2 — display + selection, with create on the same seam. The combo
              itself stays display-only: it never carries an "add" option. */}
          <div className="flex items-stretch divide-x divide-border-hairline border-b border-border-hairline">
            <div className="min-w-0 flex-1">
              <SearchableSelectField
                value={selected?.href ?? null}
                onChange={(v) => setSelectedHref(typeof v === 'string' ? v : null)}
                options={links.map((l) => ({ value: l.href, label: l.name, meta: hostOf(l.href) }))}
                appearance="flush"
                placeholder={store.loading ? 'Loading links…' : 'No listing links'}
                searchPlaceholder="Filter listings…"
                emptyMessage="No listing links"
                ariaLabel="Selected listing link"
              />
            </div>
            {store.supported ? (
              <HoverTooltip label="Add a listing link" asChild>
                <IconButton
                  type="button"
                  size="md"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => setDraft({ href: '', label: '' })}
                  ariaLabel="Add a listing link"
                  className={cornerClass('flush')}
                />
              </HoverTooltip>
            ) : null}
          </div>

          {store.error ? (
            <p className={cn(DISPLAYS_BODY_INSET, 'pt-2 text-role-caption text-rose-600')}>{store.error}</p>
          ) : null}

          {/* 3 — the rows. Selection highlights; durable rows edit in place. */}
          <div className="min-h-0 flex-1 divide-y divide-border-hairline overflow-y-auto">
            {links.map((link) => {
              const row = link.id ? store.rows.find((r) => r.id === link.id) ?? null : null;
              return (
                <ListingLinkRow
                  key={link.id ?? link.href}
                  link={link}
                  row={row}
                  selected={selected?.href === link.href}
                  onSelect={() => setSelectedHref(link.href)}
                  onSave={store.update}
                  onDelete={async (id) => {
                    const ok = await store.remove(id);
                    if (ok) setSelectedHref(null);
                  }}
                />
              );
            })}

            {/* The add row lives with the rows it creates — no separate band. */}
            {store.supported ? (
              draft ? (
                <div className={cn(DISPLAYS_BODY_INSET, 'space-y-1 py-2')}>
                  <TextField
                    label="Name (optional)"
                    value={draft.label}
                    onChange={(v) => setDraft({ ...draft, label: v })}
                    appearance="flush"
                    className={INLINE_FIELD_CLASS}
                    inputClassName={INLINE_FIELD_INPUT_CLASS}
                  />
                  <TextField
                    label="URL"
                    value={draft.href}
                    onChange={(v) => setDraft({ ...draft, href: v })}
                    appearance="flush"
                    mono
                    autoFocus
                    className={INLINE_FIELD_CLASS}
                    inputClassName={INLINE_FIELD_INPUT_CLASS}
                  />
                  <Row>
                    <Button type="button" size="sm" variant="primarySoft" onClick={commitDraft} disabled={!draft.href.trim()}>
                      Save link
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
                      Cancel
                    </Button>
                  </Row>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDraft({ href: '', label: '' })}
                  className={cn(
                    DISPLAYS_BODY_INSET,
                    'flex w-full items-center gap-2 py-2 text-left text-role-caption text-text-muted',
                    'hover:bg-surface-canvas hover:text-text-default',
                    focusRing('cell'),
                  )}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add listing link
                </button>
              )
            ) : null}
          </div>

          {/* No carton to write against: the legacy single field stays the edit
              surface, unchanged, rather than painting verbs that cannot write. */}
          {!store.supported ? (
            <div className={cn(DISPLAYS_BODY_INSET, 'group min-w-0 border-t border-border-hairline py-3')}>
              <SearchBar
                value={listingLink}
                onChange={setListingLink}
                placeholder="https://…"
                variant="blue"
                size="compact"
                hideUnderline
                leadingIcon={<Pencil className="h-3.5 w-3.5 text-text-soft" />}
                pasteOnlyTrailing
                className="w-full"
              />
              <div className={RECEIVING_SCAN_RULE_LINE_CLASS} aria-hidden />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * One link row: **open-icon · identity · edit-icon**.
 *
 * The row reads as one line — the left glyph opens THAT exact link (no
 * select-then-open detour), the middle names it and takes the selection the
 * band verbs follow, and the right glyph reveals the inline editor. Editing is
 * in place under the same row: name + URL commit on blur, delete lives with
 * them, so a link is never edited in a surface that hides the list.
 *
 * A computed row (`catalog` / `derived`) has no id, so it opens and selects but
 * carries no edit glyph — there is nothing to write.
 */
function ListingLinkRow({
  link,
  row,
  selected,
  onSelect,
  onSave,
  onDelete,
}: {
  link: DisplayLink;
  row: CartonListingLinkRow | null;
  selected: boolean;
  onSelect: () => void;
  onSave: (id: number, patch: { href?: string; label?: string | null }) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row?.label ?? '');
  const [href, setHref] = useState(row?.href ?? link.href);

  useEffect(() => {
    setLabel(row?.label ?? '');
    setHref(row?.href ?? link.href);
  }, [row?.id, row?.label, row?.href, link.href]);

  const commit = () => {
    if (!row) return;
    const patch: { href?: string; label?: string | null } = {};
    if (href.trim() && href.trim() !== row.href) patch.href = href.trim();
    if ((label.trim() || null) !== row.label) patch.label = label.trim() || null;
    if (Object.keys(patch).length === 0) return;
    void onSave(row.id, patch);
  };

  const openExact = () => {
    onSelect();
    window.open(link.href, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className={cn(
        DISPLAYS_BODY_INSET,
        'py-1.5',
        // Selection is a surface step on the shared ground — not an island.
        selected ? 'bg-surface-canvas' : 'hover:bg-surface-canvas/60',
      )}
      data-selected={selected ? '' : undefined}
    >
      <Row gap="tight">
        <HoverTooltip label={`Open ${link.name}`} asChild>
          <IconButton
            type="button"
            size="sm"
            tone="accent"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={openExact}
            ariaLabel={`Open ${link.name} in a new tab`}
            className={cornerClass('flush')}
          />
        </HoverTooltip>

        <button
          type="button"
          onClick={onSelect}
          className={cn('flex min-w-0 flex-1 flex-col items-start text-left', focusRing('cell'))}
          aria-pressed={selected}
        >
          <span className="w-full truncate text-role-caption font-semibold text-text-default">{link.name}</span>
          <span className="w-full truncate font-mono text-role-micro text-text-muted">{hostOf(link.href)}</span>
        </button>

        {row ? (
          <HoverTooltip label={editing ? 'Done editing' : `Edit ${link.name}`} asChild>
            <IconButton
              type="button"
              size="sm"
              icon={editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              onClick={() => {
                if (editing) commit();
                setEditing((v) => !v);
                onSelect();
              }}
              ariaLabel={editing ? `Done editing ${link.name}` : `Edit ${link.name}`}
              className={cornerClass('flush')}
            />
          </HoverTooltip>
        ) : null}
      </Row>

      {row && editing ? (
        <div className="space-y-1 pt-1">
          <TextField
            label="Name"
            value={label}
            onChange={setLabel}
            onBlur={commit}
            appearance="flush"
            className={INLINE_FIELD_CLASS}
            inputClassName={INLINE_FIELD_INPUT_CLASS}
          />
          <TextField
            label="URL"
            value={href}
            onChange={setHref}
            onBlur={commit}
            appearance="flush"
            mono
            className={INLINE_FIELD_CLASS}
            inputClassName={INLINE_FIELD_INPUT_CLASS}
          />
          <Row>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => void onDelete(row.id)}
              ariaLabel={`Delete ${link.name}`}
            >
              Delete
            </Button>
          </Row>
        </div>
      ) : null}
    </div>
  );
}
