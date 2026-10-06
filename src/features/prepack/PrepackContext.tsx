'use client';

import { useMemo } from 'react';
import { Check, Pencil, X } from '@/components/Icons';
import { LabelFacePreview } from '@/design-system/components/LabelFacePreview';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { motionDuration, motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { AnimateText } from '@/design-system/motion/plus';
import { Button } from '@/design-system/primitives';
import type { QcLabelPrintUnit } from '@/lib/labels/qc-label-row';
import { PREPACK_CONDITION_LABEL, type PrepackCatalogChoice, type PrepackKit } from '@/lib/prepack/types';
import { qcLabelFaceInput } from '@/lib/print/printQcLabel';
import { productLabelFace } from '@/lib/print/unitLabelCore';
import { ProductIdentity } from './prepack-ui';
import type { PackageDraft, PrepackFormState, SerialVerdict } from './usePrepackForm';

export const PREPACK_REST_HINT =
  'Scan the serial number to identify the product. If the serial number is not in the system, pick the product manually.';

/** The context hint for the serial verdict: rest → not in the system → matched. */
export function prepackHint(verdict: SerialVerdict, editing: boolean): string {
  if (editing) return 'Pick the product for this package.';
  switch (verdict.kind) {
    case 'new':
      return 'Not in the system. Pick the product.';
    case 'unpaired':
      return 'No product on this serial yet. Pick the product.';
    case 'none':
      return 'No serial. Pick the product.';
    case 'matched':
      return `Matched ${verdict.serial}.`;
    default:
      return PREPACK_REST_HINT;
  }
}

/** Per-word blur-in when the hint changes; never a typewriter (it delays reading). */
export function PrepackHint({ text }: { text: string }) {
  const reduced = useReducedMotion();
  const row = useMotionTransition(motionTransition.findListRow);
  return (
    <p className="break-words text-role-caption text-text-muted" aria-live="polite" data-testid="prepack-hint">
      {reduced ? text : (
        <motion.span
          key={text}
          className="inline"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: motionDuration.findListRowStagger } } }}
        >
          <AnimateText
            type="word"
            variants={{
              hidden: motionPresence.findListRow.initial,
              visible: { ...motionPresence.findListRow.animate, transition: row },
            }}
          >
            {text}
          </AnimateText>
        </motion.span>
      )}
    </p>
  );
}

/** A package's label before save: the face the printer will paint (a pair's KIT code is minted on save). */
export function previewPrintUnit(pkg: PackageDraft, catalog: PrepackCatalogChoice): QcLabelPrintUnit {
  return {
    serial_unit_id: 0,
    unit_uid: null,
    serial_number: pkg.serials[0] ?? null,
    sku: catalog.sku,
    title: catalog.title,
    condition_grade: pkg.condition,
    printed: false,
    package: pkg.serials.length > 1 ? { id: 0, uid: 'KIT-…', serial_count: pkg.serials.length } : null,
    label_title: pkg.label.title,
    label_color: pkg.label.color,
    label_text: pkg.label.text,
  };
}

const DECK_VISIBLE = 6;

/**
 * N label faces, stacked: package 1 at the back, each later face a strip lower
 * and in front, so every caption stays readable. A face leaves (print-banner
 * exit) as its job confirms; quantity adds and removes on the bump spring.
 */
