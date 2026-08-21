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
 *   2. **The combo** — display + selection. Trailing plus starts a new link.
 *      It names which link Open acts on and highlights that row.
 *   3. **The link rows** — one row per link, in the buyer's triage order:
 *      open-square on the left (that exact link, no select-then-open detour),
 *      identity in the middle (click = select), edit-icon on the right. Edit
 *      opens the inline name + URL fields under the row, with delete beside
 *      them. Trailing pencil is always on the right: durable rows edit in
 *      place; computed rows open a prefilled create so the operator can own
 *      the link.
 *
 * A host with no carton id (order-side Pack / Testing) gets the read-only face
 * plus the legacy single `listing_url` field — CRUD needs a carton to hang off.
 *
 * Flush Displays body (no WorkspaceCard glass island) — parent push column owns
 * the inset; chrome rows stay edge-to-edge.
 */

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Check, Copy, ExternalLink, Plus, Pencil, Trash2 } from '@/components/Icons';
import { SearchBar } from '@/components/ui/SearchBar';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { SearchableSelectField, DenseComposeLabel, DenseComposeSubjectInput } from '@/design-system/components';
import { Button, IconButton } from '@/design-system/primitives';
import { BUTTON_VARIANTS } from '@/design-system/primitives/button-variants';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { STATION_DISPLAYS_HEADER_ACTION_GLYPH } from '@/components/station/displays/StationDisplaysHeaderActions';
import { RECEIVING_SCAN_RULE_LINE_CLASS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { CartonListingLink } from '@/lib/receiving/listing-links';
import { recordCopy } from '@/lib/clipboard-history';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { ListingVendorViewPanel } from './ListingVendorViewPanel';
import { useCartonListingLinks, type CartonListingLinkRow } from './useCartonListingLinks';

/** Flush Displays body — parent push column owns inset; no glass island. */
const FLUSH_HOST_CLASS = cn('min-w-0', cornerClass('flush'));

const LISTING_LEAD_GLYPH = STATION_DISPLAYS_HEADER_ACTION_GLYPH;
/** Lead · identity · trail — plus and pencil share the last column. */
const LISTING_LINE_GRID =
  'grid w-full min-w-0 grid-cols-[2rem_minmax(0,1fr)_2rem] items-stretch divide-x divide-border-hairline';
/**
 * The combo rides the SAME lead · identity · trail template as the rows it
 * names — it just leaves the lead cell empty (nothing opens a selection). It
 * used to be `[1fr_2rem]`, i.e. no lead column at all, so its text started at
 * the column edge while every link identity below it started 2rem further in:
 * two left rails in one stack.
 */
const LISTING_COMBO_GRID = cn(LISTING_LINE_GRID, 'border-b border-border-hairline');
const LISTING_OPEN_SQUARE = cn(
  BUTTON_VARIANTS.primarySoft,
  cornerClass('flush'),
  'h-full w-full [&>svg]:h-3.5 [&>svg]:w-3.5',
);
const LISTING_TRAIL_SQUARE = cn(
  BUTTON_VARIANTS.secondary,
  cornerClass('flush'),
  'h-full w-full [&>svg]:h-3.5 [&>svg]:w-3.5',
);
const LISTING_LINK_INSET_X = 'px-3';
const LISTING_LINK_IDENTITY_FACE = LISTING_LINK_INSET_X;
const LISTING_COMBO_FACE = LISTING_LINK_INSET_X;

/** Save fills the row; Cancel sits on the trailing edge — no gap, no pad. */
const LISTING_EDITOR_ACTIONS =
  'grid w-full grid-cols-[minmax(0,1fr)_auto]';

/**
 * The editor opened FROM a link row lands on that row's identity rail:
 * 2rem lead cell + the identity's own `px-3` = 44px on each side. Without it
 * the compose fields (`px-0` by contract) start at the column edge, a third
 * left rail under the two the row and combo already share.
 *
 * The CREATE editor takes the same rail: it lands in the same list, under the
 * same combo, so a second left edge there reads as a different surface rather
 * than the next row.
 */
const LISTING_ROW_EDITOR_RAIL = 'px-11 pb-2';

function ListingLinkEditor({
  name,
  href,
  onNameChange,
  onHrefChange,
  onSave,
  onCancel,
  saveDisabled,
  autoFocusHref = false,
  footer,
  className,
}: {
  name: string;
  href: string;
  onNameChange: (v: string) => void;
  onHrefChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saveDisabled: boolean;
  autoFocusHref?: boolean;
  footer?: ReactNode;
  /** Rail the editor sits on. Omitted = full-bleed (the create face). */
  className?: string;
}) {
  const nameId = useId();
  const hrefId = useId();
  return (
    <div className={cn('grid grid-cols-1', className)}>
      <DenseComposeLabel htmlFor={nameId} className="mb-0 text-text-soft">
        Name
      </DenseComposeLabel>
      <DenseComposeSubjectInput
        id={nameId}
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Name"
      />
      <DenseComposeLabel htmlFor={hrefId} className="mb-0 text-text-soft">
        Listing link
      </DenseComposeLabel>
      <DenseComposeSubjectInput
        id={hrefId}
        value={href}
        onChange={(e) => onHrefChange(e.target.value)}
        placeholder="https://…"
        autoFocus={autoFocusHref}
        className="font-mono"
      />
      <div className={LISTING_EDITOR_ACTIONS}>
        <Button
          type="button"
          size="sm"
          variant="primarySoft"
          onClick={onSave}
          disabled={saveDisabled}
          className="w-full"
        >
          Save link
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {footer}
    </div>
  );
}

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

  /**
   * Every link, each in its own tab. Popup blockers allow this because it runs
   * on the operator's click; a link that fails to open is the browser's answer,
   * not a state we invent a toast for.
   */
  const openAll = useCallback(() => {
    for (const l of links) {
      if (l.href) window.open(l.href, '_blank', 'noopener,noreferrer');
    }
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
          {/* 1 — the two ALL verbs. Station chrome: full-bleed, one hairline
              seam. Both act on the whole carton — one link at a time is the
              row's own Open, not this band. */}
          <div className="grid grid-cols-2 divide-x divide-border-hairline border-b border-border-hairline">
            <Button
              type="button"
              size="sm"
              variant="primarySoft"
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              onClick={openAll}
              disabled={links.length === 0}
              ariaLabel="Open every listing link in a new tab"
              className="w-full"
            >
              Open all
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

          {/* 2 — display + selection. Trailing plus opens the create fields. */}
          <div className={LISTING_COMBO_GRID}>
            {/* Lead cell — empty on purpose: the rows' Open lives here, and the
                combo has nothing to open. Present so both share one rail. */}
            <span aria-hidden />
            <SearchableSelectField
              value={selected?.href ?? null}
              onChange={(v) => setSelectedHref(typeof v === 'string' ? v : null)}
              options={links.map((l) => ({ value: l.href, label: l.name, meta: hostOf(l.href) }))}
              appearance="flush"
              placeholder={store.loading ? 'Loading links…' : 'No listing links'}
              searchPlaceholder="Filter listings…"
              emptyMessage="No listing links"
              ariaLabel="Selected listing link"
              className={LISTING_COMBO_FACE}
            />
            {store.supported ? (
              <HoverTooltip label="Add a listing link" asChild>
                <IconButton
                  type="button"
                  size="fill"
                  icon={<Plus className={LISTING_LEAD_GLYPH} />}
                  onClick={() => setDraft({ href: '', label: '' })}
                  ariaLabel="Add a listing link"
                  className={LISTING_TRAIL_SQUARE}
                />
              </HoverTooltip>
            ) : (
              <span />
            )}
          </div>

          {store.error ? (
            <p className={cn(LISTING_ROW_EDITOR_RAIL, 'pt-2 text-role-caption text-rose-600')}>
              {store.error}
            </p>
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
                  onPromote={
                    store.supported
                      ? () => setDraft({ href: link.href, label: link.name })
                      : undefined
                  }
                  onDelete={async (id) => {
                    const ok = await store.remove(id);
                    if (ok) setSelectedHref(null);
                  }}
                />
              );
            })}

            {store.supported && draft ? (
              <ListingLinkEditor
                className={LISTING_ROW_EDITOR_RAIL}
                name={draft.label}
                href={draft.href}
                onNameChange={(v) => setDraft({ ...draft, label: v })}
                onHrefChange={(v) => setDraft({ ...draft, href: v })}
                onSave={() => void commitDraft()}
                onCancel={() => setDraft(null)}
                saveDisabled={!draft.href.trim()}
                autoFocusHref
              />
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
 * One link row: **open-square · identity · edit-icon**.
 *
 * The row reads as one line — the left square opens THAT exact link (no
 * select-then-open detour), the middle names it and takes the selection the
 * band verbs follow, and the right glyph reveals the inline editor. Editing is
 * in place under the same row: name + URL commit on blur, delete lives with
 * them, so a link is never edited in a surface that hides the list.
 *
 * A computed row (`catalog` / `derived`) has no id — the trailing pencil
 * still shows and promotes that href into a create draft.
 */
function ListingLinkRow({
  link,
  row,
  selected,
  onSelect,
  onSave,
  onPromote,
  onDelete,
}: {
  link: DisplayLink;
  row: CartonListingLinkRow | null;
  selected: boolean;
  onSelect: () => void;
  onSave: (id: number, patch: { href?: string; label?: string | null }) => Promise<boolean>;
  /** Computed row — pencil starts a prefilled create. */
  onPromote?: () => void;
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
    <div data-selected={selected ? '' : undefined}>
      <div
        className={cn(
          LISTING_LINE_GRID,
          selected ? 'bg-surface-canvas' : 'hover:bg-surface-canvas/60',
        )}
      >
        <HoverTooltip label={`Open ${link.name}`} asChild>
          <IconButton
            type="button"
            size="fill"
            icon={<ExternalLink className={LISTING_LEAD_GLYPH} />}
            onClick={openExact}
            ariaLabel={`Open ${link.name} in a new tab`}
            className={LISTING_OPEN_SQUARE}
          />
        </HoverTooltip>

        <button
          type="button"
          onClick={onSelect}
          className={cn(
            LISTING_LINK_IDENTITY_FACE,
            // min-h-9 = the combo's own h-9. The row sets the height for the
            // whole line, so its lead Open and trail Edit fill the same box the
            // combo's ＋ does — three cells in one column, not two sizes.
            'flex min-h-9 min-w-0 flex-col items-start justify-center text-left',
            focusRing('cell'),
          )}
          aria-pressed={selected}
        >
          <span className="w-full truncate text-role-caption font-semibold text-text-default">{link.name}</span>
          <span className="w-full truncate font-mono text-role-micro text-text-muted">{hostOf(link.href)}</span>
        </button>

        {row || onPromote ? (
          <HoverTooltip label={editing ? 'Done editing' : `Edit ${link.name}`} asChild>
            <IconButton
              type="button"
              size="fill"
              icon={editing ? <Check className={LISTING_LEAD_GLYPH} /> : <Pencil className={LISTING_LEAD_GLYPH} />}
              onClick={() => {
                if (!row) {
                  onPromote?.();
                  onSelect();
                  return;
                }
                if (editing) commit();
                setEditing((v) => !v);
                onSelect();
              }}
              ariaLabel={editing ? `Done editing ${link.name}` : `Edit ${link.name}`}
              className={LISTING_TRAIL_SQUARE}
            />
          </HoverTooltip>
        ) : (
          <span />
        )}
      </div>

      {row && editing ? (
        <ListingLinkEditor
          className={LISTING_ROW_EDITOR_RAIL}
          name={label}
          href={href}
          onNameChange={setLabel}
          onHrefChange={setHref}
          onSave={() => {
            commit();
            setEditing(false);
          }}
          onCancel={() => {
            setLabel(row.label ?? '');
            setHref(row.href);
            setEditing(false);
          }}
          saveDisabled={!href.trim()}
          footer={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => void onDelete(row.id)}
              ariaLabel={`Delete ${link.name}`}
              className="w-full"
            >
              Delete
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
