'use client';

/**
 * One order line's product paperwork — THE line-slot control, in three
 * placements: `pane` (the order pane: photo, SKU-identity title, qty, every
 * resolved document with its source, every verb), `row` (the expanded
 * list row: one line — state, source, Pair · Upload · N/R — that unfolds the
 * same panels in place) and `sheet` (the Live feed docs sheet: the sheet
 * lists the documents, suggestions and library search itself — `children` —
 * and links from its viewer; the slot keeps Upload, Not required and the drop).
 *
 * Pairing scope defaults to `defaultPairScope(line)` (SKU first) and the verb
 * names its reach ("Pair to SKU · 14 open orders"). Pair and Upload open the
 * paperwork's own pairing controls (`PairingControls`: scope, type, library
 * picker); an upload declares its type and target before any bytes land, and
 * a file dropped on the slot lands as that type on that target. Filled rows
 * carry their source (SKU · Item # · This order), Repin (`RepairForm`) and
 * Unpair. Not required marks the SKU as never shipping with paperwork. Every
 * write is reversible from its toast (`useLinePaperwork`).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CirclePause, Link2, Pencil, Unlink, Upload, X } from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import { PairingControls } from '@/components/outbound/orders/paperwork/PaperworkPairingControls';
import { requestConfirm } from '@/design-system/components/confirm';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { Button, IconButton } from '@/design-system/primitives';
import type { PaperworkDocumentRow } from '@/lib/label-prints/contracts';
import { isPacketGap, type OrderPacket, type OrderPacketLine } from '@/lib/label-prints/order-packet-contracts';
import { defaultPairScope, type PaperworkSource } from '@/lib/manuals/paperwork-pairing';
import { PAPERWORK_SOURCE_FACE, PAPERWORK_UPLOAD_TYPES, printedFace, SLOT_STATE_FACE } from './slot-faces';
import { SlotDocument, SlotFrame, SlotHeading, useFilePicker } from './SlotFrame';
import { LineIdentity, RepinPanel } from './pane-parts';
import { useLinePaperwork } from './use-line-paperwork';

type Panel = 'pair' | 'upload' | null;

/** "1 open order" / "14 open orders". */
const openOrders = (n: number) => `${n} open order${n === 1 ? '' : 's'}`;

/** The pair verb, naming how far it reaches: "Pair to SKU · 14 open orders". */
function pairVerb(scope: PaperworkSource, reach: number | null): string {
  if (scope === 'sku') return reach != null ? `Pair to SKU · ${openOrders(reach)}` : 'Pair to SKU';
  return scope === 'item_number' ? 'Pair to Item #' : 'Pair to this order';
}

/** "Manual pinned to SKU AB-1" — what a drop or an upload lands as, on what. */
function landsAs(type: string, scope: PaperworkSource, line: OrderPacketLine, orderRef: string): string {
  const target = scope === 'sku' ? `SKU ${line.sku}` : scope === 'item_number' ? `Item # ${line.itemNumber}` : `order ${orderRef}`;
  return `${type === 'insert' ? 'an insert' : type === 'manual' ? 'a manual' : 'paperwork'} pinned to ${target}`;
}

