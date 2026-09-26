/** Workspace print-label kinds — the SoT for which faces a station can preview / print. */

import type { LabelFaceModel } from '@/lib/print/labelFace';
import {
  asListedPayloadToFace,
  printAsListedLabel,
  type AsListedLabelPayload,
} from '@/lib/print/printAsListedLabel';
import {
  ticketPayloadToFace,
  printTicketLabel,
  type TicketLabelPayload,
} from '@/lib/print/printTicketLabel';
import {
  receivingPayloadToFace,
  type ReceivingLabelPayload,
} from '@/lib/print/printReceivingLabel';
import {
  buildUnitPayload,
  unitLabelToFace,
  printProductLabel,
  type PrintProductLabelInput,
} from '@/lib/print/printProductLabel';
import { printHandlingUnitLabel, type HandlingUnitLabelPayload } from '@/lib/print/printHandlingUnitLabel';

export type WorkspaceLabelKind =
  | 'carton'
  | 'unit'
  | 'as_listed'
  | 'ticket_minimal'
  | 'handling_unit';

export type WorkspaceLabelEditor = 'carton' | 'unit' | 'as_listed' | null;

/** What physical thing the sticker goes on. */
type WorkspaceLabelGrain = 'carton' | 'item' | 'container';

/** Operator-facing grain names — the SoT for how grain reads in any picker. */
const GRAIN_LABEL: Record<WorkspaceLabelGrain, string> = {
  carton: 'PO / carton',
  item: 'Per item',
  container: 'Container',
};

/** The operator-facing grain string for a label kind ("PO / carton", "Per item"). */
export function workspaceLabelGrainLabel(kind: WorkspaceLabelKind): string {
  return GRAIN_LABEL[KIND_META[kind].grain];
}

export interface WorkspaceLabelContext {
  /** Carton / receiving id present. */
  hasCarton: boolean;
  /** Human scan value (PO# or RCV-{id}). */
  scanValue: string;
  sku: string | null | undefined;
  receivingType: string | null | undefined;
  /** Seller disclosure / defect note text (non-empty enables As Listed). */
  disclosureNote: string | null | undefined;
  /** Provider ticket digits available. */
  ticketDigits: string | null | undefined;
  cartonPayload?: ReceivingLabelPayload | null;
  unitInput?: PrintProductLabelInput | null;
  asListedPayload?: AsListedLabelPayload | null;
  ticketPayload?: TicketLabelPayload | null;
  handlingUnitPayload?: HandlingUnitLabelPayload | null;
}

export interface WorkspaceLabelOption {
  kind: WorkspaceLabelKind;
  name: string;
  editor: WorkspaceLabelEditor;
  grain: WorkspaceLabelGrain;
}

const KIND_META: Record<
  WorkspaceLabelKind,
  { name: string; editor: WorkspaceLabelEditor; grain: WorkspaceLabelGrain }
> = {
  carton: { name: 'Carton label', editor: 'carton', grain: 'carton' },
  unit: { name: 'Unit label', editor: 'unit', grain: 'item' },
  // The seller-disclosure face describes ONE unit's condition, so it is per-item
  // even though it is printed from the carton workspace.
  as_listed: { name: 'As Listed', editor: 'as_listed', grain: 'item' },
  // The claim/ticket is filed against the carton, not an individual unit.
  ticket_minimal: { name: 'Ticket label', editor: null, grain: 'carton' },
  handling_unit: { name: 'Box / LPN', editor: null, grain: 'container' },
};

/** Returns / trade-ins (and any line with a disclosure note) get As Listed. */
export function asListedAvailable(ctx: Pick<WorkspaceLabelContext, 'receivingType' | 'disclosureNote'>): boolean {
  const type = String(ctx.receivingType ?? '').trim().toUpperCase();
  if (type === 'RETURN' || type === 'TRADE_IN') return true;
  return Boolean((ctx.disclosureNote ?? '').trim());
}

export function isWorkspaceLabelAvailable(
  kind: WorkspaceLabelKind,
  ctx: WorkspaceLabelContext,
): boolean {
  switch (kind) {
    case 'carton':
      return ctx.hasCarton || Boolean(ctx.scanValue.trim()) || Boolean(ctx.cartonPayload);
    case 'unit':
      return Boolean((ctx.sku ?? '').trim()) || Boolean(ctx.unitInput?.sku?.trim());
    case 'as_listed':
      return asListedAvailable(ctx);
    case 'ticket_minimal':
      return Boolean(String(ctx.ticketDigits ?? '').replace(/\D/g, ''));
    case 'handling_unit':
      return Boolean(ctx.handlingUnitPayload?.handlingUnitId);
    default:
      return false;
  }
}

