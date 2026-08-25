'use client';

/**
 * /putaway — the phone put-away surface (00-endgame D4/D5, §6 D10).
 *
 * One screen, three states, no navigation: UNIT → BIN → PLACED. Standing at a
 * rack, one hand on the phone, the other on the item — scan the unit, scan the
 * bin, see it land, scan the next one. This is the moment that CREATES the
 * spine's truth ("scan any QR and the location is never wrong"), so the input
 * truth layer is not optional here:
 *
 *  - The UNIT may arrive any way — wedge scan (`useFindFieldScan` claims a
 *    machine-fast burst that decodes to a printed handle), paste, or typed
 *    (damaged labels get typed serials). Every path is stamped with how it
 *    arrived and the stamp goes on the wire.
 *  - The BIN commits ONLY on a wedge claim (`source: 'scanner'`) or a camera
 *    decode (`source: 'camera'`). Typed or pasted text into the location step
 *    is refused client-side with D10's own words — the server (schema, domain
 *    writer, DB CHECK) enforces the same law; the client refusal is UX
 *    honesty, not the enforcement.
 *  - Every commit carries a client-minted `clientEventId`, so a flaky-network
 *    retry re-sends the SAME event and can never double-record.
 *
 * Chromeless by design — no shell import. ShellRoot lists `/putaway` in its
 * CHROMELESS array (added 2026-08-24) so this page mounts frameless.
 *
 * Known truth-layer limitations (review, 2026-08-24): a gun burst that does
 * not decode to a printed handle cannot be claimed by useFindFieldScan — on
 * the UNIT field it lands stamped 'human' (lawful, under-reported); on the
 * BIN field it is refused with the camera hint (the camera is the lawful path
 * for legacy short labels). Extending the claim vocabulary to machine-fast
 * non-handle bursts is the follow-up; committing field text on Enter is not
 * an acceptable shortcut. The 'done' phase mounts no wedge-armed input yet —
 * "scan the next one" costs one tap until that follow-up lands.
 *
 * Styling follows the shell's design law (src/shell/tokens.css): square
 * corners, borders carry structure, state is outline, and NOTHING animates
 * geometry — the only transitions here are color/opacity at --t-tint (M1).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useFindFieldScan,
  type FindFieldPasteStamp,
  type FindFieldScanClaim,
} from '@/hooks/useFindFieldScan';
import { unwrapScannedLocation, unwrapScannedSerial } from '@/lib/barcode-routing';
// Type-only: erased at compile time, so the client bundle never touches the
// server half of spine-lookup.
import type { LocationSpine, UnitSpine } from '@/lib/inventory/spine-lookup';
import {
  CameraDeniedError,
  isBarcodeCameraSupported,
  startBarcodeCamera,
} from '@/lib/scan/putaway-camera';
import { safeRandomUUID } from '@/lib/safe-uuid';

/** D10, verbatim. Shown exactly — the law is the message. */
const D10_REFUSAL = 'A location is a fact created by a scan, and only a scan.';

type ScanSource = 'scanner' | 'camera' | 'paste' | 'human';

/** A stamped read from the input truth layer — what arrived, and how. */
interface ScanStamp {
  value: string;
  source: ScanSource;
}

/** POST /api/inventory/placements body (PlacementCreateBody's client twin). */
interface PlacementPayload {
  unitScan: ScanStamp;
  locationScan: ScanStamp;
  clientEventId: string;
}

interface PlacementResultWire {
  placementId: number | null;
  serialUnitId: number;
  locationId: number;
  previousLocationId: number | null;
  alreadyRecorded: boolean;
}

/**
 * The screen's state machine. `lookup`/`committing` are the busy faces of
 * steps 1 and 2; `retry` is a failed commit holding its payload so the SAME
 * clientEventId goes back out.
 */
type Phase =
  | { kind: 'unit' }
  | { kind: 'lookup'; scanned: string }
  | { kind: 'bin'; unitStamp: ScanStamp; unit: UnitSpine }
  | { kind: 'committing'; unitStamp: ScanStamp; unit: UnitSpine }
  | {
      kind: 'retry';
      unitStamp: ScanStamp;
      unit: UnitSpine;
      payload: PlacementPayload;
      message: string;
    }
  | { kind: 'done'; serial: string; locationLabel: string; already: boolean };

