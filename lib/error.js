'use strict';

// Modules
const Log = require('./logger');

/**
 * Error handler wrapper for logging and exit-code resolution.
 */
module.exports = class ErrorHandler {
  /**
   * @param {Log} [log] Logger instance.
   */
  constructor(log = new Log()) {
    /** @type {Log} */
    this.log = log;
  };

  /**
   * Handles a runtime error and resolves the exit code to use.
   * @since 3.0.0
   * @alias lando.error.handle
   * @param {object} [error] Error payload.
   * @param {string} [error.message] Error message to log.
   * @param {string} [error.stack] Full error stack.
   * @param {number} [error.code] Process exit code.
   * @param {boolean} [error.hide] Whether logging should be suppressed.
   * @param {number} [error.verbose] Verbosity level.
   * @returns {Promise<number>} Promise resolving to the error code.
   * @todo make this static and then fix all call sites
   */
  handle({message, stack, code = 1, hide = false, verbose = 0} = {}) {
    // Log error or not
    if (!hide) {
      if (verbose > 0) this.log.error(stack);
      else this.log.error(message);
    }
    // Report error if we can
    return Promise.resolve(code);
  };
};
