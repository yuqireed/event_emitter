/**
 * A tiny, fully typed event emitter.
 *
 * Design decisions, stated plainly so the tests and README stay honest:
 *
 * 1. on/once/off/emit are the only methods. There is no removeAllListeners,
 *   no listenerCount, no eventNames. Adding them is easy; deciding their
 *   exact behaviour under symbol-vs-string keys, inheritance, and
 *   once-registered handlers is where libraries get bloated and contradictory.
 *   This one stays small.
 *
 * 2. `once` registers a wrapper that removes itself and then calls the
 *   original handler. We do NOT splice the listener list during dispatch:
 *   mid-emit mutation of the array breaks iteration in ways that are
 *   impossible to reason about portably. Instead, `off` swaps the array for a
 *   filtered copy, and `once` swaps it again after the wrapper runs. This
 *   means a handler removed during its own emit still fires for the current
 *   dispatch (it was already invoked or is already past in the snapshot) but
 *   will not fire next time. That is the single behaviour we test.
 *
 * 3. `off` removes the FIRST handler whose identity (`===`) matches the
 *   argument. If the same function reference was added twice, one call to
 *   `off` removes one binding. This matches the DOM addEventListener /
 *   removeEventListener contract, which is the one developers already carry
 *   in their head.
 *
 * 4. `off` with no handler argument removes nothing. We could have made it
 *   clear all listeners for an event, but that introduces a second meaning to
 *   the same method and the README would have to disambiguate. If you want
 *   bulk removal, call off per handler — the list is short.
 *
 * 5. Returning `false` from a handler does NOT stop propagation. There is no
 *   propagation to stop. Stopping would couple this emitter to a control-flow
 *   convention it has no other reason to adopt.
 */

/**
 * @template {string} EventMap
 * @typedef {(event: EventMap, handler: (payload: any) => void) => () => void} SubscribeFn
 */

/**
 * Internal record for a registered listener.
 * @typedef {{ original: Function, call: Function }} Listener
 */

export class Emitter {
  constructor() {
    /**
     * Map of event name -> array of listener records.
     *
     * We store records (original + call) rather than bare functions because
     * `once` needs to remember the user-supplied reference so `off` can
     * match against it even though the array holds the wrapper. Without this,
     * a user calling `off(myHandler)` after `once(myHandler)` would silently
     * fail to remove anything.
     */
    // Non-null assertion: initialized synchronously in the constructor.
    /** @type {Record<string, Array<Listener>>} */
    this._listeners = Object.create(null);
  }

  /**
   * Register a handler for an event.
   * @param {string} event
   * @param {(payload: any) => void} handler
   * @returns {() => void} A disposer that, when called, removes this exact
   *   binding. Calling it more than once is a no-op after the first call.
   */
  on(event, handler) {
    if (typeof event !== 'string' || event.length === 0) {
      throw new TypeError('Emitter.on: event name must be a non-empty string');
    }
    if (typeof handler !== 'function') {
      throw new TypeError('Emitter.on: handler must be a function');
    }

    /** @type {Listener} */
    const record = { original: handler, call: handler, disposed: false };
    const list = this._listeners[event];
    if (list === undefined) {
      this._listeners[event] = [record];
    } else {
      list.push(record);
    }

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this._remove(event, record);
    };
  }

  /**
   * Register a handler that fires at most once.
   *
   * The wrapper removes itself from the list and THEN invokes the original.
   * We remove before calling so a handler that throws still gets cleaned up;
   * the alternative (call then remove) would leak the wrapper on throw and
   * force users to wrap every `once` handler in try/finally.
   *
   * @param {string} event
   * @param {(payload: any) => void} handler
   * @returns {() => void} A disposer; works even if the handler never fires.
   */
  once(event, handler) {
    if (typeof event !== 'string' || event.length === 0) {
      throw new TypeError('Emitter.once: event name must be a non-empty string');
    }
    if (typeof handler !== 'function') {
      throw new TypeError('Emitter.once: handler must be a function');
    }

    let disposed = false;
    const wrapper = (payload) => {
      // Remove first, so a throw in the handler does not leak the wrapper.
      this._remove(event, record);
      handler(payload);
    };

    /** @type {Listener} */
    const record = { original: handler, call: wrapper, disposed: false };
    const list = this._listeners[event];
    if (list === undefined) {
      this._listeners[event] = [record];
    } else {
      list.push(record);
    }

    return () => {
      if (disposed) return;
      disposed = true;
      this._remove(event, record);
    };
  }

  /**
   * Remove the first binding whose original handler matches `handler`.
   *
   * Matching is against the ORIGINAL reference the user passed to on/once, not
   * against the internal wrapper. This is why `once`-registered handlers can
   * be removed before they fire.
   *
   * @param {string} event
   * @param {(payload: any) => void} handler
   * @returns {boolean} true if a binding was removed, false otherwise.
   */
  off(event, handler) {
    if (typeof event !== 'string' || event.length === 0) {
      throw new TypeError('Emitter.off: event name must be a non-empty string');
    }
    if (typeof handler !== 'function') {
      throw new TypeError('Emitter.off: handler must be a function');
    }

    const list = this._listeners[event];
    if (list === undefined || list.length === 0) {
      return false;
    }

    for (let i = 0; i < list.length; i++) {
      if (list[i].original === handler) {
        // Swap to a filtered copy rather than splice-in-place. The emit loop
        // holds no reference to the array after it snapshots it, but a copy
        // is still safer and equally cheap for the short lists this library
        // is meant for.
        this._listeners[event] = list
          .slice(0, i)
          .concat(list.slice(i + 1));
        return true;
      }
    }
    return false;
  }

  /**
   * Emit an event. Handlers run in registration order.
   *
   * We snapshot the listener array before iterating. This means handlers
   * added during dispatch do NOT fire for the current emit — only for the next
   * one. It also means a handler that removes itself (directly or via the
   * `once` wrapper) still completes for the current emit, because the
   * snapshot still holds the reference. We test exactly this.
   *
   * Errors thrown by handlers are allowed to propagate. There is no
   * try/catch around individual listeners because swallowing errors here
   * would hide bugs and force every consumer to opt back into the very
   * behaviour we'd be silently adding.
   *
   * @param {string} event
   * @param {any} [payload]
   * @returns {boolean} true if at least one handler ran, false otherwise.
   */
  emit(event, payload) {
    if (typeof event !== 'string' || event.length === 0) {
      throw new TypeError('Emitter.emit: event name must be a non-empty string');
    }

    const list = this._listeners[event];
    if (list === undefined || list.length === 0) {
      return false;
    }

    // Snapshot. Mutations during dispatch (off, once's self-removal, on
    // adding new handlers) operate on this._listeners[event], not this
    // local array, so iteration is stable.
    const snapshot = list.slice();
    for (let i = 0; i < snapshot.length; i++) {
      snapshot[i].call(payload);
    }
    return true;
  }

  /**
   * Internal removal used by on/once disposers and by off. Matches the record
   * by identity and rebuilds the array without it.
   *
   * @param {string} event
   * @param {Listener} record
   * @returns {void}
   */
  _remove(event, record) {
    const list = this._listeners[event];
    if (list === undefined) return;

    for (let i = 0; i < list.length; i++) {
      if (list[i] === record) {
        if (list.length === 1) {
          delete this._listeners[event];
        } else {
          this._listeners[event] = list
            .slice(0, i)
            .concat(list.slice(i + 1));
        }
        return;
      }
    }
  }
}
