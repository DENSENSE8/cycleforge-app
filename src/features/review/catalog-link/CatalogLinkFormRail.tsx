'use client';

/**
 * Review · Catalog link RECORD plane — the two resolution forms, as NON-MODAL
 * right-rail occupants.
 *
 * They live here rather than in a cell popover because both are **side-effectful
 * multi-step work**: linking a chore backfills every matching order (and its
 * manuals), and supplying an Item Number re-runs the sheet → order import path
 * and CREATES an order. That is the record plane by the action-plane table
 * (`display/workbench.md`), which is also why the grid descriptor declares
 * `inCellEdit: false`.
 *
 * They also replace the in-flow `max-w-md` sibling column the surface used to
 * park beside its list — a permanently-mounted pane whose resting state was a
 * "Select a listing…" placeholder occupying a third of the workbench. A record
 * plane that is empty most of the time should not be holding width; the rail
 * mounts when a row is picked and pushes the grid rather than shrinking it
 * forever (`source-of-truth.md` → Right-rail modality).
 *
 * **Chrome is ONE band** ({@link DeskInspectorIndexShell}, `stance="standalone"`):
 * `[Title] ……… [verbs] [⤢] [✕]`. These two rails are reached by picking a
 * row on the queue behind them, not by walking an index, so they declare
 * `standalone` and are owed no Back cell.
 *
 * Until 2026-08-21 the header here was a `PaneHeader` whose `PaneHeaderActionBar`
 * carried its own `onClose` — a SECOND dismiss beside the host's singleton `✕`
 * that ran only the occupant's teardown and skipped `closeRightPanel`'s lifecycle
 * half — over a stacked `PaneHeaderIconBadge` + eyebrow/identity pair on a second
 * line. The verbs moved onto the one band; the identity
 * (item number / order id, platform, counts) was already a body fact row, which
 * is where it stays. Recipe: `display/right-rail-inspector.md`.
 *
 * **Occupant ids are STABLE** (`detail:catalog-link` / `detail:import-exception`),
 * not per-record: walking the queue row by row is the loop here, and a per-record
 * id would remount the whole push column on every step (`display/motion-crossfade.md`).
 * The exception's preconditions hold because each BODY is keyed on the record, so a
 * swap remounts it and every field re-seeds; nothing is auto-saved, so there is
 * no dirty draft to flush (a catalog pick for chore A must never survive onto
 * chore B).
 */

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Flag, Link2, Loader2 } from '@/components/Icons';
import { SearchField } from '@/design-system/primitives';
import { ListingApprovalSection } from '@/features/review/catalog-link/ListingApprovalSection';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import { OrderIdChip, TrackingChip } from '@/components/ui/CopyChip';
import {
  PaneHeaderActionBar,
  type PaneHeaderActionBarAction,
} from '@/components/ui/pane-header';
import { toast } from '@/lib/toast';
import { formatDateTimePST } from '@/utils/date';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';
import { cn } from '@/utils/_cn';

/** Stable occupant ids — see the docblock. Do NOT key these on the record. */
const CATALOG_LINK_RAIL_ID = 'detail:catalog-link';
const IMPORT_EXCEPTION_RAIL_ID = 'detail:import-exception';

interface CatalogSearchRow {
  id: number;
  sku: string;
  product_title: string | null;
}

// ── Shared chrome ─────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <span className="shrink-0 text-role-eyebrow uppercase tracking-widest text-text-soft">
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-role-caption text-text-default">
        {children}
      </span>
    </div>
  );
}

function RailError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p className="text-role-caption">{message}</p>
    </div>
  );
}

function SeenLine({ firstSeenAt, lastSeenAt }: { firstSeenAt: string; lastSeenAt: string }) {
  return (
    <p className="text-role-micro uppercase tracking-widest text-text-faint">
      First {formatDateTimePST(firstSeenAt)} · Last {formatDateTimePST(lastSeenAt)}
    </p>
  );
}

