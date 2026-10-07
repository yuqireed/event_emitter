/**
 * Public entry point for the event emitter.
 *
 * Re-exports the Emitter class and its supporting types so consumers can write
 *   import { Emitter } from '@reeds/emitter';
 * and get a single, deliberate surface area. We re-export the type aliases too
 * so user code can annotate handlers without reaching into the internals.
 */
import { Emitter } from './core.js';

export { Emitter };

/**
 * Listener type. Handlers receive the typed payload of their event and nothing
 * else. We deliberately do not pass an Event object: the whole point of a tiny
 * emitter is to stay out of the way, and an Event wrapper would force every
 * listener to destructure a field they rarely need.
 */
export {};
