'use client';

/** Unbox Middle region while a carton line workspace is open. */

import { useCallback, useMemo, type ReactNode } from 'react';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { NAV_KEY_HINT_CLASS, useNavRegion } from '@/lib/keyboard/nav-keys';
import {
  UNBOX_MIDDLE_CARTON_NAV_KEY,
  type UnboxMiddleCartonNavId,
} from '@/lib/receiving/unbox-middle-carton-nav-keys';
import type { TerminalActionVm } from '@/lib/station-terminal';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { useUnboxProcedureSteps } from './useUnboxProcedureSteps';
import { scheduleFocusUnboxCaptureSerial } from './focus-unbox-capture-serial';

type UnboxMiddleCartonNavActions = {
  /** Print barcode / label (dogfood strip — always registered when canPrint). */
  runPrintLabel?: () => void;
  /** Receive / inventory confirm (dogfood strip — always registered when canReceive). */
  handleReceive?: () => void;
  /** Whether Print is currently available. */
  canPrint?: boolean;
  /** Whether Receive is currently available. */
  canReceive?: boolean;
  /** Terminal primary VM — used by `cta` when no active step. */
  terminalVm?: TerminalActionVm | null;
};

export function useUnboxMiddleCartonNav(
  row: ReceivingLineRow,
  actions: UnboxMiddleCartonNavActions = {},
): {
  armed: boolean;
  keymap: Map<string, string>;
  navKeyCap: (targetId: UnboxMiddleCartonNavId) => ReactNode | undefined;
} {
  const { focusStep, activeKey } = useUnboxProcedureSteps(row);
  const {
    runPrintLabel,
    handleReceive,
    canPrint = false,
    canReceive = false,
    terminalVm = null,
  } = actions;

  const targets = useMemo(() => {
    const list: { id: UnboxMiddleCartonNavId; preferredKey: string }[] = [
      { id: 'scan', preferredKey: UNBOX_MIDDLE_CARTON_NAV_KEY.scan },
      { id: 'serial', preferredKey: UNBOX_MIDDLE_CARTON_NAV_KEY.serial },
      { id: 'condition', preferredKey: UNBOX_MIDDLE_CARTON_NAV_KEY.condition },
      { id: 'photos', preferredKey: UNBOX_MIDDLE_CARTON_NAV_KEY.photos },
      { id: 'cta', preferredKey: UNBOX_MIDDLE_CARTON_NAV_KEY.cta },
    ];
    // Dogfood always-on strip — Print/Receive reachable mid-procedure too.
    if (canPrint) {
      list.push({ id: 'print', preferredKey: UNBOX_MIDDLE_CARTON_NAV_KEY.print });
    }
    if (canReceive) {
      list.push({
        id: 'receive',
        preferredKey: UNBOX_MIDDLE_CARTON_NAV_KEY.receive,
      });
    }
    return list;
  }, [canPrint, canReceive]);

  const onCommit = useCallback(
    (targetId: string) => {
      const id = targetId as UnboxMiddleCartonNavId;
      switch (id) {
        case 'scan':
          setTimeout(() => emitReceiving('receiving-focus-scan'), 0);
          return;
        case 'serial':
          focusStep('serial');
          // Centre capture row owns serial entry — not the dock wedge.
          scheduleFocusUnboxCaptureSerial(60);
          return;
        case 'condition':
          focusStep('condition');
          setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
          return;
        case 'photos':
          // Door Label photo is the first photo capture on the Found walk.
          focusStep('arrival_label_photo');
          setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
          return;
        case 'cta':
          if (activeKey != null) {
            // Same as clicking the dock leading zone — put focus on the step surface.
            setTimeout(() => emitReceiving('receiving-focus-scan'), 0);
            return;
          }
          if (terminalVm && !terminalVm.disabled) {
            void terminalVm.onClick();
          }
          return;
        case 'print':
          runPrintLabel?.();
          return;
        case 'receive':
          handleReceive?.();
          return;
        default:
          return;
      }
    },
    [activeKey, focusStep, handleReceive, runPrintLabel, terminalVm],
  );

  const { armed, keymap } = useNavRegion({
    id: 'middle',
    targets,
    onCommit,
  });

  const navKeyCap = useCallback(
    (targetId: UnboxMiddleCartonNavId) => {
      if (!armed) return undefined;
      const key = keymap.get(targetId);
      return key ? (
        <span className={NAV_KEY_HINT_CLASS} data-nav-key-cap={targetId}>
          {key}
        </span>
      ) : undefined;
    },
    [armed, keymap],
  );

  return { armed, keymap, navKeyCap };
}