/**
 * ONE band + one body — the whole rail chrome.
 *
 * The band is {@link DeskInspectorIndexShell} in its `standalone` stance: no
 * index sits above these forms, so no Back cell is owed and none is painted.
 * `headerRightSlot` carries the contextual verbs; the shell reserves the
 * trailing cell the host paints its `⤢` / `✕` into, so this file paints no
 * close of its own.
 */
function RecordRailShell({
  title,
  ariaLabel,
  testId,
  actions,
  facts,
  children,
}: {
  /** The CURRENT segment, one short noun phrase — never a path or an eyebrow pair. */
  title: string;
  ariaLabel: string;
  testId: string;
  actions: PaneHeaderActionBarAction[];
  facts?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card">
      <DeskInspectorIndexShell
        stance="standalone"
        title={title}
        ariaLabel={ariaLabel}
        testId={testId}
        headerRightSlot={
          <PaneHeaderActionBar
            iconOnly
            variant="flat"
            className="py-0"
            actions={actions}
          />
        }
        body={
          <div className="flex min-h-0 flex-col">
            {facts ? (
              <div className="shrink-0 space-y-1.5 border-b border-border-hairline px-4 py-3">
                {facts}
              </div>
            ) : null}
            <div className="min-h-0 flex-1 space-y-4 bg-surface-card p-4">
              {children}
            </div>
          </div>
        }
      />
    </div>
  );
}

/**
 * What one link actually did, in the operator's nouns.
 *
 * Honest absence both ways: a link that healed nothing says so plainly rather
 * than reporting "0 orders", and manuals are named only when some moved — a
 * count that is almost always zero is noise on every other link.
 */
function linkResultMessage(
  sku: string,
  body: { ordersBackfilled?: unknown; manualsBackfilled?: unknown },
): string {
  const orders = Number(body.ordersBackfilled) || 0;
  const manuals = Number(body.manualsBackfilled) || 0;
  if (orders === 0 && manuals === 0) return `Linked to ${sku}.`;

  const parts: string[] = [];
  if (orders > 0) parts.push(`${orders} order${orders === 1 ? '' : 's'}`);
  if (manuals > 0) parts.push(`${manuals} manual${manuals === 1 ? '' : 's'}`);
  return `Linked to ${sku} · ${parts.join(' · ')} backfilled.`;
}

// ── Tab A · Link a listing to the catalog ─────────────────────────────────────

