'use strict';

// Modules
const {Socket} = require('net');
const _ = require('lodash');
const hasher = require('object-hash');
const url = require('url');
// eslint-disable-next-line no-redeclare
const Promise = require('../../../lib/promise');

/**
 * Expands a proxy URL into the HTTP and optional HTTPS app-info URLs.
 * @param {object} url Parsed URL data.
 * @param {object} ports HTTP and HTTPS port mapping.
 * @param {boolean} [hasCerts] Whether HTTPS URLs should be emitted.
 * @returns {string[]} URLs for app info and scanning.
 */
const getInfoUrls = (url, ports, hasCerts = false) => {
  // Start with the default
  const urls = [`http://${url.host}${ports.http === '80' ? '' : `:${ports.http}`}${url.pathname}`];
  // Add https if we can
  if (hasCerts) {
    urls.push(`https://${url.host}${ports.https === '443' ? '' : `:${ports.https}`}${url.pathname}`);
  }
  // Return
  return urls;
};

/**
 * Finds ports unavailable for listening from a list of URLs.
 * We look for unavailable ports because of the way Lando interprets the results.
 * It will use the first port with `status === false` for the proxy. However, if looking for an available port,
 * the status of `false` will mean that we failed to connect to it, but that does not mean we can listen on it (e.g., because of ETIMEDOUT).
 * That is why we have to invert the meaning of the status.
 * @param {string[]} urls An array of URLs to scan for unavailable ports.
 * @returns {Promise<object[]>} Objects of the form {url, status}; `status === true` means the port is available.
 */
exports.findUnavailablePorts = urls => {
  return Promise.map(urls, (url => {
    const u = new URL(url);
    const port = +(u.port || (u.protocol === 'https:' ? '443' : '80'));

    /**
     * @type {() => {url: string, status: boolean}} resolve
     */
    return new Promise(resolve => {
      let isAvailable = false;
      const socket = new Socket();
      socket.setTimeout(3000);

      socket.on('connect', () => {
        isAvailable = true;
        socket.destroy();
      });

      socket.on('timeout', () => {
        isAvailable = true;
        socket.destroy();
      });

      socket.on('error', err => {
        if (!('code' in err) || err.code !== 'ECONNREFUSED') {
          isAvailable = true;
        }
        socket.destroy();
      });

      socket.on('close', () => {
        resolve({url, status: isAvailable});
      });

      socket.connect(port, u.hostname);
    });
  }));
};

/**
 * Resolves the first unavailable port reported by the scanner.
 * @param {function(string[], object): Promise} scanner Port scanner.
 * @param {string[]} [urls] URLs to inspect.
 * @returns {Promise} Promise resolving to the first matching port.
 */
exports.getFirstOpenPort = (scanner, urls = []) => scanner(urls, {max: 1, waitCodes: []})
    .filter(url => url.status === false)
    .map(port => _.last(port.url.split(':')))
    .then(ports => ports[0]);

/**
 * Computes which proxy protocols still need rescanning.
 * @param {object} current Current port mapping.
 * @param {object} last Previous port mapping.
 * @param {{http: boolean, https: boolean}} [status] Existing scan status.
 * @returns {{http: boolean, https: boolean}} Updated scan status.
 */
exports.needsProtocolScan = (current, last, status = {http: true, https: true}) => {
  if (!last) return status;
  if (current.http === last.http) status.http = false;
  if (current.https === last.https) status.https = false;
  return status;
};

/**
 * Builds compose runner data for the proxy service.
 * @param {string} project Compose project name.
 * @param {string[]} files Compose files.
 * @returns {object} Engine run descriptor.
 */
exports.getProxyRunner = (project, files) => ({
  compose: files,
  project: project,
  opts: {
    services: ['proxy'],
    noRecreate: false,
  },
});

/**
 * Builds a Traefik routing rule from parsed URL data.
 * @param {object} rule Parsed proxy rule.
 * @returns {string} Traefik rule expression.
 */
exports.getRule = rule => {
  // Start with the rule we can assume
  const hostRegex = rule.host.replace(new RegExp('\\*', 'g'), '[a-z0-9-]+');
  const rules = [`HostRegexp(\`${hostRegex}\`)`];
  // Add in the path prefix if we can
  if (rule.pathname.length > 1) rules.push(`PathPrefix(\`${rule.pathname}\`)`);
  return rules.join(' && ');
};

/**
 * Counts duplicate host, path, and port combinations across proxy config.
 * @param {object} config Proxy config keyed by service.
 * @returns {object} Counts keyed by host, path, and port.
 */
exports.getUrlsCounts = config => _(config)
    .flatMap(service => service)
    .map(url => exports.parseUrl(url))
    .map(data => `${data.host}${data.pathname}:${data.port}`)
    .countBy()
    .value();

/**
 * Expands proxied URLs into app-info URLs.
 * @param {string[]} urls Proxy URLs.
 * @param {object} ports HTTP and HTTPS port mapping.
 * @param {boolean} [hasCerts] Whether HTTPS URLs should be emitted.
 * @returns {string[]} App-info URLs.
 */
exports.parse2Info = (urls, ports, hasCerts = false) => _(urls)
    .map(url => exports.parseUrl(url))
    .flatMap(url => getInfoUrls(url, ports, hasCerts))
    .value();

