'use client';

import { ChevronDown, Pencil } from '@/components/Icons';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { LabelFacePreview } from '@/design-system/components/LabelFacePreview';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { Button } from '@/design-system/primitives';
import { qcLabelFaceInput } from '@/lib/print/printQcLabel';
import { productLabelFace } from '@/lib/print/unitLabelCore';
import {
  PrepackContentsSummary,
  PrepackHint,
  PrepackLabelDeck,
  PrepackProductHero,
  prepackHint,
  previewPrintUnit,
} from './PrepackContext';
import { PrepackManualManager } from './PrepackManualManager';
import { PrepackProductBrowser } from './PrepackProductBrowser';
import { PrepackGroup } from './PrepackSections';
import { ProductIdentity } from './prepack-ui';
import { serialSettled, type PrepackForm } from './usePrepackForm';

/**
 * Desk right column, always rendered: the hint and browser until a product is
 * chosen, then grouped cards — product, labels, contents, manual. Browser ⇄
 * hero swap on the focus role; the chosen row's photo flies into the hero
 * (`layoutId`).
 */
export function DeskContext({ form, focusSignal, staffId }: { form: PrepackForm; focusSignal: number; staffId: number }) {
  const { state } = form;
  const swap = useMotionRole(motionRole.swap.focus);
  const showBrowser = state.browsing || !state.catalog;
  const remaining = state.packages.length - state.printedCount;
  return (
    <div className="flex flex-col gap-4 px-mode-page py-4">
      <AnimatePresence mode="popLayout" initial={false}>
        {showBrowser ? (
          <motion.div key="browser" initial={swap.presence.initial} animate={swap.presence.animate} exit={swap.presence.exit} transition={swap.transition}>
            <PrepackGroup title="Find the product" hint={<PrepackHint text={prepackHint(state.verdict, Boolean(state.catalog) && state.browsing)} />}>
              <PrepackProductBrowser
                selectedId={state.catalog?.id ?? null}
                onChoose={form.chooseProduct}
                focusSignal={focusSignal}
                staffId={staffId}
              />
            </PrepackGroup>
          </motion.div>
        ) : state.catalog ? (
          <motion.div
            key={`hero-${state.catalog.id}`}
            className="flex flex-col gap-4"
            initial={swap.presence.initial}
            animate={swap.presence.animate}
            exit={swap.presence.exit}
            transition={swap.transition}
          >
            <PrepackGroup title="Product" hint={state.verdict.kind === 'matched' ? <PrepackHint text={prepackHint(state.verdict, false)} /> : undefined}>
              <PrepackProductHero product={state.catalog} onEdit={() => form.setBrowsing(true)} />
            </PrepackGroup>
            <PrepackGroup title="Labels" hint={`${remaining === 1 ? '1 label' : `${remaining} labels`} — exactly as they print`}>
              <PrepackLabelDeck state={state} />
            </PrepackGroup>
            {state.kit ? (
              <>
                <PrepackGroup title="Contents">
                  <PrepackContentsSummary kit={state.kit} missing={state.missing} />
                </PrepackGroup>
                <PrepackGroup title="Manual" hint="Packers print it when they scan the QC label.">
                  <PrepackManualManager kit={state.kit} onKit={form.applyKit} />
                </PrepackGroup>
              </>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Phone: the context column as a sticky top card — hint, then the product, then the next label face. */
export function PhoneContextCard({ form }: { form: PrepackForm }) {
  const { state } = form;
  const catalog = state.catalog;
  const lead = state.packages[state.printedCount];
  const face = catalog && lead
    ? productLabelFace(qcLabelFaceInput(state.saved?.[state.printedCount] ?? previewPrintUnit(lead, catalog)))?.face ?? null
    : null;
  const remaining = state.packages.length - state.printedCount;
  return (
    <div className="sticky top-0 z-10 border-b border-mode-rule bg-surface-card px-mode-page py-3" data-testid="prepack-context-card">
      {catalog ? (
        <div className="space-y-2">
          <ProductIdentity
            product={catalog}
            trailing={
              <Button variant="ghost" size="md" icon={<Pencil />} ariaLabel="Change product" onClick={() => form.setBrowsing(true)} data-testid="prepack-product-edit" />
            }
          />
          {face ? (
            <div className="flex items-center gap-3">
              <div className="w-32 shrink-0"><LabelFacePreview model={face} embedded fit="host" /></div>
              <span className="text-role-caption text-text-muted">
                <AnimatedStat value={remaining} /> {remaining === 1 ? 'label' : 'labels'}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <PrepackHint text={prepackHint(state.verdict, false)} />
          {serialSettled(state.verdict) ? (
            <Button variant="secondary" size="lg" className="w-full" iconRight={<ChevronDown />} onClick={() => form.setBrowsing(true)}>
              Pick the product
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
