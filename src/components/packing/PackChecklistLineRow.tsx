'use client';

import { useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from '@/design-system/motion';
import { Check, FileText, Package } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

import { InlineNotice } from '@/design-system/components';
import { Button } from '@/design-system/primitives';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { ItemRecordRow } from '@/design-system/components/item-record/ItemRecordRow';
import type { ItemRecord } from '@/design-system/components/item-record/item-record-types';
import type { PackChecklistLineDto, PackKitPartDto, PackCheckDto } from '@/lib/packing/order-pack-checklist';
import type { KitPartDocument } from '@/lib/packing/kit-part-document';
import { cn } from '@/utils/_cn';

interface PackChecklistLineRowProps {
  line: PackChecklistLineDto;
  checked: boolean;
  expanded: boolean;
  onToggleCheck: () => void;
  onToggleExpand: () => void;
  tickedKitParts: ReadonlySet<number>;
  onToggleKitPart: (partId: number) => void;
  tickedChecks: ReadonlySet<number>;
  onToggleCheckItem: (checkId: number) => void;
  variant: 'station' | 'mobile' | 'panel';
  /**
   * Open a kit part's reference document. Omitted ⇒ no part renders its
   * document strip, so a host that has not mounted the slide-over cannot paint
   * a View control that does nothing.
   */
  onOpenPartDocument?: (partId: number) => void;
  /**
   * Print a kit part's insert and tick it as durable `print` evidence.
   * Paired with {@link onOpenPartDocument} — both required for the strip.
   */
  onPrintPartDocument?: (partId: number) => void;
}

const PART_TYPE_TAG: Record<string, string> = {
  ACCESSORY: 'Accessory',
  CABLE: 'Cable',
  MANUAL: 'Manual',
  ADAPTER: 'Adapter',
};

/**
 * Reference-document disclosure — the paper this part puts in the box.
 *
 * Candidate B of the 2026-08-01 ruling (docs/todo/step-document-reveal-RULING.md):
 * a SMALL fixed-height strip in the row that names the insert, with the full
 * read handed off to the 640px `DocumentSlideOver`. Deliberately NOT the
 * requested split-reveal — a PDF page at this width is ~6pt equivalent body
 * text, unreadable at 3ft standing, and displacing the row's neighbours at
 * bench cadence is the disorientation that killed the mid-canvas capture stack.
 *
 * MOTION. `framerPresence.collapseHeight` is the sanctioned low-frequency
 * expand/collapse, and this fires at most twice per part, on the operator's own
 * tap — never on a scan. The strip is present while the part is UNCONFIRMED and
 * collapses when it is ticked, because at that point the operator has the paper
 * and the reference has done its job.
 *
 * The clip is RELEASED once settled: `overflow-hidden` is needed while the
 * height tweens, but the View control's focus ring is outward and would be
 * sheared off by a permanent clip (same trap as the auth step panel —
 *
 *
 * EVIDENCE. Print is the durable path (spool intent at the bench); View is
 * recognition-only; the parent row's checkbox remains the advisory
 * acknowledgement override (§3 of the ruling).
 */
function KitPartDocumentStrip({
  // Aliased: `document` is a browser global, and shadowing it inside a
  // component that also renders DOM is a debugging trap.
  document: doc,
  onView,
  onPrint,
}: {
  document: KitPartDocument;
  onView: () => void;
  onPrint: () => void;
}) {
  const [settled, setSettled] = useState(false);
  const presence = useMotionPresence(framerPresence.collapseHeight);
  const transition = useMotionTransition(framerTransition.stationCollapse);

  return (
    <motion.div
      initial={presence.initial}
      animate={presence.animate}
      exit={presence.exit}
      transition={transition}
      onAnimationStart={() => setSettled(false)}
      onAnimationComplete={() => setSettled(true)}
      className={cn('px-1 -mx-1', settled ? 'overflow-visible' : 'overflow-hidden')}
      data-testid="kit-part-document-strip"
    >
      <div className="mt-1 flex items-center gap-2 rounded-none border border-border-soft bg-surface-card px-2 py-1.5">
        <FileText className="h-3.5 w-3.5 shrink-0 text-text-soft" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-role-micro font-semibold text-text-muted">
          {doc.title}
        </span>
        <Button variant="ghost" size="sm" onClick={onView}>
          View
        </Button>
        <Button variant="secondary" size="sm" onClick={onPrint}>
          Print
        </Button>
      </div>
    </motion.div>
  );
}

function SubCheckRow({
  checked,
  onToggle,
  label,
  qty,
  tag,
  critical,
  document: doc,
  onViewDocument,
  onPrintDocument,
  testId,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  qty?: number;
  tag?: string;
  critical?: boolean;
  /** Present only for a part that carries an insert; null renders as before. */
  document?: KitPartDocument | null;
  onViewDocument?: () => void;
  onPrintDocument?: () => void;
  /**
   * Per-row handle so a test can assert the document strip is present on THIS
   * part and absent on its sibling — "no strip" is the half of the contract a
   * page-wide selector cannot prove.
   */
  testId?: string;
}) {
  const hasDocument = Boolean(doc && onViewDocument && onPrintDocument);

  return (
    <li data-testid={testId}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        className={`ds-raw-button flex w-full items-center gap-2 rounded-none border px-2 py-1.5 text-left transition-colors ${
          checked
            ? 'border-emerald-200 bg-emerald-50'
            : critical
              ? 'border-amber-200 bg-surface-card hover:bg-amber-50'
              : 'border-border-soft bg-surface-card hover:bg-surface-hover'
        }`}
      >
        <span
          aria-hidden
          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-none border ${
            checked
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-border-default bg-surface-card'
          }`}
        >
          {checked && <Check className="h-2.5 w-2.5" />}
        </span>
        <span className={`flex-1 text-role-micro font-semibold ${checked ? 'text-emerald-700 line-through' : 'text-text-default'}`}>
          {label}
        </span>
        {qty && qty > 1 ? (
          <span className="text-role-eyebrow tabular-nums text-text-soft">×{qty}</span>
        ) : null}
        {tag ? (
          <span className="rounded-none bg-surface-sunken px-1 py-0.5 text-role-eyebrow uppercase text-text-soft">
            {tag}
          </span>
        ) : null}
        {critical && !checked ? (
          <span className="rounded-none bg-amber-100 px-1 py-0.5 text-role-eyebrow uppercase text-amber-700">
            Required
          </span>
        ) : null}
        {/* Document-bearing parts: the tap is the advisory override. Print on
            the strip below is the durable path — keep that class legible. */}
        {hasDocument && !checked ? (
          <span className="rounded-none bg-surface-sunken px-1 py-0.5 text-role-eyebrow uppercase text-text-soft">
            Confirm
          </span>
        ) : null}
      </button>

      <AnimatePresence initial={false}>
        {doc && !checked && onViewDocument && onPrintDocument ? (
          <KitPartDocumentStrip
            document={doc}
            onView={onViewDocument}
            onPrint={onPrintDocument}
          />
        ) : null}
      </AnimatePresence>
    </li>
  );
}

export function PackChecklistLineRow({
  line,
  checked,
  expanded,
  onToggleCheck,
  onToggleExpand,
  tickedKitParts,
  onToggleKitPart,
  tickedChecks,
  onToggleCheckItem,
  variant: _variant,
  onOpenPartDocument,
  onPrintPartDocument,
}: PackChecklistLineRowProps & { onToggleCheckItem: (checkId: number) => void }) {
  const item: ItemRecord = {
    id: line.orderRowId,
    title: line.productTitle,
    imageUrl: line.catalog.imageUrl,
    sku: line.sku,
    quantity: { expected: line.quantity },
    conditionGrade: line.condition,
    serials: line.serials,
  };

  return (
    <ItemRecordRow
      item={item}
      className="border-b border-border-hairline last:border-b-0"
      titleActions={
        <HoverTooltip label="Confirm this item is in the box" asChild>
          <button type="button" aria-pressed={checked} aria-label="Confirm line item" onClick={onToggleCheck} className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-none border border-border-default">
            {checked && <Check className="h-3 w-3 text-emerald-600" />}
          </button>
        </HoverTooltip>
      }
      disclosure={{ expanded, onToggle: onToggleExpand, label: `${expanded ? 'Hide' : 'Show'} details for ${line.productTitle}` }}
      body={
        <div className="space-y-3 border-t border-border-hairline bg-surface-canvas/60 px-3 py-3">


          {/* Larger photo + visual verification emphasis (top priority: confirm SKU photo matches physical) */}
          <div className="flex gap-3">
            <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-none border border-border-soft bg-surface-card ring-1 ring-inset ring-blue-100">
              {line.catalog.imageUrl ? (
                <Image
                  src={line.catalog.imageUrl}
                  alt={line.productTitle}
                  fill
                  className="object-cover"
                  sizes="112px"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-text-faint">
                  <Package className="h-10 w-10 opacity-40" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest text-blue-700 ring-1 ring-inset ring-blue-200">
                Visual match — confirm photo = physical item
              </div>
              <dl className="min-w-0 flex-1 space-y-1">
                {line.catalog.category ? (
                  <div>
                    <dt className="text-role-eyebrow uppercase tracking-widest text-text-faint">Category</dt>
                    <dd className="text-role-caption font-semibold text-text-default">{line.catalog.category}</dd>
                  </div>
                ) : null}
                {line.catalog.upc ? (
                  <div>
                    <dt className="text-role-eyebrow uppercase tracking-widest text-text-faint">UPC</dt>
                    <dd className="font-mono text-role-caption font-semibold text-text-muted">{line.catalog.upc}</dd>
                  </div>
                ) : null}
                {line.serials.length > 0 ? (
                  <div>
                    <dt className="text-role-eyebrow uppercase tracking-widest text-text-faint">Serials</dt>
                    <dd className="font-mono text-role-micro text-text-default">{line.serials.join(', ')}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>

          {line.catalog.packNotes ? (
            <InlineNotice tone="info" size="sm" title="How to pack">
              {line.catalog.packNotes}
            </InlineNotice>
          ) : null}

          {line.kitParts.length > 0 ? (
            <div>
              <p className="mb-1.5 text-role-eyebrow uppercase tracking-wider text-text-faint">In the box</p>
              <ul className="space-y-1">
                {line.kitParts.map((part: PackKitPartDto) => (
                  <SubCheckRow
                    key={part.id}
                    checked={tickedKitParts.has(part.id)}
                    onToggle={() => onToggleKitPart(part.id)}
                    label={part.name}
                    qty={part.qty > 1 ? part.qty : undefined}
                    tag={PART_TYPE_TAG[part.type]}
                    critical={part.critical}
                    document={part.document}
                    onViewDocument={
                      onOpenPartDocument ? () => onOpenPartDocument(part.id) : undefined
                    }
                    onPrintDocument={
                      onPrintPartDocument ? () => onPrintPartDocument(part.id) : undefined
                    }
                    testId={`pack-kit-part-${part.id}`}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {line.qcFlags.length > 0 ? (
            <div>
              <p className="mb-1.5 text-role-eyebrow uppercase tracking-wider text-text-faint">
                Verify before sealing
              </p>
              <ul className="space-y-1">
                {line.qcFlags.map((check: PackCheckDto) => (
                  <SubCheckRow
                    key={check.id}
                    checked={tickedChecks.has(check.id)}
                    onToggle={() => onToggleCheckItem(check.id)}
                    label={check.label}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      }
    />
  );
}
