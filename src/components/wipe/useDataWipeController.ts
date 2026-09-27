'use client';

/** Controller for the Data-Wipe Station. */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { unwrapScannedSerial } from '@/lib/barcode-routing';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { refreshDomains } from '@/lib/refresh/bus';
import { playVerdictCue } from '@/lib/scan-feedback/play';
// Type-only — the SoT enum lives in a server module (`'server-only'`).
import type { WipeMethod } from '@/lib/tech/recordDataWipe';

export interface ResolvedWipeUnit {
  id: number;
  serialNumber: string;
  sku: string | null;
  productTitle: string | null;
  currentStatus: string | null;
  conditionGrade: string | null;
  currentLocation: string | null;
  unitUid: string | null;
}

export interface WipeOutcome {
  /** `wiped` → routed to grading; `failed` → routed to repair. */
  kind: 'wiped' | 'failed';
  method: WipeMethod;
  /** True when the POST re-hit the same client_event_id (idempotent retry). */
  idempotent: boolean;
  unit: ResolvedWipeUnit;
}

const DEFAULT_METHOD: WipeMethod = 'factory_reset';

export function useDataWipeController() {
  const [inputValue, setInputValue] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  /** `true`/`false` = that verdict is in flight; `null` = idle. Lets the view
   *  spin only the button that was pressed and gate re-entrant submits. */
  const [submittingVerdict, setSubmittingVerdict] = useState<boolean | null>(null);
  const [activeUnit, setActiveUnit] = useState<ResolvedWipeUnit | null>(null);
  const [wipeMethod, setWipeMethod] = useState<WipeMethod>(DEFAULT_METHOD);
  const [outcome, setOutcome] = useState<WipeOutcome | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  // One idempotency key per scanned unit; the verdict POST reuses it so a
  // double-click / wedge double-fire collapses to a no-op server-side.
  const clientEventIdRef = useRef<string>('');

  const isSubmitting = submittingVerdict !== null;
  const isBusy = isResolving || isSubmitting;

  const focusInput = useCallback(() => {
    // One-tick defer so React commits the cleared input before focus returns.
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // Focus-watchdog:
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') inputRef.current?.focus();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Pick an erasure method, then return focus to the scan bar so a wedge scan of
  // the next unit isn't swallowed by the just-clicked pill (focus-lock, §3).
  const selectMethod = useCallback(
    (method: WipeMethod) => {
      setWipeMethod(method);
      focusInput();
    },
    [focusInput],
  );

  const resetStation = useCallback(() => {
    setActiveUnit(null);
    setOutcome(null);
    setErrorMessage(null);
    setWipeMethod(DEFAULT_METHOD);
    clientEventIdRef.current = '';
  }, []);

  // ── 1+2. SCAN → RESOLVE ───────────────────────────────────────────────────
  const handleScan = useCallback(
    async (e?: FormEvent) => {
      if (e) e.preventDefault();
      const raw = unwrapScannedSerial(inputValue);
      if (!raw) return;
      if (isResolving || submittingVerdict !== null) return; // double-fire / wedge-burst guard

      setIsResolving(true);
      setErrorMessage(null);
      setOutcome(null);
      setActiveUnit(null); // crossfade the previous card out before the new one mounts

      try {
        // The GET resolver accepts a numeric id, a device serial, OR a minted
        // unit_uid (printed-label QR) and returns the unit row incl. its id.
        const res = await fetch(`/api/serial-units/${encodeURIComponent(raw)}`);
        const data = await res.json().catch(() => null);
        const unit = data?.serial_unit;
        if (!res.ok || !data?.success || !unit?.id) {
          setErrorMessage(
            res.status === 404 || !unit
              ? `No unit found for "${raw}". Scan the device serial or its printed unit label.`
              : data?.error || `Lookup failed (${res.status}).`,
          );
          return;
        }

        setActiveUnit({
          id: Number(unit.id),
          serialNumber: String(unit.serial_number ?? raw),
          sku: unit.sku ?? null,
          productTitle: unit.product_title ?? null,
          currentStatus: unit.current_status ?? null,
          conditionGrade: unit.condition_grade ?? null,
          currentLocation: unit.current_location ?? null,
          unitUid: unit.unit_uid ?? null,
        });
        setWipeMethod(DEFAULT_METHOD);
        clientEventIdRef.current = safeRandomUUID();
      } catch {
        setErrorMessage('Network error resolving the serial. Try the scan again.');
      } finally {
        setIsResolving(false);
        setInputValue('');
        focusInput();
      }
    },
    [inputValue, isResolving, submittingVerdict, focusInput],
  );

  // ── 4. RECORD the wipe verdict ────────────────────────────────────────────
  const submitWipe = useCallback(
    async (success: boolean) => {
      const unit = activeUnit;
      if (!unit || submittingVerdict !== null) return; // re-entrant guard
      setSubmittingVerdict(success);
      setErrorMessage(null);

      try {
        const res = await fetch(`/api/serial-units/${unit.id}/data-wipe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wipe_success: success,
            wipe_method: wipeMethod,
            client_event_id: clientEventIdRef.current || safeRandomUUID(),
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          // Request-level failure (network / 5xx) — keep the active card so the
          // operator can retry; this is distinct from a recorded `failed` wipe.
          setErrorMessage(data?.error || `Wipe record failed (${res.status}).`);
          return;
        }

        const kind: WipeOutcome['kind'] = success ? 'wiped' : 'failed';
        setOutcome({ kind, method: wipeMethod, idempotent: Boolean(data.idempotent), unit });
        playVerdictCue(kind === 'wiped' ? 'pass' : 'fail');
        refreshDomains(['receiving.lines']);
      } catch {
        setErrorMessage('Network error recording the wipe. Try again.');
      } finally {
        setSubmittingVerdict(null);
        focusInput();
      }
    },
    [activeUnit, submittingVerdict, wipeMethod, focusInput],
  );

  return {
    inputValue,
    setInputValue,
    isResolving,
    submittingVerdict,
    isSubmitting,
    isBusy,
    activeUnit,
    wipeMethod,
    setWipeMethod,
    selectMethod,
    outcome,
    errorMessage,
    inputRef,
    handleScan,
    submitWipe,
    resetStation,
  };
}
