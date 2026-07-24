'use client';

import {
  Check,
  Clipboard,
  ClipboardList,
  Copy,
  Download,
  MessageSquare,
  Package,
  PackageCheck,
  Printer,
  Barcode,
  Ticket,
} from '@/components/Icons';
import type { TerminalActionVm } from '@/lib/station-terminal';
import { toast } from '@/lib/toast';
import type { UnboxTerminalContext, UnboxTerminalKind, UnboxView } from './types';

/**
 * Declarative tab → kind map for Unbox (mirrors STATION_TERMINAL_REGISTRY.unbox).
 */
export const UNBOX_TAB_TERMINAL: Record<UnboxView, UnboxTerminalKind> = {
  overview: 'mode-default',
  classify: 'none',
  'po-note': 'po-note',
  checklist: 'checklist',
  units: 'units',
  tracking: 'none',
  listings: 'none',
  timeline: 'timeline',
  ticket: 'ticket',
  support: 'support',
};

const UNBOX_DOCK_MAX = 'max-w-[720px]';

const dockBase = {
  docked: true as const,
  fullWidth: true,
  maxWidth: UNBOX_DOCK_MAX,
};

/**
 * Overview receive — mounted `embedded` INSIDE the notes composer footer
 * (`LineEditPanel` dock). The band fields below only apply if this VM is ever
 * rendered as a standalone dock; embedded ignores them.
 */
const overviewDockBase = {
  docked: true as const,
  fullWidth: false,
  align: 'end' as const,
  maxWidth: UNBOX_DOCK_MAX,
};

/** Print · Receive dock — overview / mode-default. */
export function resolveUnboxReceiveTerminal(ctx: UnboxTerminalContext): TerminalActionVm {
  const r = ctx.receive;
  const labelOpts = r.labelSelectOptions ?? [];
  const activeKind = r.activeLabelKind ?? r.selectedLabelKind ?? 'carton';
  const activeName =
    labelOpts.find((o) => o.key === activeKind)?.name ?? 'label';

  const labelMenuItems = labelOpts.map((opt) => ({
    label: opt.name,
    icon: <Printer className="h-3.5 w-3.5 shrink-0" />,
    selected: opt.key === activeKind,
    keepOpen: true,
    onClick: () => {
      // Selection only — print stays on primary / Print only.
      r.setSelectedLabelKind?.(opt.key);
    },
    disabled: !r.canPrintReview,
    title: `Use ${opt.name} for the next print`,
  }));

  return {
    ...overviewDockBase,
    label: r.printReceivePrimaryLabel,
    title: r.printThenReceiveTitle,
    disabled: r.combinedReviewDisabled,
    disabledReason: r.combinedReviewDisabledReason,
    onClick: () => void r.handlePrintAndReceive(),
    icon: <Printer className="h-4 w-4 shrink-0" />,
    tone: 'accent',
    menuLabel: r.splitMenuAriaLabel,
    menuTitle: r.splitMenuHoverTitle,
    menu: [
      ...labelMenuItems,
      {
        label: `Print only · ${activeName}`,
        icon: <Printer className="h-3.5 w-3.5 shrink-0" />,
        separatorBefore: labelMenuItems.length > 0,
        onClick: () => r.runPrintLabel(),
        disabled: !r.canPrintReview,
        title: `Print the selected ${activeName} without receiving`,
      },
      ...(r.isUnfound
        ? []
        : [
            {
              label: 'Save all to inventory',
              icon: <Clipboard className="h-3.5 w-3.5 shrink-0" />,
              onClick: () => void r.handleReceive('zoho_receive'),
              disabled: !r.canZohoReceive,
              title:
                'Save all received quantities + edits to the inventory purchase receive (no print)',
            },
          ]),
      {
        label: r.receiveMenuLabel,
        icon: <PackageCheck className="h-3.5 w-3.5 shrink-0" />,
        onClick: () =>
          void r.handleReceive(r.isUnfound ? 'local_receive' : 'zoho_receive'),
        disabled: r.isUnfound ? !r.canReceiveReview : !r.canZohoReceive,
        title: r.isUnfound
          ? 'Receive all open lines locally — external inventory is not touched'
          : r.receiveMenuTitle,
      },
    ],
  };
}

/** Inventory notes dock — Save primary; Sync in the split menu. */
export function resolveUnboxPoNoteTerminal(ctx: UnboxTerminalContext): TerminalActionVm {
  const { poNote } = ctx;
  return {
    ...dockBase,
    label: poNote.saving ? 'Saving…' : 'Save to inventory',
    title: poNote.dirty
      ? 'Save the note to the synced PO'
      : 'Edit the note before saving',
    disabled: !poNote.dirty || poNote.saving || poNote.loading,
    loading: poNote.saving,
    onClick: () => void poNote.save(),
    icon: <Check className="h-4 w-4 shrink-0" />,
    tone: 'accent',
    menuLabel: 'Inventory note actions',
    menuTitle: poNote.dirty ? 'Save or discard edits first' : 'Reload the latest synced note',
    menu: [
      {
        label: 'Sync from inventory',
        icon: <Download className="h-3.5 w-3.5 shrink-0" />,
        onClick: () => void poNote.syncFromInventory(),
        disabled: poNote.dirty || poNote.loading,
        title: poNote.dirty
          ? 'Save or discard edits first'
          : 'Reload the latest synced note',
      },
    ],
  };
}

