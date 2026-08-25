/**
 * putaway-camera.test.ts — DOM-free unit coverage for the camera half of the
 * input truth layer.
 *
 * House Deps pattern (domain-unit-test): scripted fakes stand in for the
 * detector, getUserMedia, the clock and the scheduler; every collaborator call
 * is captured, and the assertions check BOTH what the caller sees (onScan
 * order, thrown error types) and what was threaded into the seams (the
 * environment-facing constraint, tracks released exactly once). The debounce
 * contract, the idempotent stop, and the unsupported path are the invariants
 * under test.
 *
 * Run: npx tsx --test src/lib/scan/putaway-camera.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CameraDeniedError,
  CameraUnsupportedError,
  DEFAULT_SCAN_INTERVAL_MS,
  REPEAT_QUIET_MS,
  isBarcodeCameraSupported,
  startBarcodeCamera,
  type CameraVideoSurface,
  type MediaTrackLike,
  type PutawayCameraDeps,
} from './putaway-camera';

/** One scripted frame: values the detector "sees", or a per-frame blow-up. */
type Frame = string[] | 'detector-error';

interface Captured {
  constraints: unknown[];
  intervalMs: number | null;
  cancelCalls: number;
  trackStops: number[];
  scans: string[];
  plays: number;
}

interface FakeOptions {
  /** Reject getUserMedia with this error instead of granting a stream. */
  denyWith?: Error;
}

function fakes(opts: FakeOptions = {}) {
  const cap: Captured = {
    constraints: [],
    intervalMs: null,
    cancelCalls: 0,
    trackStops: [0, 0],
    scans: [],
    plays: 0,
  };

  const frames: Frame[] = [];
  let clock = 0;
  let scheduled: (() => void | Promise<void>) | null = null;

  const tracks: MediaTrackLike[] = [0, 1].map((i) => ({
    stop: () => {
      cap.trackStops[i] += 1;
    },
  }));

  const video: CameraVideoSurface = {
    srcObject: null,
    play: async () => {
      cap.plays += 1;
    },
  };

  const deps: PutawayCameraDeps = {
    getUserMedia: async (constraints) => {
      cap.constraints.push(constraints);
      if (opts.denyWith) throw opts.denyWith;
      return { getTracks: () => tracks };
    },
    createDetector: () => ({
      detect: async () => {
        const frame = frames.shift() ?? [];
        if (frame === 'detector-error') throw new Error('one bad frame');
        return frame.map((rawValue) => ({ rawValue }));
      },
    }),
    now: () => clock,
    schedule: (tick, intervalMs) => {
      cap.intervalMs = intervalMs;
      scheduled = tick;
      return () => {
        cap.cancelCalls += 1;
      };
    },
  };

  /** Show the detector one frame at time `at` (ms) and let the tick finish. */
  const tickAt = async (at: number, frame: Frame): Promise<void> => {
    assert.ok(scheduled, 'scan loop was scheduled');
    clock = at;
    frames.push(frame);
    await scheduled();
  };

  const onScan = (value: string) => cap.scans.push(value);

  return { deps, cap, video, onScan, tickAt };
}

test('unsupported path: node has no window, so support is false and default start rejects', async () => {
  assert.equal(isBarcodeCameraSupported(), false);
  await assert.rejects(
    // Default deps on purpose: the real seams must refuse cleanly under SSR.
    startBarcodeCamera({ srcObject: null, play: async () => {} }, () => {}),
    CameraUnsupportedError,
  );
});

test('permission denial becomes a typed CameraDeniedError carrying the cause', async () => {
  const denied = Object.assign(new Error('user said no'), { name: 'NotAllowedError' });
  const { deps, cap, video, onScan } = fakes({ denyWith: denied });

  await assert.rejects(
    startBarcodeCamera(video, onScan, {}, deps),
    (err: unknown) => {
      assert.ok(err instanceof CameraDeniedError);
      assert.equal(err.cause, denied);
      return true;
    },
  );
  assert.equal(cap.trackStops[0], 0); // no stream was ever opened
});

test('a non-permission getUserMedia failure is rethrown untouched', async () => {
  const hardware = Object.assign(new Error('no camera'), { name: 'NotFoundError' });
  const { deps, video, onScan } = fakes({ denyWith: hardware });

  await assert.rejects(startBarcodeCamera(video, onScan, {}, deps), (err: unknown) => {
    assert.equal(err, hardware);
    return true;
  });
});

test('start asks for the environment camera, plays the video, defaults the interval', async () => {
  const { deps, cap, video, onScan } = fakes();
  const stop = await startBarcodeCamera(video, onScan, {}, deps);

  assert.deepEqual(cap.constraints, [
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
  ]);
  assert.equal(cap.plays, 1);
  assert.equal(cap.intervalMs, DEFAULT_SCAN_INTERVAL_MS);
  assert.notEqual(video.srcObject, null); // stream attached to the surface
  stop();
});

test('debounce: once per distinct value; repeats re-fire only after the quiet gap', async () => {
  const { deps, cap, video, onScan, tickAt } = fakes();
  const stop = await startBarcodeCamera(video, onScan, {}, deps);

  await tickAt(0, ['LOC-A']); // first sight → fires
  await tickAt(300, ['LOC-A']); // still in view → suppressed
  await tickAt(600, []); // empty frame changes nothing
  await tickAt(900, ['LOC-B']); // different value → fires immediately
  await tickAt(1200, ['LOC-A']); // A again: distinct from last (B) → fires
  assert.deepEqual(cap.scans, ['LOC-A', 'LOC-B', 'LOC-A']);

  // Continuous sight REFRESHES the quiet clock: sightings 800ms apart never
  // re-fire, even once the first sighting is >1.5s in the past.
  await tickAt(2000, ['LOC-A']);
  await tickAt(2800, ['LOC-A']);
  assert.deepEqual(cap.scans, ['LOC-A', 'LOC-B', 'LOC-A']);

  // A full quiet gap since the LAST sighting → the same label is a new scan.
  await tickAt(2800 + REPEAT_QUIET_MS, ['LOC-A']);
  assert.deepEqual(cap.scans, ['LOC-A', 'LOC-B', 'LOC-A', 'LOC-A']);
  stop();
});

test('a detector error on one frame is swallowed and scanning continues', async () => {
  const { deps, cap, video, onScan, tickAt } = fakes();
  const stop = await startBarcodeCamera(video, onScan, {}, deps);

  await tickAt(0, 'detector-error');
  await tickAt(300, ['LOC-C']);
  assert.deepEqual(cap.scans, ['LOC-C']);
  stop();
});

test('empty rawValue detections are ignored', async () => {
  const { deps, cap, video, onScan, tickAt } = fakes();
  const stop = await startBarcodeCamera(video, onScan, {}, deps);

  await tickAt(0, ['', 'LOC-D']); // first non-empty value wins
  await tickAt(300, ['']);
  assert.deepEqual(cap.scans, ['LOC-D']);
  stop();
});

test('stop is idempotent: cancels once, releases every track once, detaches the stream', async () => {
  const { deps, cap, video, onScan, tickAt } = fakes();
  const stop = await startBarcodeCamera(video, onScan, {}, deps);
  await tickAt(0, ['LOC-E']);

  stop();
  stop(); // second call must be a no-op
  assert.equal(cap.cancelCalls, 1);
  assert.deepEqual(cap.trackStops, [1, 1]); // EVERY track, exactly once
  assert.equal(video.srcObject, null);

  // A straggling tick after stop must never scan.
  await tickAt(300, ['LOC-F']);
  assert.deepEqual(cap.scans, ['LOC-E']);
});
