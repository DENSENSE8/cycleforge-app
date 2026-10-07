'use client';

import { useEffect, useRef } from 'react';
import type { TestingVerdict } from '@/components/receiving/workspace/TestingStatusPills';
import { createScanFieldLetterKey } from '@/lib/keyboard/scan-field-letter-key';
import { QC_VERDICTS } from '@/lib/qc/qc-verdict';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { TestingController } from './testing-panel-types';
import { isGoArmed } from '@/components/sidebar/contextual/go-keys-store';

interface TestingPrimaryAction {
  primaryTitle: string;
}

/** Hand a held letter back to the React-controlled scan field. */
function appendToScanField(field: HTMLInputElement, text: string): void {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setValue?.call(field, field.value + text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * The Pass CTA's tooltip, and the station's verdict keys — the same letters as
 * the QC record (`QC_VERDICTS`): `P` (and bare Enter outside a field) passes
 * and prints, `T` tests again, `F` fails. Letters fire from the page or the
 * empty, focused scan field (`createScanFieldLetterKey`). Pass is never
 * disabled: a press with no serial says so instead.
 */
export function useTestingPrimaryAction(c: TestingController, row: ReceivingLineRow): TestingPrimaryAction {
  const hasSku = Boolean((row.sku || '').trim());
  const primaryTitle = !hasSku
    ? 'Add a SKU first — open Package Pairing → Purchase Order → Acknowledge by Inventory SKU (or scan a unit serial)'
    : !c.activeSerial
      ? 'Scan a serial for this slot before printing'
      : 'Pass this unit and print its label (P or Enter)';

  const live = useRef(c);
  live.current = c;
  const rowId = row.id;

  // Bare Enter (not while typing) passes and prints.
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
      event.preventDefault();
      void live.current.handlePrimary();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // P / T / F — one letter key per verdict.
  useEffect(() => {
    const press = (verdict: TestingVerdict) => {
      const ctl = live.current;
      if (verdict === 'PASS') {
        void ctl.handlePrimary();
        return;
      }
      if (ctl.activeSerial) ctl.requestSlotVerdict(rowId, ctl.activeSerial, verdict);
    };
    const keys = QC_VERDICTS.map((spec) =>
      createScanFieldLetterKey({
        letter: spec.hotkey,
        // The Quality control scan field (`TestingSidebarPanel`'s scan bar).
        scanField: (target) =>
          target instanceof HTMLInputElement && target.closest('[data-testing-scan]') ? target : null,
        // Test again / Fail need a unit to judge; Pass always answers.
        enabled: () => spec.verdict === 'PASS' || live.current.activeSerial != null,
        onPress: () => press(spec.verdict),
        giveBack: appendToScanField,
      }),
    );
    const onKeyDown = (event: KeyboardEvent) => {
      // `G` then F/T/P is a go sequence, never a verdict.
      if (isGoArmed()) return;
      for (const key of keys) key.onKeyDown(event);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      for (const key of keys) key.dispose();
    };
  }, [rowId]);

  return { primaryTitle };
}
