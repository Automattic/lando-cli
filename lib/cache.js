'use strict';

// Modules
const {mkdirSync, unlinkSync} = require('node:fs');
const {readFileSync, writeFileSync} = require('jsonfile');
const Log = require('./logger');
const NodeCache = require('node-cache');
const {tmpdir} = require('node:os');
const {join} = require('node:path');

/**
 * Creates a new Cache instance.
 *
 * @property {Log} log A log instance
 * @property {string} cacheDir The directory to store cache files in
 */
module.exports = class Cache extends NodeCache {
  /**
   * @param {Object} [opts] Options to pass into the cache
   * @param {Log} [opts.log] A log instance
   * @param {string} [opts.cacheDir] The directory to store cache files in
   */
  constructor({log = new Log(), cacheDir = join(tmpdir(), '.cache')} = {}) {
    // Get the nodecache opts
    super();
    // Set some things
    this.log = log;
    this.cacheDir = cacheDir;
    // Ensure the cache dir exists
    mkdirSync(this.cacheDir, {recursive: true});
  };

  /**
   * Sets an item in the cache
   *
   * @since 3.0.0
   * @alias lando.cache.set
   * @param {string} key The name of the key to store the data with.
   * @param {any} data The data to store in the cache.
   * @param {Object} [opts] Options to pass into the cache
   * @param {boolean} [opts.persist=false] Whether this cache data should persist between processes. Eg in a file instead of memory
   * @param {number} [opts.ttl=0] Seconds the cache should live. 0 mean forever.
   * @example
   * // Add a string to the cache
   * lando.cache.set('mykey', 'mystring');
   *
   * // Add an object to persist in the file cache
   * lando.cache.set('mykey', data, {persist: true});
   *
   * // Add an object to the cache for five seconds
   * lando.cache.set('mykey', data, {ttl: 5});
   */
  set(key, data, {persist = false, ttl = 0} = {}) {
    // Unsafe cache key patterns
    const patterns = {
      controlRe: /[\x00-\x1f\x80-\x9f]/g, // NOSONAR
      illegalRe: /[/?<>\\*|":]/g, // NOSONAR
      reservedRe: /^\.+$/,
      windowsReservedRe: /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i,
      windowsTrailingRe: /[. ]+$/,
    };

    if (Object.values(patterns).some(pattern => pattern.test(key))) {
      throw new Error(`Invalid cache key: ${key}`);
    }

    // Try to set cache
    if (super.set(key, data, ttl)) {
      this.log.debug('Cached %j with key %s for %j', data, key, {persist, ttl});
    } else {
      this.log.debug('Failed to cache %j with key %s', data, key);
    }

    // And add to file if we have persistence
    if (persist) {
      writeFileSync(join(this.cacheDir, key), data);
    }
  };

  /**
   * Gets an item in the cache
   *
   * @since 3.0.0
   * @alias lando.cache.get
   * @param {string} key The name of the key to retrieve the data.
   * @return {any} The data stored in the cache if applicable.
   * @example
   * // Get the data stored with key mykey
   * const data = lando.cache.get('mykey');
   */
  get(key) {
    // Get from cache
    const memResult = super.get(key);

    // Return result if its in memcache
    if (memResult) {
      this.log.debug('Retrieved from memcache with key %s', key);
      return memResult;
    } else {
      try {
        this.log.debug('Trying to retrieve from file cache with key %s', key);
        return readFileSync(join(this.cacheDir, key));
      } catch (e) {
        this.log.debug('File cache miss with key %s', key);
      }
    }
  };

  /**
   * Manually remove an item from the cache.
   *
   * @since 3.0.0
   * @alias lando.cache.remove
   * @param {String} key The name of the key to remove the data.
   * @example
   * // Remove the data stored with key mykey
   * lando.cache.remove('mykey');
   */
  remove(key) {
    // Try to get cache
    if (super.del(key)) this.log.debug('Removed key %s from memcache.', key);
    else this.log.debug('Failed to remove key %s from memcache.', key);

    // Also remove file if applicable
    try {
      unlinkSync(join(this.cacheDir, key));
    } catch (e) {
      this.log.debug('No file cache with key %s', key);
    }
  };
};