/** Checklist — Check all / Uncheck all (primary toggles). */
export function resolveUnboxChecklistTerminal(ctx: UnboxTerminalContext): TerminalActionVm {
  const bridge = ctx.bridges.checklist;
  const allDone = bridge?.allDone ?? false;
  const empty = !bridge || bridge.itemCount === 0;
  return {
    ...dockBase,
    label: allDone ? 'Uncheck all' : 'Check all',
    title: empty
      ? 'Add checklist steps first'
      : allDone
        ? 'Clear every checked step on this line'
        : 'Mark every step complete on this line',
    disabled: empty,
    disabledReason: empty ? 'No checklist steps yet' : null,
    onClick: () => {
      if (!bridge) return;
      if (bridge.allDone) bridge.uncheckAll();
      else bridge.checkAll();
    },
    icon: allDone ? (
      <Check className="h-4 w-4 shrink-0" />
    ) : (
      <ClipboardList className="h-4 w-4 shrink-0" />
    ),
    tone: 'emerald',
  };
}

/**
 * Units on carton — edit-serials surface not built yet.
 * Best-in-class placeholder: primary “Add serial” (real scan handoff today);
 * Prebox in the split menu. “Save serials” lands when the editor ships.
 */
export function resolveUnboxUnitsTerminal(ctx: UnboxTerminalContext): TerminalActionVm {
  const bridge = ctx.bridges.units;
  return {
    ...dockBase,
    label: 'Add serial',
    title: 'Scan or type the next unit serial on this carton',
    onClick: () => {
      ctx.setUnboxView('overview');
      // Overview panel stays mounted (hidden) — defer focus until after the tab unhides.
      globalThis.setTimeout(() => ctx.focusSerialScan(), 0);
    },
    icon: <Barcode className="h-4 w-4 shrink-0" />,
    tone: 'accent',
    menuLabel: 'Unit actions',
    menuTitle: 'More unit actions',
    menu: [
      {
        label: 'Prebox',
        icon: <Package className="h-3.5 w-3.5 shrink-0" />,
        onClick: () => bridge?.openPrebox(),
        disabled: !bridge || bridge.serialCount === 0,
        title:
          bridge && bridge.serialCount > 0
            ? 'Open the prebox wizard for units on this carton'
            : 'Scan a serial before preboxing',
      },
      {
        label: 'Edit serials',
        icon: <Clipboard className="h-3.5 w-3.5 shrink-0" />,
        onClick: () => {},
        disabled: true,
        title: 'Inline serial editor — coming soon',
      },
    ],
  };
}

/** Timeline — copy the carton tracking number when present. */
export function resolveUnboxTimelineTerminal(ctx: UnboxTerminalContext): TerminalActionVm {
  const tracking = String(ctx.row.tracking_number ?? '').trim();
  return {
    ...dockBase,
    label: tracking ? 'Copy tracking' : 'Timeline',
    title: tracking ? `Copy ${tracking}` : 'No tracking number on this carton',
    disabled: !tracking,
    disabledReason: tracking ? null : 'No tracking number',
    onClick: () => {
      if (!tracking) return;
      void navigator.clipboard.writeText(tracking).then(
        () => toast.success('Tracking copied'),
        () => toast.error('Could not copy tracking'),
      );
    },
    icon: <Copy className="h-4 w-4 shrink-0" />,
    tone: 'accent',
  };
}

/** Ticket — focus the ticket reply surface. */
export function resolveUnboxTicketTerminal(ctx: UnboxTerminalContext): TerminalActionVm {
  const hasTicket = ctx.row != null && ctx.focusTicketReply != null;
  return {
    ...dockBase,
    label: 'Reply',
    title: 'Focus the ticket reply composer',
    disabled: !hasTicket,
    disabledReason: hasTicket ? null : 'No linked ticket',
    onClick: () => ctx.focusTicketReply?.(),
    icon: <Ticket className="h-4 w-4 shrink-0" />,
    tone: 'accent',
  };
}

/**
 * Conversation — Add note (internal) / Send (public) on the dock.
 * Composer body stays in the tab; the inline submit button is hidden.
 */
export function resolveUnboxConversationTerminal(ctx: UnboxTerminalContext): TerminalActionVm {
  const bridge = ctx.bridges.support ?? ctx.bridges.conversation;
  const canPost = bridge?.canPost ?? false;
  const hasDraft = bridge?.hasDraft ?? false;
  const isPublic = bridge?.isPublic ?? false;
  const label = !hasDraft
    ? 'Add note'
    : isPublic
      ? bridge?.submitting
        ? 'Sending…'
        : 'Send'
      : bridge?.submitting
        ? 'Saving…'
        : 'Add note';

  return {
    ...dockBase,
    label,
    title: !canPost
      ? 'You need thread manage permission to post'
      : !hasDraft
        ? 'Focus the composer to write a note'
        : isPublic
          ? 'Send this as a public message'
          : 'Post this internal note',
    disabled: !canPost || bridge?.submitting,
    loading: bridge?.submitting ?? false,
    disabledReason: !canPost ? 'Missing permission to post' : null,
    onClick: () => {
      if (!bridge) return;
      if (!bridge.hasDraft) {
        bridge.focus();
        return;
      }
      bridge.submit();
    },
    icon: <MessageSquare className="h-4 w-4 shrink-0" />,
    tone: 'accent',
  };
}

export function resolveUnboxTerminal(
  kind: string,
  ctx: UnboxTerminalContext,
): TerminalActionVm | null {
  switch (kind as UnboxTerminalKind) {
    case 'mode-default':
      return resolveUnboxReceiveTerminal(ctx);
    case 'po-note':
      return resolveUnboxPoNoteTerminal(ctx);
    case 'checklist':
      return resolveUnboxChecklistTerminal(ctx);
    case 'units':
      return resolveUnboxUnitsTerminal(ctx);
    case 'timeline':
      return resolveUnboxTimelineTerminal(ctx);
    case 'ticket':
      return resolveUnboxTicketTerminal(ctx);
    case 'support':
      return resolveUnboxConversationTerminal(ctx);
    default:
      return null;
  }
}
