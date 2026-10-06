'use client';

import { useEffect, useRef } from 'react';
import { unitStatusToVerdict } from '@/components/receiving/workspace/TestingStatusPills';
import { createScanFieldLetterKey } from '@/lib/keyboard/scan-field-letter-key';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { TestingController } from './testing-panel-types';

interface TestingPrimaryAction {
  primaryDisabled: boolean;
  primaryLabel: string;
  primaryTitle: string;
}

/** Hand a held letter back to the React-controlled scan field. */
function appendToScanField(field: HTMLInputElement, text: string): void {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setValue?.call(field, field.value + text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * View-model for the "Pass · Print Label" floating action: derives its
 * enabled/label/tooltip from the active serial's verdict + line state, and wires
 * its keys — bare Enter (ignored while typing in a field) and `P`, which also
 * fires from the empty, focused scan field.
 */
export function useTestingPrimaryAction(c: TestingController, row: ReceivingLineRow): TestingPrimaryAction {
  const { activeSerial, isPrinting, saving, handlePrimary } = c;
  const activeVerdict = unitStatusToVerdict(activeSerial?.current_status);
  const hasSku = Boolean((row.sku || '').trim());
  const hasActiveSerial = activeSerial != null;

  const primaryDisabled =
    !hasActiveSerial ||
    activeVerdict === 'TESTING_FAILED' ||
    isPrinting ||
    saving ||
    !hasSku ||
    row.receiving_id == null;

  const primaryTitle = row.receiving_id == null
    ? 'Line is not linked to a carton'
    : !hasSku
      ? 'Add a SKU first — open Package Pairing → Purchase Order → Acknowledge by Inventory SKU (or scan a unit serial)'
      : !hasActiveSerial
        ? 'Scan a serial for this slot before printing'
        : activeVerdict === 'TESTING_FAILED'
          ? 'This unit failed testing — Fail never prints a label'
          : 'Pass this unit and print its label (P or Enter)';

  const primaryLabel = isPrinting
    ? 'Printing…'
    : !hasSku
      ? 'Pass · No SKU'
      : !hasActiveSerial
        ? 'Pass · No Serial'
        : 'Pass · Print Label';

  // Bare Enter (not while typing) fires the primary action.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (primaryDisabled || isPrinting) return;
      event.preventDefault();
      void handlePrimary();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [primaryDisabled, isPrinting, handlePrimary]);

  // `P` passes and prints in one press — from the page or the empty scan field.
  const pRef = useRef({ primaryDisabled, handlePrimary });
  pRef.current = { primaryDisabled, handlePrimary };
  useEffect(() => {
    const key = createScanFieldLetterKey({
      letter: 'p',
      // The Quality control scan field (`TestingSidebarPanel`'s scan bar).
      scanField: (target) =>
        target instanceof HTMLInputElement && target.closest('[data-testing-scan]') ? target : null,
      enabled: () => !pRef.current.primaryDisabled,
      onPress: () => void pRef.current.handlePrimary(),
      giveBack: appendToScanField,
    });
    window.addEventListener('keydown', key.onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', key.onKeyDown, true);
      key.dispose();
    };
  }, []);

  return { primaryDisabled, primaryLabel, primaryTitle };
}
