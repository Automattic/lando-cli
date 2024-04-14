'use strict';

// Modules
const Log = require('./logger');

module.exports = class ErrorHandler {
  constructor(log = new Log()) {
    this.log = log;
  };

  /**
   * Returns the lando options
   *
   * This means all the options passed in before the `--` flag.
   *
   * @since 3.0.0
   * @alias lando.error.handle
   * @param {Object} error Error object
   * @return {Promise<number>} the error code
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