/**
 * Builds SAN entries for all proxied hosts.
 * @param {string[]} urls Proxy URLs.
 * @returns {string} SAN entries separated by newlines.
 */
exports.parse2Sans = urls => _(urls)
    .map(url => exports.parseUrl(url).host)
    .map((host, index) => `DNS.${10+index} = ${host}`)
    .value()
    .join('\n');

/**
 * Builds per-service proxy config for Traefik.
 * @param {object} config Proxy config keyed by service.
 * @param {string[]} [sslReady] Services that can terminate TLS.
 * @returns {object[]} Proxy config fragments.
 */
exports.parseConfig = (config, sslReady = []) => _(config)
    .map((urls, service) => ({
      environment: {
        LANDO_PROXY_NAMES: exports.parse2Sans(urls),
      },
      name: service,
      labels: exports.parseRoutes(service, urls, sslReady)}))
    .value();

/**
 * Converts service URLs into Traefik labels.
 * @param {string} service Service name.
 * @param {string[]} [urls] Service URLs.
 * @param {string[]} sslReady Services that can terminate TLS.
 * @param {object} [labels] Existing labels.
 * @returns {object} Traefik labels.
 */
exports.parseRoutes = (service, urls = [], sslReady, labels = {}) => {
  // Prepare our URLs for traefik
  const parsedUrls = _(urls)
      .map(url => exports.parseUrl(url))
      .map(parsedUrl => _.merge({}, parsedUrl, {id: hasher(parsedUrl)}))
      .uniqBy('id')
      .value();

  // Add things into the labels
  _.forEach(parsedUrls, rule => {
    // Add some default middleware
    rule.middlewares.push({name: 'lando', key: 'headers.customrequestheaders.X-Lando', value: 'on'});
    // Add in any path stripping middleware we need it
    if (rule.pathname.length > 1) {
      rule.middlewares.push({name: 'stripprefix', key: 'stripprefix.prefixes', value: rule.pathname});
    }
    // Ensure we prefix all middleware with the ruleid
    rule.middlewares = _(rule.middlewares)
        .map(middleware => _.merge({}, middleware, {name: `${rule.id}-${middleware.name}`}))
        .value();

    // Set up all the middlewares
    _.forEach(rule.middlewares, m => {
      labels[`traefik.http.middlewares.${m.name}.${m.key}`] = m.value;
    });

    // Set the http entrypoint
    labels[`traefik.http.routers.${rule.id}.entrypoints`] = 'http';
    labels[`traefik.http.routers.${rule.id}.service`] = `${rule.id}-service`;
    // Rules are grouped by port so the port for any rule should be fine
    labels[`traefik.http.services.${rule.id}-service.loadbalancer.server.port`] = rule.port;
    // Set the route rules
    labels[`traefik.http.routers.${rule.id}.rule`] = exports.getRule(rule);
    // Set none secure middlewares
    labels[`traefik.http.routers.${rule.id}.middlewares`] = _(_.map(rule.middlewares, 'name'))
        .filter(name => !_.endsWith(name, '-secured'))
        .value()
        .join(',');

    // Add https if we can
    if (_.includes(sslReady, service)) {
      labels['io.lando.proxy.has-certs'] = true;
      labels[`traefik.http.routers.${rule.id}-secured.entrypoints`] = 'https';
      labels[`traefik.http.routers.${rule.id}-secured.service`] = `${rule.id}-secured-service`;
      labels[`traefik.http.routers.${rule.id}-secured.rule`] = exports.getRule(rule);
      labels[`traefik.http.routers.${rule.id}-secured.tls`] = true;
      labels[`traefik.http.routers.${rule.id}-secured.middlewares`] = _.map(rule.middlewares, 'name').join(',');
      labels[`traefik.http.services.${rule.id}-secured-service.loadbalancer.server.port`] = rule.port;
    }
  });
  return labels;
};
/**
 * Parses proxy URL input and applies Lando defaults.
 * @param {string|object} data Proxy URL input.
 * @returns {object} Parsed URL config with defaults applied.
 */
exports.parseUrl = data => {
  // We add the protocol ourselves, so it can be parsed. We also change all *
  // occurrences for our magic word __wildcard__, because otherwise the url parser
  // won't parse wildcards in the hostname correctly.
  const parsedUrl = _.isString(data) ? url.parse(`http://${data}`.replace(/\*/g, '__wildcard__')) : _.merge({}, data, {
    hostname: data.hostname.replace(/\*/g, '__wildcard__'),
  });

  // If the port is null then set it to 80
  if (_.isNil(parsedUrl.port)) parsedUrl.port = '80';

  // Retranslate and send
  const defaults = {port: '80', pathname: '/', middlewares: []};
  return _.merge(defaults, parsedUrl, {host: parsedUrl.hostname.replace(/__wildcard__/g, '*')});
};

/**
 * Maps local ports to HTTP or HTTPS URLs.
 * @param {Array<string|number>} ports Ports to map.
 * @param {boolean} [secure] Whether to emit https URLs.
 * @param {string} [hostname] Hostname to use in generated URLs.
 * @returns {string[]} Generated URLs.
 */
exports.ports2Urls = (ports, secure = false, hostname = '127.0.0.1') => _(ports)
    .map(port => url.format({protocol: (secure) ? 'https' : 'http', hostname, port}))
    .value();
