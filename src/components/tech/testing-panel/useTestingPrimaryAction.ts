'use client';

import { useEffect, useRef } from 'react';
import type { TestingVerdict } from '@/components/receiving/workspace/TestingStatusPills';
import { createScanFieldLetterKey } from '@/lib/keyboard/scan-field-letter-key';
import { CONDITION_GRADES, type ConditionGrade } from '@/lib/conditions';
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

/** The Quality control scan field (`TestingSidebarPanel`'s scan bar). */
function testingScanField(target: EventTarget | null): HTMLInputElement | null {
  return target instanceof HTMLInputElement && target.closest('[data-testing-scan]') ? target : null;
}

/** Dock verbs bound to bare keys while the station is open. */
export interface TestingDockVerbs {
  /** `K` — open the Pair FNSKU dropdown; pressed again while open, pair the highlighted row. */
  onFnskuKey?: () => void;
  /** `1`–`7` — grade the active unit with the house grade at that position (`CONDITION_GRADES`). */
  onGradeKey?: (grade: ConditionGrade) => void;
}

/**
 * The Pass CTA's tooltip, and the station's keys — the verdict letters match
 * the QC record (`QC_VERDICTS`): `P` (and bare Enter outside a field) passes
 * and prints, `T` tests again, `F` fails; `K` pairs the FNSKU and `1`–`7`
 * grade the unit. Keys fire from the page or the empty, focused scan field
 * (`createScanFieldLetterKey`). Pass is never disabled: a press with no
 * serial says so instead.
 */
export function useTestingPrimaryAction(
  c: TestingController,
  row: ReceivingLineRow,
  verbs: TestingDockVerbs = {},
): TestingPrimaryAction {
  const hasSku = Boolean((row.sku || '').trim());
  const primaryTitle = !hasSku
    ? 'Add a SKU first — open Package Pairing → Purchase Order → Acknowledge by Inventory SKU (or scan a unit serial)'
    : !c.activeSerial
      ? 'Scan a serial for this slot before printing'
      : 'Pass this unit and print its label (P or Enter)';
  const dockVerbs = useRef(verbs);
  dockVerbs.current = verbs;
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
        scanField: testingScanField,
        // Test again / Fail need a unit to judge; Pass always answers.
        enabled: () => spec.verdict === 'PASS' || live.current.activeSerial != null,
        onPress: () => press(spec.verdict),
        giveBack: appendToScanField,
      }),
    );
    // Dock verbs (operator 2026-10-08), always pressable, same mechanics as the
    // verdict letters (scan-field wedge gap; editable targets keep the key):
    // `K` Pair FNSKU; `1`–`7` the house condition grades, in house order.
    keys.push(
      createScanFieldLetterKey({
        letter: 'k',
        scanField: testingScanField,
        enabled: () => true,
        onPress: () => dockVerbs.current.onFnskuKey?.(),
        giveBack: appendToScanField,
      }),
      ...CONDITION_GRADES.map((grade, i) =>
        createScanFieldLetterKey({
          letter: String(i + 1),
          scanField: testingScanField,
          enabled: () => dockVerbs.current.onGradeKey != null,
          onPress: () => dockVerbs.current.onGradeKey?.(grade),
          giveBack: appendToScanField,
        }),
      ),
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
