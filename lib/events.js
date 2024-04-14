'use strict';

// Modules.
const {EventEmitter} = require('events');
const Log = require('./logger');
const Promise = require('./promise');

/**
 * @typedef {Object} Listener
 * @property {string} name The name of the event
 * @property {number} priority The priority the event should run in.
 * @property {Function} fn The function to call. Should get the args specified in the corresponding `emit` declaration.
 */

/**
 * Creates a new Events instance.
 *
 * @property {Log} log The log instance.
 * @property {Listener[]} _listeners The listeners for this event emitter.
 */
class AsyncEvents extends EventEmitter {
  constructor(log = new Log()) {
    // Get the event emitter stuffs
    super();
    // Set things
    this.log = log;
    this._listeners = [];
  };

  /**
   * Our overridden event on method.
   *
   * This optionally allows a priority to be specified. Lower priorities run first.
   *
   * @since 3.0.0
   * @alias lando.events.on
   * @param {string} name The name of the event
   * @param {number|Function} [priority] If a number, the priority the event should run in; if a function, the function to call.
   * @param {Function} [fn] The function to call. Should get the args specified in the corresponding `emit` declaration.
   * @return {this}
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
  };

  /**
   * Reimplements event emit method.
   *
   * This makes events blocking and promisified.
   *
   * @since 3.0.0
   * @alias lando.events.emit
   * @param {string} name The name of the event
   * @param {...any} args Options args to pass.
   * @return {Promise<boolean>} A Promise
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
      // Clone function arguments.
      const fnArgs = [...args];
      // Apply function that calls the listener function and returns a promise.
      return fn(...fnArgs);
    })

    // Make sure to wait for all mappings.
    .all()

    // Return true if event had listeners just like the original emit function.
    .return(!!fns.length);
  };
};

// Set our maxListeners to something more reasonable for lando
AsyncEvents.prototype.setMaxListeners(64);

module.exports = AsyncEvents;