function CatalogLinkFormBody({
  chore,
  onDone,
}: {
  chore: CatalogLinkChoreRow;
  onDone: () => void;
}) {
  // Seeded from the listing title — the operator's first search is almost always
  // "the first few words of what this is". Kept as component state (not a URL
  // param): it is a draft over one record, and the body remounts per record.
  const [query, setQuery] = useState(
    chore.productTitle?.split(/\s+/).slice(0, 3).join(' ') || '',
  );
  const [results, setResults] = useState<CatalogSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CatalogSearchRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/sku-catalog/search?q=${encodeURIComponent(term)}&searchField=zoho_catalog&limit=20`,
          { credentials: 'same-origin' },
        );
        const body = await res.json();
        if (!cancelled && body.success) setResults(body.items || []);
      } catch {
        /* best-effort — the picker degrades to empty, it never fails the form */
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const submitLink = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/review/catalog-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'link', choreId: chore.id, skuCatalogId: selected.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || 'Link failed');
      // ONE link heals EVERY order in the org whose item number normalizes to
      // this listing — `batchPair` runs a single set-based UPDATE, including
      // over historical rows that never enqueued a chore. The route has always
      // returned that count and this rail has always dropped it, so the
      // operator saw one row leave the queue and had no way to know the other
      // eleven had just been fixed with it. The rail closes on `onDone`, so the
      // toast is the only surface left that can say so.
      toast.success(linkResultMessage(selected.sku, body));
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Link failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitIgnore = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/review/catalog-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'ignore', choreId: chore.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || 'Ignore failed');
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ignore failed');
    } finally {
      setSubmitting(false);
    }
  };

  const headerActions: PaneHeaderActionBarAction[] = [
    {
      key: 'link',
      label: submitting && selected ? 'Linking…' : 'Link listing',
      icon: submitting && selected ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Link2 className="h-3.5 w-3.5" />
      ),
      onClick: () => void submitLink(),
      disabled: !selected || submitting,
      toneClassName: 'text-blue-700',
      title: selected
        ? `Link listing to ${selected.sku}`
        : 'Pick a catalog SKU first',
    },
    {
      key: 'ignore',
      label: 'Ignore',
      icon: <Flag className="h-3.5 w-3.5" />,
      onClick: () => void submitIgnore(),
      disabled: submitting,
      toneClassName: 'text-text-soft',
      title: 'Ignore this catalog-link chore',
    },
  ];

  return (
    <RecordRailShell
      title="Catalog"
      ariaLabel="Link listing to catalog"
      testId="catalog-link-rail"
      actions={headerActions}
      facts={
        <>
          {chore.productTitle ? (
            <FieldRow label="Product">{chore.productTitle}</FieldRow>
          ) : null}
          <FieldRow label="Item number">
            <OrderIdChip
              value={chore.itemNumber}
              display={chore.itemNumber}
              plain
              truncateDisplay={false}
              fitDisplayWidth
            />
          </FieldRow>
          <FieldRow label="Account">
            {(() => {
              const meta = sourcePlatformMetaFromLabel(chore.accountSource);
              return meta.value ? (
                <HoverTooltip label={meta.label} asChild focusable={false}>
                  <span className="inline-flex shrink-0" aria-label={meta.label}>
                    <PlatformMark platformValue={meta.value} meta={meta} />
                  </span>
                </HoverTooltip>
              ) : (
                '—'
              );
            })()}
          </FieldRow>
          <FieldRow label="Orders blocked">
            <span className="tabular-nums">{chore.orderCount}</span>
          </FieldRow>
          {chore.sku ? <FieldRow label="Sheet SKU">{chore.sku}</FieldRow> : null}
          <SeenLine firstSeenAt={chore.firstSeenAt} lastSeenAt={chore.lastSeenAt} />
        </>
      }
    >
      <SearchField
        value={query}
        onChange={setQuery}
        onClear={() => setQuery('')}
        placeholder="Search catalog SKU or title…"
        isSearching={searching}
        debounceMs={250}
        tone="blue"
      />

      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center">
          <p className="text-role-caption font-semibold text-text-soft">
            {query.trim()
              ? searching
                ? 'Searching the catalog…'
                : `No catalog SKU matches “${query.trim()}”.`
              : 'Search the catalog to pick the SKU this listing belongs to.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {results.map((row) => {
            const active = selected?.id === row.id;
            return (
              <li key={row.id}>
                {/* ds-raw-button: catalog pick row (two-line, selectable), not Button chrome */}
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  aria-pressed={active}
                  className={cn(
                    'ds-raw-button flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors',
                    focusRing('control', 'neutral'),
                    active
                      ? 'bg-blue-50 ring-1 ring-inset ring-blue-400'
                      : 'hover:bg-surface-sunken',
                  )}
                >
                  <span className="text-role-caption font-semibold text-text-default">{row.sku}</span>
                  <span className="truncate text-role-micro uppercase tracking-widest text-text-soft">
                    {row.product_title || 'Untitled'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error ? <RailError message={error} /> : null}
    </RecordRailShell>
  );
}

/**
 * Claims the single right-rail slot while a chore is picked. Renders nothing
 * itself — `RightRailHost` renders the top occupant, which is why no surface
 * ever hand-rolls its own `fixed right-0` panel.
 */
export function CatalogLinkFormRail({
  chore,
  onClose,
  onDone,
}: {
  chore: CatalogLinkChoreRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <DetailStackRailRegistrar
      id={CATALOG_LINK_RAIL_ID}
      enabled={chore != null}
      onClose={onClose}
      modal={false}
      ariaLabel="Link listing to catalog"
    >
      {chore ? (
        // Keyed on the record so a queue step remounts the body and every field
        // re-seeds — the precondition for the stable-occupant-id exception.
        <CatalogLinkFormBody
          key={chore.id}
          chore={chore}
          onDone={onDone}
        />
      ) : null}
    </DetailStackRailRegistrar>
  );
}

// ── Tab B · Supply the missing Item Number ────────────────────────────────────

function ImportExceptionFormBody({
  row,
  onDone,
}: {
  row: ImportExceptionRow;
  onDone: () => void;
}) {
  const [itemNumber, setItemNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * `explicit` is the one-shot Approve & resolve path: that flow sets the field
   * and commits in the same beat, and `itemNumber` would still hold the PREVIOUS
   * render's value at this point — so the approved candidate is passed in rather
   * than read back out of state.
   */
  const submitResolve = async (explicit?: string) => {
    const trimmed = (explicit ?? itemNumber).trim();
    if (!trimmed) {
      setError('Item Number is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/review/import-exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'resolve', id: row.id, itemNumber: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || 'Resolve failed');
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Resolve failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitIgnore = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/review/import-exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'ignore', id: row.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || 'Ignore failed');
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ignore failed');
    } finally {
      setSubmitting(false);
    }
  };

  const headerActions: PaneHeaderActionBarAction[] = [
    {
      key: 'resolve',
      label: submitting ? 'Resolving…' : 'Resolve',
      icon: submitting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Check className="h-3.5 w-3.5" />
      ),
      onClick: () => void submitResolve(),
      disabled: !itemNumber.trim() || submitting,
      toneClassName: 'text-blue-700',
      title: 'Resolve with the item number below',
    },
    {
      key: 'ignore',
      label: 'Ignore',
      icon: <Flag className="h-3.5 w-3.5" />,
      onClick: () => void submitIgnore(),
      disabled: submitting,
      toneClassName: 'text-text-soft',
      title: 'Ignore this import exception',
    },
  ];

  return (
    <RecordRailShell
      title="Item number"
      ariaLabel="Supply the missing item number"
      testId="import-exception-rail"
      actions={headerActions}
      facts={
        <>
          {row.productTitle ? <FieldRow label="Product">{row.productTitle}</FieldRow> : null}
          <FieldRow label="Order">
            <OrderIdChip
              value={row.accountOrderId}
              display={row.accountOrderId}
              plain
              truncateDisplay={false}
              fitDisplayWidth
            />
          </FieldRow>
          <FieldRow label="Account">
            {(() => {
              const meta = sourcePlatformMetaFromLabel(row.accountSource);
              return meta.value ? (
                <HoverTooltip label={meta.label} asChild focusable={false}>
                  <span className="inline-flex shrink-0" aria-label={meta.label}>
                    <PlatformMark platformValue={meta.value} meta={meta} />
                  </span>
                </HoverTooltip>
              ) : (
                '—'
              );
            })()}
          </FieldRow>
          {row.tracking ? (
            <FieldRow label="Tracking">
              <TrackingChip value={row.tracking} dense />
            </FieldRow>
          ) : null}
          {row.sheetRow != null ? (
            <FieldRow label="Sheet row">
              <span className="tabular-nums">{row.sheetRow}</span>
            </FieldRow>
          ) : null}
          <FieldRow label="Seen">
            <span className="tabular-nums">×{row.seenCount}</span>
          </FieldRow>
          <SeenLine firstSeenAt={row.firstSeenAt} lastSeenAt={row.lastSeenAt} />
        </>
      }
    >
      <ListingApprovalSection
        accountSource={row.accountSource}
        productTitle={row.productTitle}
        itemNumber={itemNumber}
        onItemNumberChange={setItemNumber}
        onSubmit={() => void submitResolve()}
        disabled={submitting}
      />

      {error ? <RailError message={error} /> : null}
    </RecordRailShell>
  );
}

/** Claims the right-rail slot while a missing-item-number row is picked. */
export function ImportExceptionFormRail({
  row,
  onClose,
  onDone,
}: {
  row: ImportExceptionRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <DetailStackRailRegistrar
      id={IMPORT_EXCEPTION_RAIL_ID}
      enabled={row != null}
      onClose={onClose}
      modal={false}
      ariaLabel="Supply the missing item number"
    >
      {row ? (
        <ImportExceptionFormBody
          key={row.id}
          row={row}
          onDone={onDone}
        />
      ) : null}
    </DetailStackRailRegistrar>
  );
}
