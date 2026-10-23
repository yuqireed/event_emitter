# emitter

A tiny, zero-dependency event emitter for JavaScript ESM. `on`, `once`, `off`, `emit` — nothing else.

## Usage

```js
import { Emitter } from './src/index.js';

const e = new Emitter();

const dispose = e.on('change', (payload) => {
  console.log('changed:', payload);
});

e.emit('change', { value: 3 }); // logs: changed: { value: 3 }

dispose(); // removes this exact binding
e.emit('change', { value: 4 }); // no listeners, returns false

e.once('boot', () => console.log('booted'));
e.emit('boot'); // logs: booted
e.emit('boot'); // already removed, returns false
```

## Why this exists

I kept reaching for a full-featured emitter library to do five lines' worth of
work: register a handler, fire it, remove it. The popular options bundle
`listenerCount`, `eventNames`, `setMaxListeners`, and a dozen other methods
whose semantics under inheritance and symbol keys are a tar pit. This library
is the smallest thing that covers the common case and nothing else.

The trade-off: there is no `removeAllListeners` and no `eventNames`. If you
need to tear everything down, keep the disposers returned by `on`/`once` and
call them. The lists are short; this is fine.

## The awkward edge you will hit

`emit` snapshots the listener array before dispatch. A handler that removes
itself (directly or via `once`) still completes for the *current* emit but
will not fire next time. A handler added *during* dispatch does not fire for
the current emit — only for the next one. If you need "fire every handler
registered at any point during this dispatch," this is not the right library.

`off` matches by identity (`===`) against the function reference you passed
to `on` or `once`. If you register the same reference twice, one `off` removes
one binding. Anonymous functions passed inline to `on` cannot be removed by
`off` — use the disposer returned by `on` instead.

Errors thrown from handlers propagate out of `emit`. There is no per-listener
try/catch; swallowing errors silently would hide bugs. Wrap a handler in its
own try/catch if you want it to fail soft.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

## Limitations

Values are coerced to floats, so very large integers lose precision. If you need
exact integer aggregates over a window, this is the wrong tool.

