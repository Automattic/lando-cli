'use strict';

// Modules.
const {EventEmitter} = require('events');
const Log = require('./logger');
// eslint-disable-next-line no-redeclare
const Promise = require('./promise');

/**
 * @typedef {object} Listener
 * @property {string} name The event name.
 * @property {number} priority The priority the event should run in.
 * @property {function(...unknown): unknown} fn Listener callback.
 */

/**
 * Creates a new Events instance.
 * @property {Log} log The log instance.
 * @property {Listener[]} _listeners The listeners for this event emitter.
 */
class AsyncEvents extends EventEmitter {
  /**
  * @param {Log} [log] Logger instance.
   */
  constructor(log = new Log()) {
    // Get the event emitter stuffs
    super();
    // Set things
    /** @type {Log} */
    this.log = log;
    /** @type {Listener[]} */
    this._listeners = [];
  }

  /**
   * Our overridden event on method.
   * This optionally allows a priority to be specified. Lower priorities run first.
   * @since 3.0.0
   * @alias lando.events.on
   * @param {string} name The event name.
   * @param {number|function(...unknown): unknown} [priority] Priority value or listener callback.
   * @param {function(...unknown): unknown} [fn] Listener callback.
   * @returns {this} The event emitter instance.
   * @example
   * // Print out all our apps as they get instantiated and do it before other `post-instantiate-app` events
   * lando.events.on('post-instantiate-app', 1, app => {
   *   console.log(app);
   * });
   *
   * // Log a helpful message after an app is started, don't worry about whether it runs before or
   * // after other `post-start` events
   * return app.events.on('post-start', () => {
   *   lando.log.info('App %s started', app.name);
   * });
   */
  on(name, priority, fn) {
    // Handle no priority
    if (typeof fn === 'undefined' && typeof priority === 'function') {
      fn = priority;
      priority = 5;
    }
    // Store
    this._listeners.push({name, priority, fn});
    // Log
    this.log.silly('loading event %s priority %s', name, priority);
    // Call original on method.
    return super.on(name, fn);
  }

  /**
   * Reimplements event emit method.
   * This makes events blocking and promisified.
   * @since 3.0.0
   * @alias lando.events.emit
   * @param {string} name The event name.
   * @param {...unknown} args Additional arguments to pass.
   * @returns {Promise<boolean>} Promise resolving to whether any listeners ran.
   * @example
   * // Emits a global event with a config arg
   * return lando.events.emit('wolf359', config);
   *
   * // Emits an app event with a config arg
   * return app.events.emit('sector001', config);
   */
  emit(name, ...args) {
    const fns = this._listeners
        .filter(listener => listener.name === name)
        .sort((a, b) => a.priority - b.priority)
        .map(evnt => evnt.fn);

    // Log non engine events so we can keep things quiet
    if (!name.includes('-engine-')) {
      this.log.debug('emitting event %s', name);
      this.log.silly('event %s has %s listeners', name, fns.length);
    }

    // Make listener functions to a promise in series.
    return Promise.each(fns, fn => {
      // Apply function that calls the listener function and returns a promise.
      return fn(...args);
    })

    // Make sure to wait for all mappings.
        .all()

    // Return true if event had listeners just like the original emit function.
        .return(!!fns.length);
  }
}

// Set our maxListeners to something more reasonable for lando
AsyncEvents.prototype.setMaxListeners(128);

module.exports = AsyncEvents;