/** Step-1 outcomes that keep the screen on the unit step. */
type UnitNotice =
  | { kind: 'miss'; scanned: string }
  | { kind: 'location'; answer: LocationSpine }
  | { kind: 'error'; message: string };

function stepOf(phase: Phase): 1 | 2 | 3 {
  if (phase.kind === 'unit' || phase.kind === 'lookup') return 1;
  if (phase.kind === 'done') return 3;
  return 2;
}

/**
 * Send-side normalisation: the server resolves units by `unit_uid` /
 * normalized serial and locations by `locations.barcode`, so a printed label's
 * URL / GS1 / handle wrapper must be unwrapped at the input — the one decoder
 * (`routeScan`, via the unwrap helpers) does it; plain text passes through.
 */
function unwrapForLookup(claim: FindFieldScanClaim): string {
  return claim.route.type === 'bin'
    ? unwrapScannedLocation(claim.value)
    : unwrapScannedSerial(claim.value);
}

export default function PutawayPage() {
  const [phase, setPhase] = useState<Phase>({ kind: 'unit' });
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const [unitField, setUnitField] = useState('');
  const [binField, setBinField] = useState('');
  const [unitNotice, setUnitNotice] = useState<UnitNotice | null>(null);
  const [binError, setBinError] = useState<string | null>(null);

  // Feature-detected in an effect: SSR renders false, so the button appears
  // only after hydration and the markup never mismatches.
  const [cameraSupported, setCameraSupported] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const unitInputEl = useRef<HTMLInputElement | null>(null);
  const binInputEl = useRef<HTMLInputElement | null>(null);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  /** Last pasted text (trimmed) — an honest 'paste' stamp when it is what gets submitted. */
  const lastUnitPaste = useRef<string | null>(null);

  useEffect(() => {
    setCameraSupported(isBarcodeCameraSupported());
  }, []);

  // ── Step 1 · UNIT ─────────────────────────────────────────────────────────

  const lookupUnit = useCallback(async (stamp: ScanStamp) => {
    setUnitNotice(null);
    setBinError(null);
    setPhase({ kind: 'lookup', scanned: stamp.value });
    try {
      const r = await fetch(
        `/api/inventory/spine?scan=${encodeURIComponent(stamp.value)}`,
        { cache: 'no-store' },
      );
      if (r.status === 404) {
        setUnitNotice({ kind: 'miss', scanned: stamp.value });
        setPhase({ kind: 'unit' });
        return;
      }
      if (!r.ok) throw new Error(`spine lookup failed (${r.status})`);
      const data = (await r.json()) as {
        success: boolean;
        answer: UnitSpine | LocationSpine;
      };
      if (data.answer.kind === 'location') {
        // A bin label in the unit step: show what the spine knows, read-only.
        setUnitNotice({ kind: 'location', answer: data.answer });
        setPhase({ kind: 'unit' });
        return;
      }
      setPhase({ kind: 'bin', unitStamp: stamp, unit: data.answer });
    } catch {
      setUnitNotice({
        kind: 'error',
        message: 'Lookup failed — check the connection and scan again.',
      });
      setPhase({ kind: 'unit' });
    }
  }, []);

  const onUnitScan = useCallback(
    (claim: FindFieldScanClaim) => {
      // The claimed burst's characters landed in the field — the caller
      // strips them (useFindFieldScan contract).
      setUnitField('');
      lastUnitPaste.current = null;
      void lookupUnit({ value: unwrapForLookup(claim), source: 'scanner' });
    },
    [lookupUnit],
  );

  const onUnitPaste = useCallback((paste: FindFieldPasteStamp) => {
    lastUnitPaste.current = paste.value.trim();
  }, []);

  const unitScanRef = useFindFieldScan({ onScan: onUnitScan, onPaste: onUnitPaste });
  const attachUnitInput = useCallback(
    (el: HTMLInputElement | null) => {
      unitInputEl.current = el;
      unitScanRef(el);
    },
    [unitScanRef],
  );

  /** Typed (or pasted-then-submitted) unit entry — lawful; stamped honestly. */
  const submitUnitField = useCallback(() => {
    const raw = unitField.trim();
    if (!raw) return;
    const source: ScanSource = lastUnitPaste.current === raw ? 'paste' : 'human';
    setUnitField('');
    lastUnitPaste.current = null;
    void lookupUnit({ value: unwrapScannedSerial(raw), source });
  }, [unitField, lookupUnit]);

  // ── Step 2 · BIN ──────────────────────────────────────────────────────────

  const postPlacement = useCallback(
    async (unitStamp: ScanStamp, unit: UnitSpine, payload: PlacementPayload) => {
      setBinError(null);
      setPhase({ kind: 'committing', unitStamp, unit });
      try {
        const r = await fetch('/api/inventory/placements', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (r.status === 404) {
          const data = (await r.json().catch(() => ({}))) as { kind?: string };
          if (data.kind === 'unit') {
            setUnitNotice({ kind: 'miss', scanned: payload.unitScan.value });
            setPhase({ kind: 'unit' });
          } else {
            setBinError(
              `No bin in the system matches '${payload.locationScan.value}'. Check the label and scan again.`,
            );
            setPhase({ kind: 'bin', unitStamp, unit });
          }
          return;
        }
        if (r.status === 400 || r.status === 401 || r.status === 403) {
          const data = (await r.json().catch(() => ({}))) as { error?: string };
          setBinError(data.error ?? 'The server refused this placement.');
          setPhase({ kind: 'bin', unitStamp, unit });
          return;
        }
        if (!r.ok) throw new Error(`placement failed (${r.status})`);
        const data = (await r.json()) as {
          success: boolean;
          idempotent?: boolean;
          result: PlacementResultWire;
        };
        setPhase({
          kind: 'done',
          serial: unit.unit.serialNumber,
          locationLabel: payload.locationScan.value,
          already: data.idempotent === true || data.result.alreadyRecorded,
        });
      } catch {
        // Network died before an answer. Keep the payload — retrying re-sends
        // the SAME clientEventId, which is exactly what makes retry safe.
        setPhase({
          kind: 'retry',
          unitStamp,
          unit,
          payload,
          message:
            'The network dropped before the server answered. Nothing is lost — retry sends the same scan with the same id, so it can never record twice.',
        });
      }
    },
    [],
  );

  const commitLocation = useCallback(
    (stamp: ScanStamp) => {
      const p = phaseRef.current;
      if (p.kind !== 'bin') return;
      setCameraOpen(false);
      void postPlacement(p.unitStamp, p.unit, {
        unitScan: p.unitStamp,
        locationScan: stamp,
        clientEventId: safeRandomUUID(),
      });
    },
    [postPlacement],
  );

  const onBinScan = useCallback(
    (claim: FindFieldScanClaim) => {
      setBinField('');
      commitLocation({ value: unwrapScannedLocation(claim.value), source: 'scanner' });
    },
    [commitLocation],
  );

  /** A paste can never be location evidence — refuse the moment it lands,
      and clear the field so "scan only" never shows committable-looking text. */
  const onBinPaste = useCallback(() => {
    setBinField('');
    setBinError(D10_REFUSAL);
  }, []);

  const binScanRef = useFindFieldScan({ onScan: onBinScan, onPaste: onBinPaste });
  const attachBinInput = useCallback(
    (el: HTMLInputElement | null) => {
      binInputEl.current = el;
      binScanRef(el);
    },
    [binScanRef],
  );

  /** Enter on typed text in the bin field — the D10 refusal, in D10's words.
      This also catches a REAL gun scan of a legacy short label (A12/B04): those
      bursts carry no decodable handle, so the truth layer cannot claim them and
      they land as field text. Policy (review ruling, 2026-08-24): the camera is
      the lawful path for legacy labels; the refusal hint says so. Extending the
      wedge claim to machine-fast non-handle bursts is a truth-layer follow-up —
      never commit field text on Enter, which would reopen the typed hole. */
  const refuseTypedBin = useCallback(() => {
    if (binField.trim()) {
      setBinField('');
      setBinError(D10_REFUSAL);
    }
  }, [binField]);

  // ── Camera (the phone's lawful scan) ──────────────────────────────────────

  useEffect(() => {
    if (!cameraOpen) return;
    const video = videoEl.current;
    if (!video) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    startBarcodeCamera(video, (value) => {
      commitLocation({ value: unwrapScannedLocation(value), source: 'camera' });
    })
      .then((s) => {
        if (cancelled) s();
        else stop = s;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCameraOpen(false);
        setBinError(
          err instanceof CameraDeniedError
            ? 'Camera permission was refused. Allow camera access, or scan the bin with a paired scanner.'
            : 'The camera could not start. Scan the bin with a paired scanner.',
        );
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [cameraOpen, commitLocation]);

  // Leaving the bin step always releases the camera.
  useEffect(() => {
    if (phase.kind !== 'bin') setCameraOpen(false);
  }, [phase.kind]);

  // The armed field is focused so a wedge burst has somewhere to land.
  useEffect(() => {
    if (phase.kind === 'unit') unitInputEl.current?.focus();
    else if (phase.kind === 'bin') binInputEl.current?.focus();
  }, [phase.kind]);

  const startNext = useCallback(() => {
    setUnitField('');
    setBinField('');
    setUnitNotice(null);
    setBinError(null);
    setCameraOpen(false);
    lastUnitPaste.current = null;
    setPhase({ kind: 'unit' });
    unitInputEl.current?.focus();
  }, []);

  const step = stepOf(phase);

  return (
    <main className="pa-root">
      <style>{PUTAWAY_CSS}</style>
      <div className="pa-col">
        <header className="pa-head">
          <p className="pa-eyebrow">Put-away</p>
          <ol className="pa-steps" aria-label="Put-away progress">
            <li className={step === 1 ? 'is-active' : 'is-done'}>1 · Unit</li>
            <li className={step === 2 ? 'is-active' : step > 2 ? 'is-done' : ''}>
              2 · Bin
            </li>
            <li className={step === 3 ? 'is-active' : ''}>3 · Placed</li>
          </ol>
        </header>

        {/* ── State 1 · UNIT ─────────────────────────────────────────────── */}
        {(phase.kind === 'unit' || phase.kind === 'lookup') && (
          <section className="pa-panel" aria-label="Unit">
            <label className="pa-label" htmlFor="pa-unit">
              Unit
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitUnitField();
              }}
            >
              <input
                id="pa-unit"
                ref={attachUnitInput}
                className="pa-input"
                value={unitField}
                onChange={(e) => setUnitField(e.target.value)}
                placeholder="Scan the unit label"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                enterKeyHint="go"
                disabled={phase.kind === 'lookup'}
              />
              <p className="pa-hint">
                Scan with the gun — or type the serial when the label is damaged.
              </p>
              <button
                type="submit"
                className="pa-btn pa-btn-secondary"
                disabled={phase.kind === 'lookup' || !unitField.trim()}
              >
                Look up typed serial
              </button>
            </form>
            {phase.kind === 'lookup' && (
              <p className="pa-status" role="status">
                Looking up <span className="pa-mono">{phase.scanned}</span>…
              </p>
            )}
            {unitNotice?.kind === 'miss' && (
              <div className="pa-note pa-note-danger" role="alert">
                <p className="pa-note-title">Not in the system</p>
                <p>
                  <span className="pa-mono">{unitNotice.scanned}</span> matches no
                  unit and no bin here. Check the label — or the unit has not been
                  registered yet.
                </p>
              </div>
            )}
            {unitNotice?.kind === 'error' && (
              <div className="pa-note pa-note-danger" role="alert">
                <p className="pa-note-title">Lookup failed</p>
                <p>{unitNotice.message}</p>
              </div>
            )}
            {unitNotice?.kind === 'location' && (
              <LocationCard answer={unitNotice.answer} />
            )}
          </section>
        )}

        {/* ── State 2 · BIN ──────────────────────────────────────────────── */}
        {(phase.kind === 'bin' ||
          phase.kind === 'committing' ||
          phase.kind === 'retry') && (
          <>
            <UnitCard unit={phase.unit} />
            {phase.kind === 'retry' ? (
              <div className="pa-note pa-note-danger" role="alert">
                <p className="pa-note-title">Not recorded yet</p>
                <p>{phase.message}</p>
                <p className="pa-meta pa-mono">
                  {phase.unit.unit.serialNumber} → {phase.payload.locationScan.value}
                </p>
                <button
                  className="pa-btn"
                  onClick={() => {
                    void postPlacement(phase.unitStamp, phase.unit, phase.payload);
                  }}
                >
                  Retry
                </button>
                <button className="pa-textbtn" onClick={startNext}>
                  Discard and start over
                </button>
              </div>
            ) : (
              <section className="pa-panel" aria-label="Bin">
                <label className="pa-label" htmlFor="pa-bin">
                  Bin — scan only
                </label>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    refuseTypedBin();
                  }}
                >
                  <input
                    id="pa-bin"
                    ref={attachBinInput}
                    className="pa-input"
                    value={binField}
                    onChange={(e) => setBinField(e.target.value)}
                    placeholder="Scan the bin label"
                    inputMode="none"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={phase.kind === 'committing'}
                  />
                </form>
                {cameraSupported && !cameraOpen && phase.kind === 'bin' && (
                  <button
                    className="pa-btn"
                    onClick={() => {
                      setBinError(null);
                      setCameraOpen(true);
                    }}
                  >
                    Scan bin with camera
                  </button>
                )}
                {cameraOpen && phase.kind === 'bin' && (
                  <div className="pa-camera">
                    {/* Live camera preview — no audio track exists, nothing to caption. */}
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video ref={videoEl} className="pa-video" muted playsInline />
                    <button
                      className="pa-btn pa-btn-secondary"
                      onClick={() => setCameraOpen(false)}
                    >
                      Close camera
                    </button>
                  </div>
                )}
                {phase.kind === 'committing' && (
                  <p className="pa-status" role="status">
                    Recording…
                  </p>
                )}
                {binError && (
                  <div className="pa-note pa-note-danger" role="alert">
                    <p>{binError}</p>
                    {cameraSupported && (
                      <p className="pa-note-hint">
                        Older short bin labels can’t be gun-read here — use the camera.
                      </p>
                    )}
                  </div>
                )}
                <button
                  className="pa-textbtn"
                  onClick={startNext}
                  disabled={phase.kind === 'committing'}
                >
                  Different unit
                </button>
              </section>
            )}
          </>
        )}

        {/* ── State 3 · PLACED ───────────────────────────────────────────── */}
        {phase.kind === 'done' && (
          <section className="pa-done" role="status" aria-label="Placement recorded">
            {phase.already && (
              <p className="pa-done-eyebrow">Already recorded</p>
            )}
            <p className="pa-done-line">
              <span className="pa-mono">{phase.serial}</span>
              <span className="pa-done-arrow" aria-hidden>
                ↓
              </span>
              <span className="pa-mono">{phase.locationLabel}</span>
            </p>
            <p className="pa-done-sub">
              {phase.already
                ? 'This exact placement was recorded before — nothing was written twice.'
                : 'Placement recorded.'}
            </p>
            <button className="pa-btn pa-btn-success" onClick={startNext}>
              Scan next unit
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

// ── Cards ───────────────────────────────────────────────────────────────────

/** Step-2 header: what the spine knows about the unit in hand, compactly. */
function UnitCard({ unit }: { unit: UnitSpine }) {
  const u = unit.unit;
  const loc = unit.location;
  return (
    <section className="pa-unitcard" aria-label="Unit in hand">
      <p className="pa-note-eyebrow">Unit</p>
      <p className="pa-big pa-mono">{u.serialNumber}</p>
      <dl className="pa-grid">
        {u.sku && (
          <>
            <dt>SKU</dt>
            <dd className="pa-mono">{u.sku}</dd>
          </>
        )}
        <dt>Status</dt>
        <dd>{u.status}</dd>
        {u.conditionGrade && (
          <>
            <dt>Grade</dt>
            <dd>{u.conditionGrade}</dd>
          </>
        )}
        <dt>Currently</dt>
        <dd>
          {loc
            ? loc.displayName ?? loc.name
            : 'Not placed yet — no scan-recorded location.'}
        </dd>
      </dl>
      {unit.legacyLocationClaim && (
        <p className="pa-legacy">
          <span className="pa-legacy-tag">Unverified claim</span>
          Pre-spine record says “{unit.legacyLocationClaim}” — never confirmed by
          a scan.
        </p>
      )}
    </section>
  );
}

/** A bin label scanned in the unit step — the location's answer, read-only. */
function LocationCard({ answer }: { answer: LocationSpine }) {
  const loc = answer.location;
  const shown = answer.units.slice(0, 5);
  const more = answer.units.length - shown.length;
  return (
    <div className="pa-note">
      <p className="pa-note-eyebrow">Location · read-only</p>
      <p className="pa-big pa-mono">{loc.displayName ?? loc.name}</p>
      {loc.room && <p className="pa-meta">Room: {loc.room}</p>}
      <p className="pa-meta">
        {answer.units.length === 0
          ? 'Nothing is recorded in this bin.'
          : `${answer.units.length} unit${answer.units.length === 1 ? '' : 's'} recorded here:`}
      </p>
      {shown.length > 0 && (
        <ul className="pa-list">
          {shown.map((u) => (
            <li key={u.id} className="pa-mono">
              {u.serialNumber}
              {u.sku ? ` · ${u.sku}` : ''}
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <p className="pa-meta">…and {more} more</p>}
      {answer.pullsIn.length > 0 && (
        <>
          <p className="pa-meta">Recent parts pulled into this bin:</p>
          <ul className="pa-list">
            {answer.pullsIn.slice(0, 3).map((p, i) => (
              <li key={i}>
                {p.partLabel} ×{p.quantity}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="pa-hint-strong">
        This is a bin label. Scan a unit to place something into it.
      </p>
    </div>
  );
}

// ── Stylesheet ──────────────────────────────────────────────────────────────
// Shell design law: square corners (radius exists nowhere), borders carry the
// structure (no shadows), state is outline, and the ONLY transitions are
// color/opacity at --t-tint — geometry never animates (M1).

const PUTAWAY_CSS = `
.pa-root{position:fixed;inset:0;z-index:var(--z-modal);overflow-y:auto;background:var(--bg-canvas);color:var(--text-primary);-webkit-overflow-scrolling:touch;}
.pa-col{max-width:26rem;margin:0 auto;min-height:100%;display:flex;flex-direction:column;gap:var(--sp-4);padding:calc(var(--sp-4) + env(safe-area-inset-top)) var(--sp-4) calc(var(--sp-8) + env(safe-area-inset-bottom));}
.pa-head{display:flex;flex-direction:column;gap:var(--sp-2);}
.pa-eyebrow{margin:0;font-family:var(--font-condensed);font-size:var(--sz-xs);letter-spacing:.08em;text-transform:uppercase;color:var(--text-technical);}
.pa-steps{display:flex;gap:var(--sp-2);list-style:none;margin:0;padding:0;}
.pa-steps li{flex:1;border:1px solid var(--border-subtle);padding:var(--sp-1) var(--sp-2);font-family:var(--font-condensed);font-size:var(--sz-technical-label);letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);background:var(--bg-surface);text-align:center;transition:color var(--t-tint) linear,background-color var(--t-tint) linear,border-color var(--t-tint) linear;}
.pa-steps li.is-active{border-color:var(--border-accent);color:var(--text-accent);background:var(--surfaceSubtle-accent);}
.pa-steps li.is-done{border-color:var(--border-success);color:var(--text-success);background:var(--surfaceSubtle-success);}
.pa-panel{display:flex;flex-direction:column;gap:var(--sp-3);border:1px solid var(--border-strong);background:var(--bg-surface);padding:var(--sp-4);}
.pa-panel form{display:flex;flex-direction:column;gap:var(--sp-3);}
.pa-label{font-family:var(--font-condensed);font-size:var(--sz-xs);letter-spacing:.08em;text-transform:uppercase;color:var(--text-label);}
.pa-input{appearance:none;border-radius:var(--r-none);width:100%;min-height:48px;padding:0 var(--sp-3);font-family:var(--font-mono);font-size:var(--sz-md);color:var(--text-value);background:var(--surface-containerLowest);border:1px solid var(--border-strong);}
.pa-input:focus{outline:2px solid var(--border-accent);outline-offset:-2px;}
.pa-input:disabled{opacity:.5;}
.pa-input::placeholder{color:var(--text-muted);font-family:var(--font-sans);}
.pa-hint{margin:0;font-size:var(--sz-xs);color:var(--text-muted);}
.pa-hint-strong{margin:0;font-size:var(--sz-sm);font-weight:600;color:var(--text-primary);}
.pa-btn{appearance:none;border-radius:var(--r-none);min-height:48px;padding:0 var(--sp-4);font-family:var(--font-sans);font-size:var(--sz-md);font-weight:600;color:var(--text-inverse);background:var(--bg-inverse);border:1px solid var(--bg-inverse);cursor:pointer;transition:opacity var(--t-tint) linear;}
.pa-btn:active{opacity:.8;}
.pa-btn:disabled{opacity:.4;cursor:default;}
.pa-btn:focus-visible{outline:2px solid var(--border-accent);outline-offset:2px;}
.pa-btn-secondary{color:var(--text-primary);background:var(--surface-containerLow);border:1px solid var(--border-strong);}
.pa-btn-success{color:var(--text-inverse);background:var(--border-success);border-color:var(--border-success);}
.pa-textbtn{appearance:none;background:none;border:none;border-radius:var(--r-none);min-height:48px;padding:0;font-family:var(--font-sans);font-size:var(--sz-sm);font-weight:600;color:var(--text-secondary);cursor:pointer;text-align:left;transition:color var(--t-tint) linear;}
.pa-textbtn:active{color:var(--text-primary);}
.pa-textbtn:disabled{opacity:.4;cursor:default;}
.pa-textbtn:focus-visible{outline:2px solid var(--border-accent);outline-offset:2px;}
.pa-status{margin:0;font-size:var(--sz-sm);color:var(--text-secondary);}
.pa-note{border:1px solid var(--border-subtle);background:var(--bg-surface);padding:var(--sp-3);display:flex;flex-direction:column;gap:var(--sp-2);font-size:var(--sz-sm);}
.pa-note p{margin:0;}
.pa-note-danger{border-color:var(--border-danger);background:var(--surfaceSubtle-danger);}
.pa-note-title{font-family:var(--font-condensed);font-size:var(--sz-xs);letter-spacing:.08em;text-transform:uppercase;color:var(--text-danger);}
.pa-note-eyebrow{margin:0;font-family:var(--font-condensed);font-size:var(--sz-technical-label);letter-spacing:.08em;text-transform:uppercase;color:var(--text-technical);}
.pa-note-hint{margin:4px 0 0;font-size:var(--sz-xs);color:var(--text-secondary);}
.pa-big{margin:0;font-size:var(--sz-xl);font-weight:600;color:var(--text-value);word-break:break-all;}
.pa-mono{font-family:var(--font-mono);}
.pa-meta{margin:0;font-size:var(--sz-xs);color:var(--text-secondary);}
.pa-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:var(--sp-1);font-size:var(--sz-data-value);color:var(--text-value);}
.pa-unitcard{border:1px solid var(--border-strong);border-left:3px solid var(--border-accent);background:var(--bg-surface);padding:var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-2);}
.pa-grid{display:grid;grid-template-columns:auto 1fr;gap:var(--sp-1) var(--sp-3);margin:0;}
.pa-grid dt{font-family:var(--font-condensed);font-size:var(--sz-technical-label);letter-spacing:.08em;text-transform:uppercase;color:var(--text-label);align-self:baseline;}
.pa-grid dd{margin:0;font-size:var(--sz-data-value);color:var(--text-value);word-break:break-word;}
.pa-legacy{margin:0;font-size:var(--sz-xs);color:var(--text-secondary);border-top:1px solid var(--border-subtle);padding-top:var(--sp-2);}
.pa-legacy-tag{font-family:var(--font-condensed);font-size:var(--sz-technical-label);letter-spacing:.08em;text-transform:uppercase;color:var(--text-warning);border:1px solid var(--border-warning);padding:0 var(--sp-1);margin-right:var(--sp-2);}
.pa-camera{display:flex;flex-direction:column;gap:var(--sp-2);}
.pa-video{width:100%;aspect-ratio:3/4;object-fit:cover;background:var(--bg-inverse);border:1px solid var(--border-strong);}
.pa-done{border:2px solid var(--border-success);background:var(--surfaceSubtle-success);padding:var(--sp-6) var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-3);text-align:center;}
.pa-done-eyebrow{margin:0;font-family:var(--font-condensed);font-size:var(--sz-xs);letter-spacing:.08em;text-transform:uppercase;color:var(--text-warning);}
.pa-done-line{margin:0;display:flex;flex-direction:column;gap:var(--sp-1);font-size:var(--sz-2xl);font-weight:700;color:var(--text-success);word-break:break-all;}
.pa-done-arrow{font-size:var(--sz-xl);}
.pa-done-sub{margin:0;font-size:var(--sz-sm);color:var(--text-secondary);}
`;
