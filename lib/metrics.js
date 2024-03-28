'use strict';

const Promise = require('./promise');

/*
 * Creates a new Metrics thing.
 */
module.exports = class Metrics {
  report() {
    return Promise.resolve();
  };
};
