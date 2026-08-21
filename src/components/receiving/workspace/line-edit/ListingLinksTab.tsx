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
 * ANATOMY (top to bottom) — three stacked rows on ONE four-column rail
 * (`open · copy · edit · delete`), so every cell in a column does the same
 * kind of job:
 *   1. **Open · Open all** — full-bleed chrome. Open acts on the SELECTED
 *      link; Open all takes every href on the carton.
 *   2. **The header row** — ＋ · picker | Copy all | count | Delete all. Each
 *      trailing cell heads the row column beneath it: the same verb at carton
 *      scale. ＋ leads the wide cell where a row's open glyph sits, so the
 *      picker's text lands on the link-name rail. Delete all ARMS on the first
 *      click and commits on the second.
 *   3. **The link rows** — one per link, in the buyer's triage order. The row
 *      itself is the open button (glyph + name), then copy · edit · delete.
 *      Edit opens the inline name + URL fields beneath; a computed row has no
 *      id, so its pencil opens a prefilled create instead and it carries no
 *      delete.
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
import { CursorPositionReadout } from '@/components/ui/pane-header';
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
/**
 * Open · copy · edit · delete. The OPEN cell is the row: glyph + name in one
 * full-width button, because opening the listing is what an operator wants from
 * a row of listing links, and a 2rem target for the primary verb made them aim.
 * The three trailing squares are that row's own verbs, in the order they
 * escalate — take it, change it, remove it.
 */
const LISTING_LINE_GRID =
  'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_2rem_2rem_2rem] items-stretch divide-x divide-border-hairline';
/** The combo rides the same four columns: picker · — · count · add. */
const LISTING_COMBO_GRID = cn(LISTING_LINE_GRID, 'border-b border-border-hairline');
const LISTING_TRAIL_SQUARE = cn(
  BUTTON_VARIANTS.secondary,
  cornerClass('flush'),
  'h-full w-full [&>svg]:h-3.5 [&>svg]:w-3.5',
);
/**
 * Destructive trailing cell — the same face the serial rail's Remove serial
 * uses (`UnitSlotList`): muted until hover, then rose. One destructive idiom
 * for "remove this row of a list the operator is building", so a delete looks
 * the same wherever they meet it.
 */
const LISTING_DELETE_SQUARE = cn(
  cornerClass('flush'),
  'flex h-full w-full items-center justify-center bg-surface-card p-0',
  'text-text-muted hover:bg-rose-50 hover:text-rose-600',
  'disabled:cursor-not-allowed disabled:opacity-60',
);
const LISTING_LINK_INSET_X = 'px-3';
const LISTING_LINK_IDENTITY_FACE = LISTING_LINK_INSET_X;

/** Save fills the row; Cancel sits on the trailing edge — no gap, no pad. */
const LISTING_EDITOR_ACTIONS =
  'grid w-full grid-cols-[minmax(0,1fr)_auto]';

/**
 * The editor opened FROM a link row lands on that row's identity rail:
 * 2rem lead cell + the identity's own `px-3` = 44px on each side. Without it
 * the compose fields (`px-0` by contract) start at the column edge, a third
 * left rail under the two the row and combo already share.
 *
 * The CREATE editor does NOT take it: it is a compose dock, not a row, so it
 * runs edge to edge and its Save fills the width.
 */
const LISTING_ROW_EDITOR_RAIL = 'px-11 pb-2';

/**
 * The ONE delete face in this leaf — row delete and Delete all both mount it.
 *
 * It arms on the first click and commits on the second: `receiving_listing_links`
 * has no soft-delete column and no undo behind it, so a single click on a
 * destructive verb is a slip the operator cannot take back. Moving the pointer
 * away or tabbing off disarms, which is why the confirm can live in the cell
 * instead of a modal over a scan bench.
 */
