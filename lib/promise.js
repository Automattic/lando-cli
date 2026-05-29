'use strict';

/**
 * Extends [bluebird](http://bluebirdjs.com/docs/api-reference.html)
 * so that our promises have some retry functionality.
 * All functionality should be the same as bluebird except where indicated
 * below.
 * Note that bluebird currently wants you to use scoped prototypes to extend
 * it rather than the normal extend syntax so that is why this is using the "old"
 * way.
 * @member
 * @alias lando.Promise
 * @see http://bluebirdjs.com/docs/api-reference.html
 * @see https://github.com/petkaantonov/bluebird/issues/1397
 */
// eslint-disable-next-line no-redeclare
const Promise = require('bluebird');

// Use long stack traces.
Promise.config({longStackTraces: true, cancellation: true});

/**
 * Retries a function until it resolves or the retry limit is exhausted.
 * @param {function(number): Promise} fn Function to retry.
 * @param {object} [opts] Retry options.
 * @param {number} [opts.max] Maximum retry attempts.
 * @param {number} [opts.backoff] Retry delay multiplier in milliseconds.
 * @returns {Promise} Promise resolving to the callback result.
 */
const retry = (fn, {max = 5, backoff = 500} = {}) => Promise.resolve().then(() => {
  const rec = counter => Promise.try(() => fn(counter).catch(err => {
    if (counter <= max) {
      return Promise.delay(backoff * counter).then(() => rec(counter + 1));
    } else {
      return Promise.reject(err);
    }
  }));

  // Init recursive function.
  return rec(1);
});

/**
 * Adds a retry helper to the Promise constructor.
 * @type {function(function(number): Promise, object=): Promise}
 */
Promise.retry = retry;

/**
 * Adds a retry method to all Promise instances.
 * @since 3.0.0
 * @alias lando.Promise.retry
 * @param {function(number): Promise} fn The function to retry.
 * @param {object} [opts] Options to specify how retry works.
 * @param {number} [opts.max] The amount of times to retry.
 * @param {number} [opts.backoff] The amount to wait between retries in milliseconds and cumulative.
 * @returns {Promise} A Promise.
 * @example
 * // And then retry 25 times until we've connected, increase delay between retries by 1 second
 * Promise.retry(someFunction, {max: 25, backoff: 1000});
 */
// eslint-disable-next-line no-extend-native
Promise.prototype.retry = retry;

// Export the promise object
module.exports = Promise;
