'use client';

import {
  Clipboard,
  PackageCheck,
  Pencil,
  Printer,
  RotateCcw,
} from '@/components/Icons';
import type { TerminalActionVm } from '@/lib/station-terminal';
import type { UnboxTerminalContext, UnboxTerminalKind } from './types';

/**
 * The Unbox terminal is **carton-terminal and tab-independent**.
 *
 * It used to be tab-aware: `UNBOX_TAB_TERMINAL` mapped every workbench tab id to
 * a terminal kind, so selecting a display re-labelled the bottom primary
 * (Save to inventory / Check all / Add serial / Copy tracking / Add note). Once
 * the displays moved to the right-edge Displays push column (Lane E) that map
 * became cross-region action-at-a-distance: a click on the RIGHT silently
 * changed the button at the BOTTOM. So the map is gone, `STATION_TERMINAL_REGISTRY.unbox`
 * is `hasSectionTabs: false` + `defaultKind: 'mode-default'`, and each display
 * owns its action locally.
 *
 * What survives: **Print · Receive** — the carton's own commit.
 */

const UNBOX_DOCK_MAX = 'max-w-[720px]';

/**
 * Overview receive — mounted `embedded` INSIDE the notes composer footer
 * (`LineEditPanel` dock). The band fields below only apply if this VM is ever
 * rendered as a standalone dock; embedded ignores them.
 */
const overviewDockBase = {
  docked: true as const,
  // Dogfood strip — compact trailing Print · Receive (notes toggle leads).
  fullWidth: false,
  align: 'end' as const,
  maxWidth: UNBOX_DOCK_MAX,
};

/** Print · Receive dock — the one Unbox terminal. */
export function resolveUnboxReceiveTerminal(ctx: UnboxTerminalContext): TerminalActionVm {
  const r = ctx.receive;
  const labelOpts = r.labelSelectOptions ?? [];
  const activeKind = r.activeLabelKind ?? r.selectedLabelKind ?? 'carton';
  const activeName =
    labelOpts.find((o) => o.key === activeKind)?.name ?? 'label';
  // A received line's remaining bench job is the package label, so the primary
  // prints instead of print-then-receive. Re-receive is not removed — it moves
  // to the split menu (labelled "Receive again" by the controller) because a
  // bounce-back re-receive is a real, supported flow.
  const isReceived = r.isReceived === true;

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

  // After receive, Unreceive is the undo operators look for — promote it above
  // re-receive / save so it is not buried under inventory commit verbs.
  const unreceiveMenuItem =
    r.canUnreceive
      ? {
          label: r.unreceiveMenuLabel ?? 'Unreceive',
          icon: <RotateCcw className="h-3.5 w-3.5 shrink-0" />,
          separatorBefore: true,
          onClick: () => void r.handleReceive('unreceive'),
          disabled: r.unreceiveMenuDisabled ?? !r.canReceiveReview,
          title:
            r.unreceiveMenuTitle ??
            'Undo website receive — quantities and received stamp clear',
        }
      : null;

  return {
    ...overviewDockBase,
    label: r.printReceivePrimaryLabel,
    title: r.printThenReceiveTitle,
    disabled: r.combinedReviewDisabled,
    disabledReason: r.combinedReviewDisabledReason,
    onClick: isReceived ? () => r.runPrintLabel() : () => void r.handlePrintAndReceive(),
    icon: <Printer className="h-4 w-4 shrink-0" />,
    tone: 'accent',
    menuLabel: r.splitMenuAriaLabel,
    menuTitle: r.splitMenuHoverTitle,
    menu: [
      ...labelMenuItems,
      ...(r.requestLabelEditor
        ? [
            {
              label: 'Edit label',
              icon: <Pencil className="h-3.5 w-3.5 shrink-0" />,
              separatorBefore: labelMenuItems.length > 0,
              onClick: () => r.requestLabelEditor?.(),
              title: `Edit the selected ${activeName} before print`,
            },
          ]
        : []),
      {
        label: `Print only · ${activeName}`,
        icon: <Printer className="h-3.5 w-3.5 shrink-0" />,
        separatorBefore: labelMenuItems.length > 0 && !r.requestLabelEditor,
        onClick: () => r.runPrintLabel(),
        disabled: !r.canPrintReview,
        title: `Print the selected ${activeName} without receiving`,
      },
      // Received: Unreceive first (discoverability). Open: keep receive commit verbs first.
      ...(isReceived && unreceiveMenuItem ? [unreceiveMenuItem] : []),
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
      ...(!isReceived && unreceiveMenuItem ? [unreceiveMenuItem] : []),
    ],
  };
}

export function resolveUnboxTerminal(
  kind: string,
  ctx: UnboxTerminalContext,
): TerminalActionVm | null {
  switch (kind as UnboxTerminalKind) {
    case 'mode-default':
      return resolveUnboxReceiveTerminal(ctx);
    default:
      return null;
  }
}
