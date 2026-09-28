'use client';

/**
 * The purchase order card — a PO being imported through chat
 * (`draft_po_import`). Inline, triage face: identity first (PO number,
 * vendor), then the items, the tracking, what already exists, and the
 * "Still needed" checklist.
 *
 * Every action is a request, never a write from here:
 *  - a Still needed chip → drops that field's answer stub into the composer
 *    and focuses it (the operator types the value, the next turn updates
 *    this same draft);
 *  - Import → a chat turn ("Import this PO"), which proposes and waits for
 *    the operator's yes (confirm-before-write);
 *  - an existing PO / tracking → its receiving record.
 */

import { useRouter } from 'next/navigation';
import { AlertCircle, ExternalLink, Send } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { requestComposerSeed } from '@/lib/assistant/composer-seed-store';
import type { ArtifactPoDraft } from '@/lib/assistant/ui-artifacts';
import { formatCostCents } from '@/lib/inbound/po-import-draft';
import { searchHitHref } from '@/lib/search/search-hit';
import { cn } from '@/utils/_cn';

const LABEL = 'text-ai-label text-ai-faint';

function civilDateFace(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function PoDraftArtifact({ artifact }: { artifact: ArtifactPoDraft }) {
  const router = useRouter();
  const { draft, missing, duplicates, notes } = artifact;
  const poTaken = duplicates.some((d) => d.field === 'po_number');
  const ready = missing.length === 0 && !poTaken;

  return (
    <div className="flex min-w-0 flex-col gap-3 px-3 py-3 text-ai-prose-sm text-ai-ink" data-po-draft>
      {/* ── identity ── */}
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-mono text-ai-title font-semibold" data-po-number>
            {draft.poNumber || 'No PO number yet'}
          </span>
          <span className="min-w-0 truncate font-medium">{draft.vendor || 'Vendor not named yet'}</span>
        </div>
        <span
          className={cn('text-ai-label font-medium', ready ? 'text-ai-ink' : 'text-text-warning')}
          data-po-status
        >
          {poTaken ? 'Already imported' : ready ? 'Ready to import' : 'Draft'}
        </span>
      </div>

      {/* ── items ── */}
      <ol className="flex flex-col divide-y divide-ai-line rounded-ai-card border border-ai-line" data-po-lines>
        {draft.lines.map((line, i) => (
          <li key={`${line.sku}-${i}`} className="flex min-w-0 items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="min-w-0 font-medium">{line.title || line.sku}</p>
              <p className="text-ai-label text-ai-faint">
                {line.sku ? <span className="font-mono">{line.sku}</span> : 'Not in the catalog'}
                {line.itemNumber ? (
                  <>
                    {' · '}
                    <a
                      href={line.listingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-2 hover:text-ai-ink hover:underline"
                    >
                      Item {line.itemNumber}
                    </a>
                  </>
                ) : null}
              </p>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <p>
                {line.quantity == null ? <span className="text-text-warning">no quantity</span> : `${line.quantity} ×`}{' '}
                {line.unitCostCents == null ? (
                  <span className="text-ai-faint">no cost</span>
                ) : (
                  formatCostCents(line.unitCostCents, draft.currency)
                )}
              </p>
            </div>
          </li>
        ))}
        {draft.lines.length === 0 ? <li className="px-3 py-2 text-ai-faint">No items yet</li> : null}
      </ol>

      {/* ── facts ── */}
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className={LABEL}>Tracking</dt>
        <dd className="flex min-w-0 flex-wrap gap-1.5" data-po-tracking>
          {draft.tracking.length === 0 ? (
            <span className="text-ai-faint">None yet</span>
          ) : (
            draft.tracking.map((t) => (
              <span
                key={t.number}
                className="inline-flex items-center gap-1 rounded-full border border-ai-line px-2 py-0.5 font-mono text-ai-label"
              >
                {t.number}
                {t.carrier !== 'Unknown' ? <span className="font-sans text-ai-faint">{t.carrier}</span> : null}
              </span>
            ))
          )}
        </dd>
        <dt className={LABEL}>Expected</dt>
        <dd>{draft.expectedDate ? civilDateFace(draft.expectedDate) : <span className="text-ai-faint">Not set</span>}</dd>
        <dt className={LABEL}>For order</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-1.5" data-po-orders>
          {draft.forOrders.map((o) =>
            o.orderId != null ? (
              <button
                key={o.ref}
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-ai-line px-2 py-0.5 font-mono text-ai-label hover:text-ai-ink"
                title={o.title || undefined}
                onClick={() => router.push(searchHitHref('ORDER', o.orderId!))}
                data-po-order={o.orderNumber}
              >
                {o.orderNumber}
                {o.channel ? <span className="font-sans text-ai-faint">{o.channel}</span> : null}
              </button>
            ) : (
              <span key={o.ref} className="inline-flex items-center gap-1 text-text-warning" data-po-order-unresolved={o.ref}>
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {o.ref} · {o.why || 'no order matches'}
              </span>
            ),
          )}
          {draft.forOrders.length === 0 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              radius="pill"
              title="Which outbound order is this PO for?"
              onClick={() => requestComposerSeed({ text: 'For order:', autoSend: false })}
              data-po-add-order
            >
              Add order
            </Button>
          ) : null}
        </dd>
        {draft.notes ? (
          <>
            <dt className={LABEL}>Notes</dt>
            <dd className="min-w-0 whitespace-pre-line">{draft.notes}</dd>
          </>
        ) : null}
      </dl>

      {/* ── already on the Incoming spine ── */}
      {duplicates.length > 0 ? (
        <ul className="flex flex-col gap-1" data-po-duplicates>
          {duplicates.map((d) => (
            <li key={`${d.field}-${d.value}`} className="flex flex-wrap items-center gap-2 text-text-warning">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>
                {d.field === 'po_number'
                  ? `PO ${d.value} is already imported`
                  : `Tracking ${d.value} is already on a receiving carton — this PO joins it`}
              </span>
              {d.path ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<ExternalLink className="h-3.5 w-3.5" />}
                  onClick={() => router.push(d.path!)}
                >
                  Open
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {notes.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-ai-label text-ai-faint">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      {/* ── still needed ── */}
      {missing.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-ai-card bg-ai-sunken px-3 py-2" data-po-missing>
          <span className="text-ai-label font-medium text-text-warning">Still needed</span>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((need) => (
              <Button
                key={need.label}
                type="button"
                variant="secondary"
                size="sm"
                radius="pill"
                title={need.question}
                onClick={() => requestComposerSeed({ text: need.prompt, autoSend: false })}
                data-po-need={need.field}
              >
                {need.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── actions ── */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          icon={<Send className="h-3.5 w-3.5" />}
          disabled={!ready}
          title={ready ? undefined : poTaken ? 'This PO number is already imported' : 'Fill in what is still needed first'}
          onClick={() => requestComposerSeed({ text: 'Import this PO', autoSend: true })}
          data-po-import
        >
          Import
        </Button>
      </div>
    </div>
  );
}