export function LinePaperworkSlot({
  packet,
  line,
  placement,
  children,
}: {
  packet: OrderPacket;
  line: OrderPacketLine;
  placement: 'pane' | 'row' | 'sheet';
  /** `sheet` only: the sheet's own rows for this line, painted inside the slot's frame (and drop zone). */
  children?: ReactNode;
}) {
  const writes = useLinePaperwork(line);
  const [scope, setScope] = useState<PaperworkSource>(() => defaultPairScope(line));
  // A line linked to its SKU here pairs to the SKU from then on (future orders of it resolve the same paperwork).
  const skuCatalogId = line.skuCatalogId;
  const lastCatalogId = useRef(skuCatalogId);
  useEffect(() => {
    if (lastCatalogId.current == null && skuCatalogId != null) setScope('sku');
    lastCatalogId.current = skuCatalogId;
  }, [skuCatalogId]);
  const [type, setType] = useState('manual');
  const [panel, setPanel] = useState<Panel>(null);
  const [repinId, setRepinId] = useState<number | null>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const picker = useFilePicker(PAPERWORK_UPLOAD_TYPES, (files) => {
    writes.upload.mutate({ files, scope, type }, { onSuccess: () => setPanel(null) });
  });

  const gap = isPacketGap(line.state);
  const why = notRequiredWhy(line, packet);
  const skuExempt = line.paperworkNotRequired;
  const canExempt = line.skuCatalogId != null;
  const exemptVerb = skuExempt
    ? 'Needs paperwork again'
    : `Not required for this SKU${writes.reach != null ? ` · ${openOrders(writes.reach)}` : ''}`;
  const reachDetail = writes.reach != null ? ` SKU ${line.sku ?? ''} is on ${openOrders(writes.reach)}.` : '';
  const name = `Product paperwork · ${line.sku ? `SKU ${line.sku}` : line.title}`;

  const openPanel = (next: Panel) => {
    setRepinId(null);
    setPanel((open) => (open === next ? null : next));
    if (next === 'upload') requestAnimationFrame(() => chooseRef.current?.focus());
  };
  const toggleExempt = async () => {
    if (!canExempt || writes.notRequired.isPending) return;
    const next = !skuExempt;
    if (next && writes.reach != null && writes.reach > 1) {
      const ok = await requestConfirm({
        title: `Mark SKU ${line.sku ?? ''} as needing no paperwork?`,
        description: `Every order of this SKU stops waiting for product paperwork.${reachDetail}`,
        confirmLabel: 'Not required',
      });
      if (!ok) return;
    }
    writes.notRequired.mutate(next);
  };
  const unpair = async (doc: PaperworkDocumentRow) => {
    if (doc.manualId == null) return;
    const wide = doc.association.source !== 'order';
    const ok = await requestConfirm({
      title: 'Unpair it everywhere?',
      description: `${doc.title} comes off every order, item number and SKU it is pinned to and goes back to the library.${doc.association.source === 'sku' ? reachDetail : ''}${wide ? '' : ' Only this order resolves it today.'} To drop one key only, use Repin.`,
      confirmLabel: 'Unpair',
    });
    if (ok) writes.unpair.mutate({ manualId: doc.manualId, title: doc.title, anchor: doc.association.source });
  };

  const keys = {
    pair: gap || line.documents.length > 0 ? () => openPanel('pair') : null,
    upload: () => openPanel('upload'),
    notRequired: canExempt ? () => void toggleExempt() : null,
  };
  const drop = {
    types: PAPERWORK_UPLOAD_TYPES,
    hint: landsAs(type, scope, line, packet.orderRef),
    refusal: 'product paperwork is PDF, PNG or JPEG.',
    onFiles: (files: File[]) => writes.upload.mutate({ files, scope, type }),
  };

  const verbs = (compact: boolean, withPair = true) => (
    <>
      {withPair ? (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          size="sm"
          radius="control"
          icon={<Link2 />}
          aria-expanded={panel === 'pair'}
          aria-keyshortcuts="P"
          title={pairVerb(scope, writes.reach)}
          onClick={() => openPanel('pair')}
          className="min-w-0"
          data-testid="line-paperwork-pair"
        >
          <span className="truncate">{compact ? 'Pair' : pairVerb(scope, writes.reach)}</span>
        </Button>
      ) : null}
      <Button
        variant={compact ? 'ghost' : 'secondary'}
        size="sm"
        radius="control"
        icon={<Upload />}
        aria-expanded={panel === 'upload'}
        aria-keyshortcuts="U"
        loading={writes.upload.isPending}
        onClick={() => openPanel('upload')}
        data-testid="line-paperwork-upload"
      >
        Upload
      </Button>
      <Button
        variant="ghost"
        size="sm"
        radius="control"
        icon={<CirclePause />}
        aria-pressed={skuExempt}
        aria-keyshortcuts="N"
        aria-label={exemptVerb}
        title={canExempt ? exemptVerb : 'This line has no catalog SKU to mark.'}
        disabled={!canExempt}
        loading={writes.notRequired.isPending}
        onClick={() => void toggleExempt()}
        className="min-w-0"
        data-testid="line-paperwork-not-required"
      >
        <span className="truncate">{compact ? 'N/R' : exemptVerb}</span>
      </Button>
    </>
  );

  const panels = (
    <>
      {panel ? (
        <div className="mt-2 flex min-w-0 flex-col gap-2 rounded-mode-control border border-mode-rule p-2" data-testid={`line-paperwork-${panel}-panel`}>
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-muted">
              {panel === 'pair' ? pairVerb(scope, writes.reach) : `Upload ${landsAs(type, scope, line, packet.orderRef)}`}
            </p>
            <IconButton icon={<X />} size="sm" ariaLabel="Close" onClick={() => setPanel(null)} />
          </div>
          <PairingControls
            resolved={line}
            scope={scope}
            onScope={setScope}
            type={type}
            onType={setType}
            pairedIds={line.documents.flatMap((doc) => (doc.manualId != null ? [doc.manualId] : []))}
            pending={writes.pair.isPending}
            onPair={
              panel === 'pair'
                ? (manualId) => writes.pair.mutate({ manualId, scope }, { onSuccess: () => setPanel(null) })
                : undefined
            }
          />
          {panel === 'upload' ? (
            <Button
              ref={chooseRef}
              variant="primary"
              size="sm"
              radius="control"
              icon={<Upload />}
              loading={writes.upload.isPending}
              onClick={picker.open}
              className="self-start"
              data-testid="line-paperwork-choose-file"
            >
              Choose files
            </Button>
          ) : null}
        </div>
      ) : null}
      {repinId != null ? (
        <RepinPanel
          line={line}
          manualId={repinId}
          orderRef={packet.orderRef}
          onSave={(patch) => {
            const anchor = line.documents.find((doc) => doc.manualId === repinId)?.association.source ?? 'order';
            writes.repin.mutate({ manualId: repinId, patch, anchor }, { onSuccess: () => setRepinId(null) });
          }}
          onCancel={() => setRepinId(null)}
        />
      ) : null}
    </>
  );

  const documentVerbs = (doc: PaperworkDocumentRow) =>
    doc.manualId == null ? null : (
      <>
        <IconButton
          icon={<Pencil />}
          size="sm"
          ariaLabel={`Repin ${doc.title}`}
          aria-expanded={repinId === doc.manualId}
          onClick={() => {
            setPanel(null);
            setRepinId((open) => (open === doc.manualId ? null : doc.manualId));
          }}
          data-testid="line-paperwork-repin"
        />
        <IconButton
          icon={<Unlink />}
          size="sm"
          ariaLabel={`Unpair ${doc.title}`}
          disabled={writes.unpair.isPending}
          onClick={() => void unpair(doc)}
          data-testid="line-paperwork-unpair"
        />
      </>
    );

  if (placement === 'sheet') {
    return (
      <SlotFrame
        name={name}
        state={line.state}
        drop={drop}
        keys={{ upload: keys.upload, notRequired: keys.notRequired }}
        testId="line-paperwork-sheet"
        className="px-3 py-2"
      >
        {picker.input}
        <SlotHeading title={line.sku ? `SKU ${line.sku} · ${line.title}` : line.title} state={line.state} />
        {line.state === 'not_required' ? <p className="mt-1 min-w-0 text-role-caption text-text-muted">{why}</p> : null}
        {children}
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">{verbs(!gap && !skuExempt, false)}</div>
        {gap && scope === 'sku' && line.sku ? (
          <p className="mt-1 min-w-0 text-role-caption text-text-muted" data-testid="line-paperwork-sku-note">
            Links and uploads pin to SKU {line.sku} — every order of it gets this paperwork.
          </p>
        ) : null}
        {panels}
      </SlotFrame>
    );
  }

  if (placement === 'row') {
    const first = line.documents[0];
    return (
      <SlotFrame name={name} state={line.state} drop={drop} keys={keys} testId="line-paperwork-row" className="px-2 py-1">
        {picker.input}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <LifecycleCode state={SLOT_STATE_FACE[line.state]} className="shrink-0" />
          {first ? (
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <Badge variant="secondary" className="shrink-0">
                via {PAPERWORK_SOURCE_FACE[first.association.source]}
              </Badge>
              <span className="min-w-0 truncate text-role-caption text-text-default" title={line.documents.map((doc) => doc.title).join(' · ')}>
                {first.title}
                {line.documents.length > 1 ? ` +${line.documents.length - 1}` : ''}
              </span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-role-caption text-text-muted" title={why ?? undefined}>
              {why ?? ''}
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1">
            {first ? documentVerbs(first) : null}
            {gap || skuExempt ? verbs(true) : null}
          </span>
        </div>
        {panels}
      </SlotFrame>
    );
  }

  return (
    <SlotFrame name={name} state={line.state} drop={drop} keys={keys} testId="line-paperwork-slot" className="px-3 py-2">
      {picker.input}
      <LineIdentity line={line} />
      {line.documents.length > 0 ? (
        <ul className="mt-1 flex min-w-0 flex-col">
          {line.documents.map((doc) => (
            <SlotDocument
              key={doc.key}
              testId="line-paperwork-document"
              title={doc.title}
              href={doc.src}
              source={PAPERWORK_SOURCE_FACE[doc.association.source]}
              facts={[doc.src ? printedFace(doc.printCount) : 'Drive only — not printable']}
              actions={documentVerbs(doc)}
            />
          ))}
        </ul>
      ) : null}
      {line.state === 'not_required' ? (
        <p className="mt-1 min-w-0 text-role-caption text-text-muted">{why}</p>
      ) : null}
      {gap || skuExempt ? <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">{verbs(false)}</div> : null}
      {(gap || skuExempt) && scope === 'sku' && line.sku ? (
        <p className="mt-1 min-w-0 text-role-caption text-text-muted" data-testid="line-paperwork-sku-note">
          Pairs to SKU {line.sku} for future use — every order of it gets this paperwork.
        </p>
      ) : null}
      {!gap && !skuExempt ? (
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <Button variant="ghost" size="sm" radius="control" icon={<Link2 />} aria-keyshortcuts="P" onClick={() => openPanel('pair')} data-testid="line-paperwork-pair-more">
            Pair more
          </Button>
          <Button variant="ghost" size="sm" radius="control" icon={<Upload />} aria-keyshortcuts="U" onClick={() => openPanel('upload')} data-testid="line-paperwork-upload-more">
            Upload more
          </Button>
        </div>
      ) : null}
      {panels}
    </SlotFrame>
  );
}

/** Why a line needs no paperwork: its SKU, or the whole order. */
function notRequiredWhy(line: OrderPacketLine, packet: OrderPacket): string | null {
  if (line.state !== 'not_required') return null;
  if (line.paperworkNotRequired) return `SKU ${line.sku ?? ''} ships with no product paperwork.`;
  return packet.docsNotRequired ? 'This order needs no paperwork.' : null;
}
