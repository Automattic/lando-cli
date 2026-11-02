'use strict';

const Modem = require('docker-modem');
// eslint-disable-next-line no-redeclare
const Promise = require('./promise');

/**
 * Validates connection options before deferring Docker API client creation.
 * @param {object} [opts] Docker connection options.
 * @param {typeof Promise} [promise] Promise implementation for Docker operations.
 * @returns {object} Options with an initialized modem for Dockerode to reuse.
 */
module.exports = (opts = {}, promise = Promise) => {
  opts.Promise = promise;
  // Dockerode drops its options object when only the Promise override is set.
  const options = opts.Promise && Object.keys(opts).length === 1 ? undefined : opts;
  const modem = new Modem(options);
  modem.Promise = promise;
  return {...opts, modem};
};