function ArmedDeleteCell({
  label,
  armedLabel,
  ariaLabel,
  armedAriaLabel,
  onConfirm,
  disabled = false,
}: {
  label: string;
  armedLabel: string;
  ariaLabel: string;
  armedAriaLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  return (
    <HoverTooltip label={armed ? armedLabel : label} asChild>
      <IconButton
        type="button"
        size="fill"
        icon={<Trash2 className={LISTING_LEAD_GLYPH} />}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          onConfirm();
        }}
        onMouseLeave={() => setArmed(false)}
        onBlur={() => setArmed(false)}
        disabled={disabled}
        ariaLabel={armed ? armedAriaLabel : ariaLabel}
        className={cn(LISTING_DELETE_SQUARE, armed && 'bg-rose-50 text-rose-600')}
      />
    </HoverTooltip>
  );
}

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
          {/* 1 — the band verbs: the SELECTED link, then the whole carton.
              Station chrome: full-bleed, one hairline seam. Open reads the
              combo below it; Open all never needs a selection. Copy all is not
              here — it heads the rows' Copy column on the combo seam. */}
          <div className="grid grid-cols-2 divide-x divide-border-hairline border-b border-border-hairline">
            <HoverTooltip
              label={selected ? `Open ${selected.name}` : 'Pick a listing link below'}
              asChild
            >
              <Button
                type="button"
                size="sm"
                variant="primarySoft"
                icon={<ExternalLink className="h-3.5 w-3.5" />}
                onClick={() => {
                  if (selected?.href) window.open(selected.href, '_blank', 'noopener,noreferrer');
                }}
                disabled={!selected?.href}
                ariaLabel="Open the selected listing link in a new tab"
                className="w-full"
              >
                Open
              </Button>
            </HoverTooltip>
            <HoverTooltip label="Open every listing link on this carton" asChild>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<ExternalLink className="h-3.5 w-3.5" />}
                onClick={openAll}
                disabled={links.length === 0}
                ariaLabel="Open every listing link in a new tab"
                className="w-full"
              >
                Open all
              </Button>
            </HoverTooltip>
          </div>

          {/* 2 — the header row, on the rows' own four columns:
              ＋ · picker | Copy all | count | Delete all. ＋ leads the wide
              cell exactly where a row's open glyph sits, so the picker's text
              lands on the same rail as every link name. */}
          <div className={LISTING_COMBO_GRID}>
            <div className={cn(LISTING_LINK_INSET_X, 'flex min-w-0 items-center gap-2')}>
              {store.supported ? (
                <HoverTooltip label="Add a listing link" asChild>
                  <IconButton
                    type="button"
                    icon={<Plus className={LISTING_LEAD_GLYPH} />}
                    onClick={() => setDraft({ href: '', label: '' })}
                    ariaLabel="Add a listing link"
                    className={cn(cornerClass('flush'), 'shrink-0 text-blue-600 hover:text-blue-700')}
                  />
                </HoverTooltip>
              ) : null}
              <SearchableSelectField
                value={selected?.href ?? null}
                onChange={(v) => setSelectedHref(typeof v === 'string' ? v : null)}
                options={links.map((l) => ({ value: l.href, label: l.name }))}
                appearance="flush"
                placeholder={store.loading ? 'Loading links…' : 'No listing links'}
                searchPlaceholder="Filter listings…"
                emptyMessage="No listing links"
                ariaLabel="Selected listing link"
                className="min-w-0 flex-1 px-0"
              />
            </div>
            {/* Copy all heads the rows' Copy column: the same verb, whole
                carton, directly above the per-row twins. */}
            <HoverTooltip label="Copy every listing link on this carton" asChild>
              <IconButton
                type="button"
                size="fill"
                icon={<Copy className={LISTING_LEAD_GLYPH} />}
                onClick={copyAll}
                disabled={links.length === 0}
                ariaLabel="Copy every listing link"
                className={LISTING_TRAIL_SQUARE}
              />
            </HoverTooltip>
            {/* A READOUT, never a control. The count is what the collapsed
                picker hides; the rows below spend this column on Edit, so
                nothing here may be clickable. */}
            <span className="flex items-center justify-center">
              <CursorPositionReadout total={links.length} totalOnly />
            </span>
            {/* Delete all heads the rows' Delete column, on the same armed
                face every delete in this leaf uses. */}
            {store.supported ? (
              <ArmedDeleteCell
                label="Delete every listing link on this carton"
                armedLabel={`Click again to delete all ${store.rows.length} links`}
                ariaLabel="Delete every listing link"
                armedAriaLabel={`Confirm deleting all ${store.rows.length} listing links`}
                disabled={store.rows.length === 0}
                onConfirm={() => {
                  void store.removeAll();
                  setSelectedHref(null);
                }}
              />
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
                // The CREATE editor is full-bleed: it is a compose dock, not a
                // row, so its fields run edge to edge and its Save fills the
                // width. Only the editor opened FROM a row takes that row's
                // rail ({@link LISTING_ROW_EDITOR_RAIL}).
                className="pb-2"
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

  /** This row's URL, on the operator's clipboard — the single-link twin of the
   *  band's Copy all. Recorded so the clipboard history names it. */
  const copyHref = () => {
    if (!link.href) return;
    void navigator.clipboard.writeText(link.href);
    recordCopy(link.href, { kind: 'id', display: link.name });
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
        {/* The whole row opens the link. */}
        <HoverTooltip label={`Open ${link.name}`} asChild>
          <button
            type="button"
            onClick={openExact}
            aria-label={`Open ${link.name} in a new tab`}
            className={cn(
              LISTING_LINK_IDENTITY_FACE,
              // min-h-9 = the combo's own h-9, so this row and the picker above
              // it are one column of equal boxes.
              'flex min-h-9 min-w-0 items-center gap-2 text-left',
              'hover:bg-surface-canvas/60',
              focusRing('cell'),
            )}
          >
            <ExternalLink className={cn(LISTING_LEAD_GLYPH, 'shrink-0 text-blue-600')} aria-hidden />
            {/* The NAME is the whole row. Where the link points is already on
                the carton context bar, and repeating the host under every row
                spent a second line on a fact this list was not asked for. */}
            <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
              {link.name}
            </span>
          </button>
        </HoverTooltip>

        <HoverTooltip label={`Copy ${link.name}`} asChild>
          <IconButton
            type="button"
            size="fill"
            icon={<Copy className={LISTING_LEAD_GLYPH} />}
            onClick={copyHref}
            ariaLabel={`Copy the URL for ${link.name}`}
            className={LISTING_TRAIL_SQUARE}
          />
        </HoverTooltip>

        {row || onPromote ? (
          <HoverTooltip label={editing ? 'Done editing' : `Edit ${link.name}`} asChild>
            <IconButton
              type="button"
              size="fill"
              icon={editing ? <Check className={LISTING_LEAD_GLYPH} /> : <Pencil className={LISTING_LEAD_GLYPH} />}
              onClick={() => {
                if (!row) {
                  onPromote?.();
                  return;
                }
                if (editing) commit();
                setEditing((v) => !v);
              }}
              ariaLabel={editing ? `Done editing ${link.name}` : `Edit ${link.name}`}
              className={LISTING_TRAIL_SQUARE}
            />
          </HoverTooltip>
        ) : (
          <span />
        )}

        {row ? (
          <ArmedDeleteCell
            label={`Delete ${link.name}`}
            armedLabel={`Click again to delete ${link.name}`}
            ariaLabel={`Delete ${link.name}`}
            armedAriaLabel={`Confirm deleting ${link.name}`}
            onConfirm={() => void onDelete(row.id)}
          />
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
        />
      ) : null}
    </div>
  );
}