export function PrepackLabelDeck({ state }: { state: PrepackFormState }) {
  const catalog = state.catalog;
  const bump = useMotionTransition(motionTransition.quantityBump);
  const morph = motionTransition.liveValueMorph;
  const cards = useMemo(() => {
    if (!catalog) return [];
    return state.packages.map((pkg, index) => {
      const unit = state.saved?.[index] ?? previewPrintUnit(pkg, catalog);
      return {
        key: pkg.key,
        index,
        condition: pkg.condition,
        face: productLabelFace(qcLabelFaceInput(unit))?.face ?? null,
      };
    }).slice(state.printedCount);
  }, [catalog, state.packages, state.printedCount, state.saved]);
  if (!catalog || cards.length === 0) return null;
  const shown = cards.slice(0, DECK_VISIBLE);
  const more = cards.length - shown.length;
  return (
    <section aria-label="Labels to print" className="space-y-2" data-testid="prepack-label-deck">
      <div className="grid">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((card, position) => (
            <motion.div
              key={card.key}
              layout
              className="col-start-1 row-start-1 overflow-hidden rounded-mode-control border border-mode-rule bg-surface-card shadow-sm"
              style={{ marginTop: `${position * 2.25}rem`, zIndex: position, transformOrigin: 'top center' }}
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 - (shown.length - 1 - position) * 0.02 }}
              exit={motionPresence.printBanner.exit}
              transition={bump}
              data-testid="prepack-label-card"
            >
              <p className="flex h-9 items-center justify-between gap-2 border-b border-mode-rule px-3 text-role-caption">
                <span className="font-semibold text-mode-ink">Label {card.index + 1}</span>
                <motion.span
                  key={card.condition ?? 'none'}
                  className={card.condition ? 'text-mode-ink' : 'text-text-muted'}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: [1, 0.25, 1] }}
                  transition={morph}
                >
                  {card.condition ? PREPACK_CONDITION_LABEL[card.condition] : 'Choose a condition'}
                </motion.span>
              </p>
              <div className="p-2">
                {card.face ? <LabelFacePreview model={card.face} embedded fit="host" /> : null}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {more > 0 ? <p className="text-role-caption text-text-muted">+{more} more {more === 1 ? 'label' : 'labels'}</p> : null}
    </section>
  );
}

/** The contents the packages carry, and the manual packers will print. */
export function PrepackContentsSummary({ kit, missing }: { kit: PrepackKit; missing: ReadonlySet<number> }) {
  const row = useMotionPresence(motionPresence.findListRow);
  const rowTransition = useMotionTransition(motionTransition.findListRow);
  const status = useMotionPresence(motionPresence.statusMessage);
  return (
    <section aria-label="Contents" className="space-y-2" data-testid="prepack-contents-summary">
      {kit.parts.length === 0 ? <p className="text-role-caption text-text-muted">No parts list.</p> : (
        <ul className="divide-y divide-mode-rule border-y border-mode-rule">
          <AnimatePresence initial={false}>
            {kit.parts.map((part, index) => {
              const included = !missing.has(part.id);
              return (
                <motion.li
                  key={part.id}
                  layout="position"
                  initial={row.initial}
                  animate={row.animate}
                  exit={row.exit}
                  transition={{ ...rowTransition, delay: Math.min(index, 10) * motionDuration.findListRowStagger }}
                  className="flex items-center gap-2 py-1.5 text-role-caption"
                >
                  {included ? <Check className="size-4 shrink-0 text-emerald-600" /> : <X className="size-4 shrink-0 text-rose-600" />}
                  <span className="min-w-0 flex-1 break-words text-mode-ink">
                    {part.qtyRequired > 1 ? `${part.qtyRequired} × ` : ''}{part.componentName}
                  </span>
                  <span className={included ? 'text-text-muted' : 'font-semibold text-rose-700'}>{included ? 'Included' : 'Missing'}</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      <AnimatePresence initial={false}>
        {kit.manual ? (
          <motion.p
            key={kit.manual.id}
            initial={status.initial}
            animate={status.animate}
            exit={status.exit}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-role-caption text-emerald-800"
            data-testid="prepack-manual-chip"
          >
            <Check className="size-3.5 shrink-0" />
            <span className="min-w-0 break-words">Manual paired — packers get <em className="font-semibold not-italic">{kit.manual.title}</em></span>
          </motion.p>
        ) : null}
      </AnimatePresence>
      {kit.children.length > 0 ? (
        <p className="break-words text-role-caption text-text-muted">
          Pairs with {kit.children.map((child) => child.sku).join(', ')}
        </p>
      ) : null}
    </section>
  );
}

/** The product hero: the browser row's photo lands here (shared `layoutId`). */
export function PrepackProductHero({ product, onEdit }: { product: PrepackCatalogChoice; onEdit: () => void }) {
  const morph = useMotionTransition(motionTransition.photoHeroMorph);
  return (
    <div className="relative">
      <ProductIdentity
        product={product}
        size="hero"
        photo={(thumb) => (
          <motion.div layoutId={`prepack-product-${product.id}`} transition={morph} className="size-full">
            {thumb}
          </motion.div>
        )}
      />
      <Button
        variant="ghost"
        size="md"
        icon={<Pencil />}
        ariaLabel="Change product"
        className="absolute right-0 top-0"
        onClick={onEdit}
        data-testid="prepack-hero-edit"
      />
    </div>
  );
}
