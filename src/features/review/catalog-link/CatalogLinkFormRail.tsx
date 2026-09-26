'use client';

/** Review · Catalog link RECORD plane — the two resolution forms, as NON-MODAL right-rail occupants. */

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Flag, Link2, Loader2, Package } from '@/components/Icons';
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
import { cornerClass } from '@/design-system/tokens/radius';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import {
  IMPORT_EXCEPTION_REASON_TEXT,
  type ImportExceptionRow,
} from '@/features/review/catalog-link/import-exception-types';
import { cn } from '@/utils/_cn';

/** Stable occupant ids — see the docblock. Do NOT key these on the record. */
const CATALOG_LINK_RAIL_ID = 'detail:catalog-link';
const IMPORT_EXCEPTION_RAIL_ID = 'detail:import-exception';

interface CatalogSearchRow {
  id: number;
  sku: string;
  product_title: string | null;
  image_url?: string | null;
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

/** ONE band + one body — the whole rail chrome. */
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

/** What one link actually did, in the operator's nouns. */
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
      // ONE link heals EVERY order in the org whose item number normalizes to this listing — `batchPair` runs a single set-based UPDATE,…
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
                    'ds-raw-button flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                    cornerClass('control'),
                    focusRing('control', 'neutral'),
                    active
                      ? 'bg-surface-hover ring-1 ring-inset ring-border-default'
                      : 'hover:bg-surface-sunken',
                  )}
                >
                  <span
                    className={cn(
                      'relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden bg-surface-canvas ring-1 ring-border-soft',
                      cornerClass('row'),
                    )}
                    aria-hidden
                  >
                    {row.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Zoho proxy host
                      <img
                        src={row.image_url}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <Package className="h-4 w-4 text-text-faint" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-role-caption font-semibold text-text-default">
                      {row.product_title || 'Untitled'}
                    </span>
                    <span className="truncate font-mono text-role-micro text-text-soft">
                      {row.sku}
                    </span>
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

  /** `explicit` is the one-shot Approve & resolve path: */
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

  // Only a missing item number resolves by typing one; a ShipStation
  // quarantine clears itself on the next sync once its cause is fixed.
  const resolvable = row.reason === 'no_item_number';
  const reasonText = IMPORT_EXCEPTION_REASON_TEXT[row.reason];
  const resolveAction: PaneHeaderActionBarAction = {
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
  };
  const headerActions: PaneHeaderActionBarAction[] = [
    ...(resolvable ? [resolveAction] : []),
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
          {!resolvable ? <FieldRow label="Reason">{reasonText.label}</FieldRow> : null}
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
      {resolvable ? (
        <ListingApprovalSection
          accountSource={row.accountSource}
          productTitle={row.productTitle}
          itemNumber={itemNumber}
          onItemNumberChange={setItemNumber}
          onSubmit={() => void submitResolve()}
          disabled={submitting}
        />
      ) : (
        <p className="text-role-caption text-text-muted">{reasonText.hint}</p>
      )}

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
