'use strict';

/**
 * Builds the warning shown when the proxy cannot start.
 * @param {string} message Failure detail.
 * @returns {object} Warning payload.
 */
exports.cannotStartProxyWarning = message => ({
  title: 'Lando was not able to start the proxy',
  detail: [
    `${message}`,
    'The proxy has been disabled for now so you can continue to work.',
    'Check out the docs below, resolve your issue and build this app',
  ],
  url: 'https://docs.lando.dev/config/proxy.html',
});

/**
 * Builds the warning shown when a proxy route targets an unknown service.
 * @param {string} service Service name.
 * @returns {object} Warning payload.
 */
exports.unknownServiceWarning = service => ({
  title: `Proxying to unknown service "${service}"!`,
  detail: [
    `${service} is a service that does not exist in your app!!!`,
    'This means we have not been able to set up your proxy route',
    'We recommend running the below command to see the services for this app',
  ],
  command: `lando info`,
});