/** Unbox overview catalog — carton first (industry default), then unit / disclosure / ticket. */
export const UNBOX_LABEL_KINDS: readonly WorkspaceLabelKind[] = [
  'carton',
  'unit',
  'as_listed',
  'ticket_minimal',
] as const;

/** Testing overview catalog — unit primary on pass; carton for reprint. */
export const TESTING_LABEL_KINDS: readonly WorkspaceLabelKind[] = ['unit', 'carton'] as const;

export function listAvailableLabelOptions(
  kinds: readonly WorkspaceLabelKind[],
  ctx: WorkspaceLabelContext,
): WorkspaceLabelOption[] {
  return kinds
    .filter((kind) => isWorkspaceLabelAvailable(kind, ctx))
    .map((kind) => ({
      kind,
      name: workspaceLabelDisplayName(kind),
      editor: KIND_META[kind].editor,
      grain: KIND_META[kind].grain,
    }));
}

/**
 * UI options for LabelTypeSelect. Carries the resolved GRAIN label so the picker
 * states what the sticker goes on — the operator should never have to infer
 * "Unit label" means per-item from the name alone.
 */
export function labelOptionsForSelect(
  options: readonly WorkspaceLabelOption[],
): Array<{ key: string; name: string; grain: string }> {
  return options.map((o) => ({ key: o.kind, name: o.name, grain: GRAIN_LABEL[o.grain] }));
}

export function resolveActiveLabelKind(
  selected: string | null | undefined,
  options: readonly WorkspaceLabelOption[],
  fallback: WorkspaceLabelKind = 'carton',
): WorkspaceLabelKind {
  if (selected && options.some((o) => o.kind === selected)) {
    return selected as WorkspaceLabelKind;
  }
  return (options[0]?.kind ?? fallback) as WorkspaceLabelKind;
}

export function workspaceLabelToFace(
  kind: WorkspaceLabelKind,
  ctx: WorkspaceLabelContext,
): LabelFaceModel | null {
  switch (kind) {
    case 'carton':
      return ctx.cartonPayload ? receivingPayloadToFace(ctx.cartonPayload) : null;
    case 'unit': {
      const input = ctx.unitInput;
      if (!input?.sku?.trim()) return null;
      // Preview ≡ print: this used to inline `qrPayload || serial || sku`, so
      // the workspace showed a bare serial while the printer encoded a Digital
      // Link. Both now resolve through the same encode SoT.
      const matrix = {
        ...buildUnitPayload({
          sku: input.sku.trim(),
          serialNumber: input.serialNumber?.trim() || null,
          qrPayload: input.qrPayload?.trim() || null,
          gtin: input.gtin?.trim() || null,
          orgSlug: input.orgSlug,
        }),
        scale: 4,
      };
      return unitLabelToFace({
        sku: input.sku,
        title: input.title,
        condition: input.condition,
        color: input.color,
        matrix,
      });
    }
    case 'as_listed':
      return ctx.asListedPayload ? asListedPayloadToFace(ctx.asListedPayload) : null;
    case 'ticket_minimal':
      return ctx.ticketPayload ? ticketPayloadToFace(ctx.ticketPayload) : null;
    case 'handling_unit':
      // Handling-unit face uses a custom HTML layout (not LabelFaceModel).
      return null;
    default:
      return null;
  }
}

/**
 * Print the selected workspace label. Returns true when a print was issued.
 * Handling-unit uses its dedicated printer; others go through face SoTs.
 */
export function printWorkspaceLabel(
  kind: WorkspaceLabelKind,
  ctx: WorkspaceLabelContext,
): boolean {
  switch (kind) {
    case 'carton':
      if (!ctx.cartonPayload) return false;
      // Caller must use receiving-label-helpers.printReceivingLabel for WebUSB;
      // this registry entry is for face/availability only when helpers aren't
      // threaded. Prefer the helper from the controller.
      return false;
    case 'unit':
      if (!ctx.unitInput?.sku?.trim()) return false;
      printProductLabel(ctx.unitInput);
      return true;
    case 'as_listed':
      if (!ctx.asListedPayload) return false;
      printAsListedLabel(ctx.asListedPayload);
      return true;
    case 'ticket_minimal':
      if (!ctx.ticketPayload) return false;
      printTicketLabel(ctx.ticketPayload);
      return true;
    case 'handling_unit':
      if (!ctx.handlingUnitPayload) return false;
      printHandlingUnitLabel(ctx.handlingUnitPayload);
      return true;
    default:
      return false;
  }
}

function workspaceLabelDisplayName(kind: WorkspaceLabelKind): string {
  return KIND_META[kind].name;
}
