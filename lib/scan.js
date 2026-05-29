'use strict';

// Modules
const _ = require('lodash');
const http = require('http');
const https = require('https');
const Log = require('./logger');
// eslint-disable-next-line no-redeclare
const Promise = require('./promise');

/**
 * Loads an axios client configured for URL scanning.
 * This is loaded lazily so tests can stub axios before it is cached.
 * @returns {object} Axios client instance.
 */
const requestClient = () => {
  const axios = require('axios');
  // @todo: is it ok to turn redirects off here?
  // if we don't we get an error every time http tries to redirect to https
  return axios.create({
    maxRedirects: 0,
    httpsAgent: new https.Agent({rejectUnauthorized: false, family: 4}),
    httpAgent: new http.Agent({family: 4}),
  });
};

// We make this module into a function so we can pass in a logger
module.exports = (log = new Log()) => {
  /**
   * Builds a URL scan result and logs the outcome.
   * @param {string} url Scanned URL.
   * @param {boolean} [status] Whether the URL is considered available.
   * @param {string} [color] CLI color hint.
   * @param {string} [message] Log message template.
   * @returns {{url: string, status: boolean, color: string}} Scan result.
   */
  const setStatus = (url, status = true, color = 'green', message = '%s is ready') => {
    log.debug(message, url);
    return {url, status, color};
  };

  /**
   * @param {string} url URL to mark as available.
   * @returns {{url: string, status: boolean, color: string}} Scan result.
   */
  const setGood = url => setStatus(url);
  /**
   * @param {string} url URL to mark as reachable with caveats.
   * @returns {{url: string, status: boolean, color: string}} Scan result.
   */
  const setOK = url => setStatus(url, true, 'yellow');
  /**
   * @param {string} url URL to mark as unavailable.
   * @returns {{url: string, status: boolean, color: string}} Scan result.
   */
  const setBad = url => setStatus(url, false, 'red', '%s not currently accessible');

  /**
   * Scans URLs to determine if they are up or down.
   * @since 3.0.0
   * @alias lando.scanUrls
   * @param {string[]} urls An array of urls like `https://mysite.lndo.site` or `https://localhost:34223`
   * @param {object} [opts] Options to configure the scan.
   * @param {number} [opts.max] The amount of times to retry accessing each URL.
   * @param {number[]} [opts.waitCodes] The HTTP codes to prompt a retry.
   * @param {number} [opts.timeout] The timeout for each request in milliseconds.
   * @returns {Array<{url: string, status: boolean, color: string}>} URL scan results.
   * @example
   * // Scan URLs and print results
   * return lando.utils.scanUrls(['http://localhost', 'https://localhost'])
   * .then(function(results) {
   *   console.log(results);
   * });
   */
  const scanUrls = (urls, {max = 7, waitCodes = [400, 502, 404], timeout = 15000} = {}) => {
    log.verbose('about to scan urls');
    log.debug('scanning data', {urls, max, waitCodes});

    // Ping the sites for awhile to determine if they are g2g
    return Promise.map(urls, url => Promise.retry(() => {
      // Log the attempt
      log.debug('checking to see if %s is ready.', url);
      // If URL contains a wildcard then immediately set fulfill with yellow status
      if (_.includes(url, '*')) return Promise.resolve(setOK(url));
      // Send REST request.
      return requestClient().get(url, {timeout})
      // Return good responses
          .then(response => {
            log.debug('scan response %s received', url, {
              status: response?.status,
              headers: response?.headers,
            });
            return setGood(url);
          })
      // Retry waitcodes or fail right away if we have a network issue
          .catch(error => {
            const extraInformation = {
              code: error.code,
              message: error.message,
            };
            if (error.response) {
              extraInformation.status = error.response.status;
              extraInformation.headers = error.response.headers;
            }
            log.debug('scan failed for %s', url, extraInformation);

            if (error.code === 'ENOTFOUND') {
              log.debug('ENOTFOUND for %s, setting to bad', url);
              return Promise.resolve(setBad(url));
            }

            if (!error.response) {
              log.debug('No response for %s. Setting to bad', url);
              return Promise.reject(setBad(url));
            }

            if (_.includes(waitCodes, error.response.status)) {
              log.debug('Response for %s, returned http code we should retry for. Setting to bad', url);
              return Promise.reject(setBad(url));
            }

            log.debug('Unkown failure for %s. Setting to good', url);
            return setGood(url);
          });
    }, {max})

    // Catch any error and return an inaccessible url
        .catch(err => setBad(url)))

    // Log and then return scan results
        .then(results => {
          log.verbose('scan completed.');
          log.debug('scan results.', results);
          return results;
        });
  };

  // Return
  return scanUrls;
};
