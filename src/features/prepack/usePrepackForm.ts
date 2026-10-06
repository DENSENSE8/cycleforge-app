'use client';

import { useCallback, useRef, useState } from 'react';
import type { QcLabelPrintUnit } from '@/lib/labels/qc-label-row';
import {
  parsePrepackCondition,
  type PrepackCatalogChoice,
  type PrepackCondition,
  type PrepackKit,
  type PrepackLabelFace,
  type PrepackProvenance,
  type PrepackUnit,
} from '@/lib/prepack/types';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  fetchPrepackKit,
  fetchPrepackUnit,
  prepackCatalogMismatch,
  prepackErrorText,
  prepackUnitRefusal,
  savePrepackPackages,
} from './prepack-client';

/** One package = one label: its own serials (0, 1 or a pair), condition, refurb source and hand-edited face. */
export interface PackageDraft {
  key: string;
  serials: string[];
  condition: PrepackCondition | null;
  provenance: PrepackProvenance;
  /** The operator set this row's condition himself — copy-down never overwrites it. */
  touched: boolean;
  /** Title override, color and custom text (the QC page's label editor); nulls print the product default. */
  label: PrepackLabelFace;
}

export const DEFAULT_LABEL_FACE: PrepackLabelFace = { title: null, color: null, text: null };

/** What the scanned serial turned out to be. `seq` changes on every verdict so the field can pulse or shake again. */
export type SerialVerdict =
  | { kind: 'idle' }
  | { kind: 'checking'; serial: string }
  | { kind: 'matched'; serial: string; unit: PrepackUnit }
  | { kind: 'unpaired'; serial: string; unit: PrepackUnit }
  | { kind: 'new'; serial: string }
  | { kind: 'refused'; serial: string; message: string }
  | { kind: 'none' };

export const PREPACK_MAX_PACKAGES = 50;

let packageSeq = 0;

function draftPackage(serials: string[] = [], condition: PrepackCondition | null = null, provenance: PrepackProvenance = 'NONE'): PackageDraft {
  packageSeq += 1;
  return { key: `pkg-${packageSeq}`, serials, condition, provenance, touched: false, label: DEFAULT_LABEL_FACE };
}

/** The serial step is settled: the form below it may open. */
export function serialSettled(verdict: SerialVerdict): boolean {
  return verdict.kind === 'matched' || verdict.kind === 'unpaired' || verdict.kind === 'new' || verdict.kind === 'none';
}

/** The serial a verdict carries into package row 1, if any. */
function verdictSerial(verdict: SerialVerdict): string | null {
  return verdict.kind === 'matched' || verdict.kind === 'unpaired' || verdict.kind === 'new' ? verdict.serial : null;
}

export interface PrepackFormState {
  verdict: SerialVerdict;
  verdictSeq: number;
  catalog: PrepackCatalogChoice | null;
  kit: PrepackKit | null;
  packages: PackageDraft[];
  /** kit part id → included; a part with no entry is Included. */
  missing: ReadonlySet<number>;
  /** The right column (desk) / product sheet (phone) shows the browser. */
  browsing: boolean;
  error: string | null;
  notice: string | null;
  /** The saved packages' print units, once Print committed them. */
  saved: QcLabelPrintUnit[] | null;
  /** Labels confirmed printed, in package order. */
  printedCount: number;
  printing: boolean;
  /** Bumps after every completed run: the form remounts at scan cadence. */
  runKey: number;
}

const START: Omit<PrepackFormState, 'runKey'> = {
  verdict: { kind: 'idle' },
  verdictSeq: 0,
  catalog: null,
  kit: null,
  packages: [],
  missing: new Set(),
  browsing: true,
  error: null,
  notice: null,
  saved: null,
  printedCount: 0,
  printing: false,
};

export interface PrintTarget {
  /** Print one label; resolves to an error sentence, or null when the station confirmed it. */
  print: (unit: QcLabelPrintUnit) => Promise<string | null>;
}

