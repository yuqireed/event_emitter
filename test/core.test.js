import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Emitter } from '../src/index.js';

// Happy path: on then emit delivers the payload.
test('on + emit delivers payload to handler', () => {
  const e = new Emitter();
  let received;
  e.on('tick', (p) => { received = p; });
  e.emit('tick', 42);
  assert.equal(received, 42);
});

// emit returns true when handlers ran, false when none were registered.
test('emit returns a boolean indicating whether handlers ran', () => {
  const e = new Emitter();
  assert.equal(e.emit('nope', null), false);
  e.on('yep', () => {});
  assert.equal(e.emit('yep', null), true);
});

// Handlers fire in registration order. This is the contract emit relies on
// for the snapshot semantics tested below.
test('handlers fire in registration order', () => {
  const e = new Emitter();
  const order = [];
  e.on('e', () => order.push(1));
  e.on('e', () => order.push(2));
  e.on('e', () => order.push(3));
  e.emit('e');
  assert.deepEqual(order, [1, 2, 3]);
});

// once fires exactly once and not again.
test('once fires only on the first emit', () => {
  const e = new Emitter();
  let calls = 0;
  e.once('boot', () => { calls += 1; });
  e.emit('boot');
  e.emit('boot');
  e.emit('boot');
  assert.equal(calls, 1);
});

// once returns a disposer; calling it before the first emit means the handler
// never fires.
test('once disposer prevents the handler from firing', () => {
  const e = new Emitter();
  let calls = 0;
  const dispose = e.once('boot', () => { calls += 1; });
  dispose();
  e.emit('boot');
  assert.equal(calls, 0);
});

// off removes by identity of the original handler. Calling off with a
// different reference removes nothing.
test('off matches by handler identity', () => {
  const e = new Emitter();
  let calls = 0;
  const h = () => { calls += 1; };
  e.on('e', h);
  // A different function object must not match.
  assert.equal(e.off('e', () => {}), false);
  assert.equal(e.off('e', h), true);
  e.emit('e');
  assert.equal(calls, 0);
});

// Adding the same reference twice means two bindings; one off removes one.
test('duplicate registrations each require their own off', () => {
  const e = new Emitter();
  let calls = 0;
  const h = () => { calls += 1; };
  e.on('e', h);
  e.on('e', h);
  e.off('e', h);
  e.emit('e');
  assert.equal(calls, 1);
});

// A once handler can be removed with off before it fires, matching against
// the original user-supplied function rather than the internal wrapper.
test('off removes a once-registered handler before it fires', () => {
  const e = new Emitter();
  let calls = 0;
  const h = () => { calls += 1; };
  e.once('e', h);
  assert.equal(e.off('e', h), true);
  e.emit('e');
  assert.equal(calls, 0);
});

// The on disposer removes its exact binding and is idempotent.
test('on disposer removes the binding and is idempotent', () => {
  const e = new Emitter();
  let calls = 0;
  const dispose = e.on('e', () => { calls += 1; });
  dispose();
  dispose(); // second call is a no-op
  e.emit('e');
  assert.equal(calls, 0);
});

// Snapshot semantics: a handler that removes itself mid-emit still completes
// for the current dispatch and does not fire on the next one.
test('self-removal during emit completes the current dispatch', () => {
  const e = new Emitter();
  let calls = 0;
  let dispose;
  dispose = e.on('e', () => {
    calls += 1;
    dispose();
  });
  e.emit('e');
  e.emit('e');
  assert.equal(calls, 1);
});

// Snapshot semantics: handlers added during dispatch do not fire for the
// current emit, only for the next.
test('handlers added during dispatch fire on the next emit only', () => {
  const e = new Emitter();
  const order = [];
  e.on('e', () => {
    order.push('first');
    e.on('e', () => order.push('late'));
  });
  e.emit('e');
  e.emit('e');
  assert.deepEqual(order, ['first', 'first', 'late']);
});

// A once handler that throws is still removed before the throw, so a
// subsequent emit does not re-invoke it. The error propagates to the caller
// of emit, which is the documented behaviour (no per-handler swallowing).
test('once removes itself before invoking the handler', () => {
  const e = new Emitter();
  const boom = () => { throw new Error('boom'); };
  e.once('e', boom);
  assert.throws(() => e.emit('e'), /boom/);
  // Second emit must not re-run the once handler.
  assert.equal(e.emit('e'), false);
});

// Argument validation: non-string or empty event names are rejected at the
// boundary rather than silently mishandled inside.
test('rejects non-string and empty event names', () => {
  const e = new Emitter();
  assert.throws(() => e.on('', () => {}), TypeError);
  assert.throws(() => e.on(123, () => {}), TypeError);
  assert.throws(() => e.once('', () => {}), TypeError);
  assert.throws(() => e.off('', () => {}), TypeError);
  assert.throws(() => e.emit(''), TypeError);
});

// Argument validation: non-function handlers are rejected.
test('rejects non-function handlers', () => {
  const e = new Emitter();
  assert.throws(() => e.on('e', null), TypeError);
  assert.throws(() => e.on('e', 'not a fn'), TypeError);
  assert.throws(() => e.off('e', null), TypeError);
});

// Different event names are independent: emitting one does not trigger the
// other's handlers.
test('event names are isolated', () => {
  const e = new Emitter();
  let aCalls = 0;
  let bCalls = 0;
  e.on('a', () => { aCalls += 1; });
  e.on('b', () => { bCalls += 1; });
  e.emit('a');
  assert.equal(aCalls, 1);
  assert.equal(bCalls, 0);
});

// Payload is passed through unchanged, including object payloads.
test('object payloads pass through by reference', () => {
  const e = new Emitter();
  const payload = { id: 7, nested: { ok: true } };
  let received;
  e.on('change', (p) => { received = p; });
  e.emit('change', payload);
  assert.equal(received, payload);
});
