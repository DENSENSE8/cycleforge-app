import assert from 'node:assert/strict';
import test from 'node:test';
import { createSingleFlight } from './single-flight';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('concurrent callers for one key share a single run', async () => {
  const flight = createSingleFlight<number>();
  const gate = deferred<number>();
  let runs = 0;
  const work = () => {
    runs += 1;
    return gate.promise;
  };
  const a = flight.run('k', work);
  const b = flight.run('k', work);
  gate.resolve(42);
  assert.deepEqual(await Promise.all([a, b]), [42, 42]);
  assert.equal(runs, 1);
});

test('different keys run independently', async () => {
  const flight = createSingleFlight<string>();
  const seen: string[] = [];
  const [a, b] = await Promise.all([
    flight.run('a', async () => (seen.push('a'), 'A')),
    flight.run('b', async () => (seen.push('b'), 'B')),
  ]);
  assert.deepEqual([a, b], ['A', 'B']);
  assert.deepEqual(seen.sort(), ['a', 'b']);
});

test('a settled run is not reused: the next caller starts fresh', async () => {
  const flight = createSingleFlight<number>();
  let runs = 0;
  assert.equal(await flight.run('k', async () => ++runs), 1);
  assert.equal(await flight.run('k', async () => ++runs), 2);
});

test('a failure rejects every joined caller and does not poison the key', async () => {
  const flight = createSingleFlight<number>();
  const gate = deferred<number>();
  const a = flight.run('k', () => gate.promise);
  const b = flight.run('k', () => Promise.resolve(99));
  gate.reject(new Error('db down'));
  await assert.rejects(a, /db down/);
  await assert.rejects(b, /db down/);
  assert.equal(await flight.run('k', async () => 7), 7);
});

test('a synchronous throw inside work cannot leave a stale entry', async () => {
  const flight = createSingleFlight<number>();
  await assert.rejects(
    flight.run('k', () => {
      throw new Error('bad input');
    }),
    /bad input/,
  );
  assert.equal(await flight.run('k', async () => 5), 5);
});