export function usePrepackForm({ onPrinted }: { onPrinted?: () => void } = {}): PrepackForm {
  const [state, setState] = useState<PrepackFormState>(() => ({ ...START, packages: [draftPackage()], runKey: 0 }));
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Serials are judged one at a time in arrival order (a phone can send several back to back). */
  const queue = useRef<Promise<void>>(Promise.resolve());

  const patch = useCallback((next: Partial<PrepackFormState> | ((current: PrepackFormState) => Partial<PrepackFormState>)) => {
    setState((current) => ({ ...current, ...(typeof next === 'function' ? next(current) : next) }));
  }, []);

  /** Load a product's kit; the chosen face (browser row) stays what the operator clicked. */
  const loadProduct = useCallback(async (choice: PrepackCatalogChoice | number) => {
    const id = typeof choice === 'number' ? choice : choice.id;
    if (typeof choice !== 'number') patch({ catalog: choice, browsing: false, error: null });
    try {
      const kit = await fetchPrepackKit(id);
      patch((current) => (current.catalog && current.catalog.id !== id && typeof choice !== 'number'
        ? {}
        : { kit, catalog: typeof choice === 'number' ? kit.catalog : current.catalog ?? kit.catalog, browsing: false, missing: new Set() }));
      return kit;
    } catch (cause) {
      patch({ error: prepackErrorText(cause, 'Could not load that product') });
      return null;
    }
  }, [patch]);

  /** Choose a product from the browser. A serial already on the form that belongs elsewhere refuses it. */
  const chooseProduct = useCallback((choice: PrepackCatalogChoice) => {
    const verdict = stateRef.current.verdict;
    if (verdict.kind === 'matched') {
      const mismatch = prepackCatalogMismatch(verdict.unit, choice);
      if (mismatch) {
        patch({ error: mismatch });
        return;
      }
    }
    void loadProduct(choice);
  }, [loadProduct, patch]);

  const judgeSerial = useCallback(async (serial: string) => {
    patch((current) => ({ verdict: { kind: 'checking', serial }, verdictSeq: current.verdictSeq + 1, error: null, notice: null }));
    let lookup;
    try {
      lookup = await fetchPrepackUnit(serial);
    } catch (cause) {
      patch((current) => ({
        verdict: { kind: 'refused', serial, message: prepackErrorText(cause, `Could not check ${serial}`) },
        verdictSeq: current.verdictSeq + 1,
      }));
      return;
    }
    const unit = lookup.unit;
    if (!unit) {
      patch((current) => ({
        verdict: { kind: 'new', serial: lookup.newSerial || serial },
        verdictSeq: current.verdictSeq + 1,
        browsing: !current.catalog,
        packages: current.packages.map((pkg, index) => (index === 0 ? { ...pkg, serials: [lookup.newSerial || serial] } : pkg)),
      }));
      return;
    }
    const refusal = prepackUnitRefusal(unit);
    if (refusal) {
      patch((current) => ({ verdict: { kind: 'refused', serial, message: refusal }, verdictSeq: current.verdictSeq + 1 }));
      return;
    }
    const current = stateRef.current;
    if (current.catalog && unit.skuCatalogId == null) {
      const mismatch = prepackCatalogMismatch(unit, current.catalog);
      if (mismatch) {
        patch((now) => ({ verdict: { kind: 'refused', serial, message: mismatch }, verdictSeq: now.verdictSeq + 1 }));
        return;
      }
    }
    const condition = parsePrepackCondition(unit.conditionGrade);
    patch((now) => ({
      verdict: unit.skuCatalogId ? { kind: 'matched', serial: unit.serialNumber, unit } : { kind: 'unpaired', serial: unit.serialNumber, unit },
      verdictSeq: now.verdictSeq + 1,
      browsing: unit.skuCatalogId ? false : !now.catalog,
      packages: now.packages.map((pkg, index) => (index === 0
        ? { ...pkg, serials: [unit.serialNumber], condition: pkg.condition ?? condition, provenance: unit.refurbProvenance ?? pkg.provenance }
        : pkg)),
    }));
    if (unit.skuCatalogId && unit.skuCatalogId !== current.catalog?.id) await loadProduct(unit.skuCatalogId);
  }, [loadProduct, patch]);

  /** Add one serial to a package row (a pair is one package with two serials). `index` past the end adds a package. */
  const addSerialToPackage = useCallback(async (index: number, raw: string): Promise<string | null> => {
    const serial = raw.trim();
    const current = stateRef.current;
    if (!serial || current.saved) return null;
    const taken = current.packages.some((pkg) => pkg.serials.some((s) => s.toUpperCase() === serial.toUpperCase()));
    if (taken) {
      const message = `${serial} is already on this form.`;
      patch({ error: message });
      return message;
    }
    let refusal: string | null = null;
    let known = serial;
    try {
      const lookup = await fetchPrepackUnit(serial);
      if (lookup.unit) {
        known = lookup.unit.serialNumber;
        refusal = prepackUnitRefusal(lookup.unit)
          ?? (stateRef.current.catalog ? prepackCatalogMismatch(lookup.unit, stateRef.current.catalog) : null);
      } else {
        known = lookup.newSerial || serial;
      }
    } catch (cause) {
      refusal = prepackErrorText(cause, `Could not check ${serial}`);
    }
    if (refusal) {
      patch({ error: refusal });
      return refusal;
    }
    patch((now) => {
      const packages = [...now.packages];
      if (index >= packages.length) {
        if (packages.length >= PREPACK_MAX_PACKAGES) return { error: `One run prints at most ${PREPACK_MAX_PACKAGES} labels.` };
        const lead = packages.find((pkg) => !pkg.touched && pkg.condition) ?? packages[0];
        packages.push(draftPackage([known], lead?.condition ?? null));
      } else {
        packages[index] = { ...packages[index]!, serials: [...packages[index]!.serials, known] };
      }
      return { packages, error: null };
    });
    return null;
  }, [patch]);

  /**
   * One typed / scanned serial. Before the serial step settles it is the
   * form's serial; after, it fills the next package without a serial (a new
   * package when every row has one) — the phone handoff sends several.
   */
  const submitSerial = useCallback((raw: string) => {
    const serial = raw.trim();
    if (!serial) return;
    queue.current = queue.current.then(async () => {
      const current = stateRef.current;
      if (current.saved) return;
      if (!serialSettled(current.verdict)) {
        await judgeSerial(serial);
        return;
      }
      const target = current.packages.findIndex((pkg) => pkg.serials.length === 0);
      await addSerialToPackage(target >= 0 ? target : current.packages.length, serial);
    });
  }, [addSerialToPackage, judgeSerial]);

  const removeSerial = useCallback((index: number, serial: string) => {
    patch((now) => ({
      packages: now.packages.map((pkg, i) => (i === index ? { ...pkg, serials: pkg.serials.filter((s) => s !== serial) } : pkg)),
    }));
  }, [patch]);

  /** No serial on this product: skip to Product; package row 1 gets a CycleForge `U-…` handle on save. */
  const skipSerial = useCallback(() => {
    patch((now) => ({ verdict: { kind: 'none' }, verdictSeq: now.verdictSeq + 1, browsing: !now.catalog, error: null }));
  }, [patch]);

  /** Re-open the serial step; the product stays unless the next serial names another. */
  const editSerial = useCallback(() => {
    patch((now) => {
      const old = verdictSerial(now.verdict);
      return {
        verdict: { kind: 'idle' },
        packages: now.packages.map((pkg, i) => (i === 0 && old ? { ...pkg, serials: pkg.serials.filter((s) => s !== old) } : pkg)),
        error: null,
      };
    });
  }, [patch]);

  const setBrowsing = useCallback((browsing: boolean) => patch({ browsing }), [patch]);

  /** Quantity = labels = packages. Growing copies the copy-down condition; shrinking drops the last rows. */
  const setQuantity = useCallback((next: number) => {
    const count = Math.min(PREPACK_MAX_PACKAGES, Math.max(1, Math.floor(next) || 1));
    patch((now) => {
      if (count === now.packages.length) return {};
      if (count < now.packages.length) return { packages: now.packages.slice(0, count) };
      const copy = now.packages.find((pkg) => pkg.condition)?.condition ?? null;
      const added = Array.from({ length: count - now.packages.length }, () => draftPackage([], copy));
      return { packages: [...now.packages, ...added] };
    });
  }, [patch]);

  /** The first condition chosen copies down to every row the operator has not touched. */
  const setCondition = useCallback((index: number, condition: PrepackCondition) => {
    patch((now) => ({
      packages: now.packages.map((pkg, i) => {
        if (i === index) return { ...pkg, condition, touched: true };
        return pkg.touched ? pkg : { ...pkg, condition };
      }),
    }));
  }, [patch]);

  /** The label editor's apply: an empty field returns the slot to the product default. */
  const setLabel = useCallback((index: number, label: PrepackLabelFace) => {
    patch((now) => ({ packages: now.packages.map((pkg, i) => (i === index ? { ...pkg, label } : pkg)) }));
  }, [patch]);

  const setProvenance = useCallback((index: number, provenance: PrepackProvenance) => {
    patch((now) => ({ packages: now.packages.map((pkg, i) => (i === index ? { ...pkg, provenance } : pkg)) }));
  }, [patch]);

  const toggleMissing = useCallback((partId: number) => {
    patch((now) => {
      const missing = new Set(now.missing);
      if (missing.has(partId)) missing.delete(partId);
      else missing.add(partId);
      return { missing };
    });
  }, [patch]);

  /** A pairing write answered with the fresh kit; new parts start Included. */
  const applyKit = useCallback((kit: PrepackKit) => patch({ kit }), [patch]);

  const complete = Boolean(
    state.catalog && state.kit && serialSettled(state.verdict) && state.packages.length > 0
      && state.packages.every((pkg) => pkg.condition),
  );

  /** Save every package in one transaction (once), then print each label in order; each confirmed job leaves the deck. */
  const print = useCallback(async (target: PrintTarget) => {
    const current = stateRef.current;
    if (current.printing || !current.catalog || !current.kit) return;
    patch({ printing: true, error: null, notice: null });
    let units = current.saved;
    try {
      if (!units) {
        const result = await savePrepackPackages({
          skuCatalogId: current.catalog.id,
          packages: current.packages.map((pkg) => ({ serials: pkg.serials, condition: pkg.condition!, provenance: pkg.provenance, label: pkg.label })),
          contents: current.kit.parts.map((part) => ({ kitPartId: part.id, included: !current.missing.has(part.id) })),
          clientEventId: safeRandomUUID(),
        });
        units = result.printUnits;
        patch({ saved: units });
      }
      for (let index = current.printedCount; index < units.length; index += 1) {
        const failure = await target.print(units[index]!);
        if (failure) {
          patch({
            printing: false,
            error: `Label ${index + 1} of ${units.length} did not print — ${failure} The packages are saved; print the rest again.`,
          });
          return;
        }
        patch({ printedCount: index + 1 });
      }
      onPrinted?.();
      const total = units.length;
      setState((now) => ({
        ...START,
        packages: [draftPackage()],
        notice: `${total === 1 ? '1 label' : `${total} labels`} printed for ${current.catalog!.sku}.`,
        runKey: now.runKey + 1,
      }));
    } catch (cause) {
      patch({ printing: false, error: prepackErrorText(cause, 'Could not save the packages') });
    }
  }, [onPrinted, patch]);

  return {
    state,
    complete,
    submitSerial,
    skipSerial,
    editSerial,
    chooseProduct,
    loadProduct,
    setBrowsing,
    setQuantity,
    setCondition,
    setProvenance,
    setLabel,
    addSerialToPackage,
    removeSerial,
    toggleMissing,
    applyKit,
    print,
  };
}

/** The form's state and verbs, shared by both surfaces' shells. */
export interface PrepackForm {
  state: PrepackFormState;
  /** Every section is filled: Print (or Enter) may commit. */
  complete: boolean;
  submitSerial: (raw: string) => void;
  skipSerial: () => void;
  editSerial: () => void;
  chooseProduct: (choice: PrepackCatalogChoice) => void;
  loadProduct: (choice: PrepackCatalogChoice | number) => Promise<PrepackKit | null>;
  setBrowsing: (browsing: boolean) => void;
  setQuantity: (next: number) => void;
  setCondition: (index: number, condition: PrepackCondition) => void;
  setProvenance: (index: number, provenance: PrepackProvenance) => void;
  setLabel: (index: number, label: PrepackLabelFace) => void;
  /** Resolves to the refusal sentence, or null once the serial joined the row. */
  addSerialToPackage: (index: number, raw: string) => Promise<string | null>;
  removeSerial: (index: number, serial: string) => void;
  toggleMissing: (partId: number) => void;
  applyKit: (kit: PrepackKit) => void;
  print: (target: PrintTarget) => Promise<void>;
}
