/**
 * View-monitor evaluation core — the pure, edge-triggered hysteresis state
 * machine for watch-a-view alerts.
 * ─────────────────────────────────────────────────────────────────────────────
 * Deps-free by design: it takes a monitor's definition, its persisted runtime
 * state, the value the resolver just computed, and `now`, and returns whether to
 * FIRE (breach / recovery) and the next state to persist. No DB, no clock, no
 * I/O — so the whole alerting contract (fire once, stay silent while breached,
 * recover on clear, throttle repeats by cooldown) is unit-tested with zero
 * network and is stable under `TZ=UTC` (all time math is epoch-ms).
 *
 * Plan: docs/todo/view-threshold-alerts-and-digests-IMPLEMENTATION-PLAN.md
 * (Phase 0). Locked decision "Hysteresis mandatory": the #1 alerting failure
 * mode is fatigue, so a crossing fires exactly ONCE; it does not re-fire until
 * the value clears the recovery band (→ recovery) or, if a cooldown is set, the
 * cooldown elapses (→ a throttled repeat).
 *
 * `scheduled_digest` is NOT a threshold monitor — it is compiled on a cadence
 * (Phase 4) and must never be routed here; passing it is a programming error and
 * throws.
 */

/** The four monitor kinds. Kept in lockstep with view_monitors_threshold_type_chk. */
export type ThresholdType =
  | 'count_above'
  | 'count_below'
  | 'item_aging'
  | 'scheduled_digest';

/** Runtime lifecycle. Kept in lockstep with view_monitors_state_chk. */
export type MonitorState = 'armed' | 'breached';

/** The threshold kinds this evaluator handles (everything but the digest). Internal. */
type ThresholdMonitorType = Exclude<ThresholdType, 'scheduled_digest'>;

/**
 * The trigger definition the evaluator needs — a DB-free projection of the
 * relevant `view_monitors` columns. `cooldown_interval` (an INTERVAL in the DB)
 * is projected to `cooldownMs` so the core never parses intervals.
 */
export interface ViewMonitorDef {
  readonly thresholdType: ThresholdType;
  /** The crossing threshold. For `item_aging` this is the COUNT bound (the age
   *  bound T lives in monitor_params and is applied by the resolver). */
  readonly thresholdValue: number;
  /** Hysteresis band edge that clears a breach. `null` → the band collapses to
   *  the threshold line (clear as soon as the value is no longer over it). */
  readonly recoveryValue: number | null;
  /** Minimum ms between successive breach fires while still breached. `null` →
   *  no repeats (pure edge-trigger; recovery is the only exit). */
  readonly cooldownMs: number | null;
}

/** The persisted runtime state the evaluator reads. */
export interface ViewMonitorRuntime {
  readonly state: MonitorState;
  /** When the current breach episode began; `null` while armed. */
  readonly breachedAt: Date | null;
  /** When the monitor last emitted anything (breach or recovery); `null` if never. */
  readonly lastFiredAt: Date | null;
}

/**
 * The evaluator's verdict. The caller (the cron) persists:
 *   monitor_state     = nextState
 *   breached_at       = breachedAt
 *   last_value        = <the currentValue it passed in>
 *   last_evaluated_at = <now>
 *   last_fired_at     = <now> ONLY when `fire` is set
 * and, when `fire` is set, emits the matching event.
 *
 * Not exported: it is the inferred return type of `evaluateViewMonitor`, so a
 * caller gets the shape for free. Phase 2 (the cron) can name it via
 * `ReturnType<typeof evaluateViewMonitor>` or this can be exported when a real
 * consumer needs the name.
 */
interface EvaluateResult {
  /** Emit a breach or recovery this cycle; absent = stay quiet. */
  readonly fire?: 'breach' | 'recovery';
  readonly nextState: MonitorState;
  /** The breach-episode start to persist (unchanged across throttled repeats). */
  readonly breachedAt: Date | null;
}

/** Is the value currently on the alerting side of the threshold line? */
function isOverLine(type: ThresholdMonitorType, value: number, threshold: number): boolean {
  // count_below alerts when the queue drains too low; the other two alert when
  // it (or the aged-item count) climbs too high.
  return type === 'count_below' ? value < threshold : value > threshold;
}

/**
 * Has the value cleared the recovery band? With an explicit `recoveryValue` this
 * is the hysteresis edge (crossed strictly back past it); with `null` the band
 * collapses to the threshold and "clear" just means "no longer over the line".
 */
function isCleared(def: ViewMonitorDef, type: ThresholdMonitorType, value: number): boolean {
  if (def.recoveryValue == null) {
    return !isOverLine(type, value, def.thresholdValue);
  }
  // Mirror image of isOverLine: count_below recovers by climbing above the
  // recovery edge; the others recover by dropping below it.
  return type === 'count_below' ? value > def.recoveryValue : value < def.recoveryValue;
}

/** Has enough time passed since the last fire to allow a throttled repeat? */
function cooldownElapsed(def: ViewMonitorDef, lastFiredAt: Date | null, now: Date): boolean {
  if (def.cooldownMs == null) return false; // no cooldown ⇒ no repeats, ever
  if (lastFiredAt == null) return true; // never fired ⇒ nothing to wait on
  return now.getTime() - lastFiredAt.getTime() >= def.cooldownMs;
}

/**
 * Evaluate one monitor against a freshly-computed value.
 *
 * @throws if `def.thresholdType` is `scheduled_digest` — digests are compiled on
 *   a cadence, not evaluated as thresholds, and must be routed elsewhere.
 */
export function evaluateViewMonitor(
  def: ViewMonitorDef,
  state: ViewMonitorRuntime,
  currentValue: number,
  now: Date,
): EvaluateResult {
  if (def.thresholdType === 'scheduled_digest') {
    throw new Error(
      'evaluateViewMonitor: scheduled_digest is cadence-driven, not a threshold — route it to the digest leg, not the evaluator.',
    );
  }
  const type: ThresholdMonitorType = def.thresholdType;
  const over = isOverLine(type, currentValue, def.thresholdValue);

  if (state.state === 'armed') {
    // Edge: only a fresh crossing fires. The very first breach always fires
    // (nothing to throttle against yet).
    if (over) {
      return { fire: 'breach', nextState: 'breached', breachedAt: now };
    }
    return { nextState: 'armed', breachedAt: null };
  }

  // state.state === 'breached'
  if (isCleared(def, type, currentValue)) {
    // The value crossed back past the recovery band — the all-clear.
    return { fire: 'recovery', nextState: 'armed', breachedAt: null };
  }

  // Still breached (over the line, or sitting in the hysteresis dead-band).
  // A throttled REPEAT fires only when the value is genuinely still over the
  // line AND the cooldown has elapsed since the last fire; the breach episode
  // (breachedAt) continues unchanged so it reads as one episode, not a new one.
  if (over && cooldownElapsed(def, state.lastFiredAt, now)) {
    return { fire: 'breach', nextState: 'breached', breachedAt: state.breachedAt };
  }

  // Silent: cooldown not elapsed, no cooldown configured, or in the dead-band.
  return { nextState: 'breached', breachedAt: state.breachedAt };
}
