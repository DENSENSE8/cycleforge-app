'use client';

import { useEffect, useMemo, useRef, type Ref } from 'react';
import {
  registerScanDockPolicy,
  touchScanDockContent,
  type ScanDockHandlers,
  type ScanDockMode,
} from './store';

/**
 * Everything a surface says about the one bar: the stable scalars inline, the
 * volatile callbacks and rail inherited from {@link ScanDockHandlers}.
 */
export interface ScanDockSpec extends ScanDockHandlers {
  id: string;
  placeholder?: string;
  isResolving?: boolean;
  staffId?: string | number | null;
  autoFocus?: boolean;
  inputBorderClassName?: string;
  submitTraceClassName?: string;
  inputRef?: Ref<HTMLInputElement>;
  modes?: readonly ScanDockMode[];
  scanType?: string | null;
  previewMode?: string;
}

const NOOP_HANDLERS: ScanDockHandlers = { onSubmit: () => {} };

/**
 * Publish this surface's scan policy to the global dock.
 *
 * A surface calls this INSTEAD of rendering its own `ThemedScanBar`. The
 * input then lives in the header, above every route change, and this surface
 * only says how it should behave.
 *
 * ## Why the deps look the way they do
 *
 * Registration is keyed on the STABLE half only — the scalars. The volatile
 * half (`onSubmit`, `rightContent`, the lookups) is copied into a ref after
 * every commit and read THROUGH by the dock, so it is always current without
 * ever being a registration input.
 *
 * The natural call site passes an inline arrow and inline JSX. Listing those in
 * the dep array (as this hook did until 2026-08-22) meant an unregister +
 * re-register on **every render** against a module-singleton last-in-wins
 * stack. Best case that is pointless churn on the scan path; worst case a
 * background surface's ordinary re-render re-pushes it to the top and takes the
 * dock away from the surface the operator is actually standing at. See
 * `store.ts` for the full account.
 *
 * Pass `null` to publish nothing (a surface that is mounted but not the active
 * scan bench).
 */
export function useScanDock(spec: ScanDockSpec | null): void {
  const handlers = useRef<ScanDockHandlers>(NOOP_HANDLERS);

  // The volatile half, refreshed after every commit. An effect and not a
  // render-phase write: user events (the only things that read these) always
  // run after commit, so this is both current and concurrent-safe.
  useEffect(() => {
    handlers.current = spec
      ? {
          onSubmit: spec.onSubmit,
          onValueChange: spec.onValueChange,
          lookup: spec.lookup,
          onInput: spec.onInput,
          previewLookup: spec.previewLookup,
          rightContent: spec.rightContent,
        }
      : NOOP_HANDLERS;
  });

  const id = spec?.id;
  const placeholder = spec?.placeholder;
  const isResolving = spec?.isResolving;
  const staffId = spec?.staffId;
  const autoFocus = spec?.autoFocus;
  const inputBorderClassName = spec?.inputBorderClassName;
  const submitTraceClassName = spec?.submitTraceClassName;
  const inputRef = spec?.inputRef;
  const scanType = spec?.scanType;
  const previewMode = spec?.previewMode;
  // A mode list is a tiny array literal at the call site, so compare by value.
  const modesKey = spec?.modes?.join('|') ?? '';
  const modes = useMemo(
    () => (modesKey ? (modesKey.split('|') as ScanDockMode[]) : undefined),
    [modesKey],
  );

  useEffect(() => {
    if (!id) return;
    return registerScanDockPolicy({
      id,
      placeholder,
      isResolving,
      staffId,
      autoFocus,
      inputBorderClassName,
      submitTraceClassName,
      inputRef,
      modes,
      scanType,
      previewMode,
      handlers,
    });
  }, [
    id,
    placeholder,
    isResolving,
    staffId,
    autoFocus,
    inputBorderClassName,
    submitTraceClassName,
    inputRef,
    modes,
    scanType,
    previewMode,
  ]);

  // Repaint the rail. Only a surface that publishes one pays anything, and the
  // trailing `hadRail` bump is what clears a rail the surface just dropped.
  const hasRail = spec?.rightContent != null;
  const hadRail = useRef(false);
  useEffect(() => {
    if (!id) return;
    if (!hasRail && !hadRail.current) return;
    hadRail.current = hasRail;
    touchScanDockContent();
  });
}
