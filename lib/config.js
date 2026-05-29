'use strict';

// Modules
const _ = require('lodash');
const env = require('./env');
const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const url = require('url');

/**
 * A plugin directory source.
 * @typedef {object} PluginDir
 * @property {string} path Absolute or relative path to the plugin root.
 * @property {string} [subdir='plugins'] Subdirectory that contains plugins.
 */

/**
 * A normalized plugin reference.
 * @typedef {object} PluginReference
 * @property {string} name Plugin name.
 * @property {'local'|'remote'} type How the plugin should be resolved.
 * @property {string} [path] Local plugin path.
 * @property {string} [version] Remote plugin version.
 */

// Default config
/** @type {object} */
const defaultConfig = {
  composeBin: env.getComposeExecutable(),
  disablePlugins: [],
  dockerBin: env.getDockerExecutable(),
  dockerBinDir: env.getDockerBinPath(),
  env: process.env,
  home: os.homedir(),
  isArmed: _.includes(['arm64', 'aarch64'], process.arch),
  logLevel: 'debug',
  node: process.version,
  os: {
    type: os.type(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
  },
  pluginDirs: [],
  plugins: [],
  userConfRoot: os.tmpdir(),
};

/**
 * Builds a Docker host URL from hostname and port parts.
 * @param {string} hostname Hostname or IP address for the Docker daemon.
 * @param {number} [port] Docker daemon TCP port.
 * @returns {string} Formatted Docker host URL.
 */
const setDockerHost = (hostname, port = 2376) => url.format({
  protocol: 'tcp',
  slashes: true,
  hostname,
  port,
});

/**
 * Normalizes plugin directory definitions into absolute paths and explicit subdirs.
 * @param {Array<string|PluginDir>} [dirs] Plugin directory definitions.
 * @param {string} [baseDir] Base directory used to resolve relative paths.
 * @param {boolean} [isLandoFile] Whether the source came from a Landofile.
 * @returns {PluginDir[]} Normalized plugin directory definitions.
 */
const normalizePluginDirs = (dirs = [], baseDir = __dirname, isLandoFile = false) => _(dirs)
    .map(data => {
      if (_.isString(data)) {
        return {
          path: data,
          subdir: isLandoFile ? '.' : 'plugins',
        };
      }
      // or just return
      return data;
    })
    .map(data => {
      if (path.isAbsolute(data.path)) return data;
      else {
        data.path = path.resolve(baseDir, data.path);
        return data;
      }
    })
    .value();

/**
 * Resolves plugin declarations into local or remote plugin references.
 * @param {Record<string, string>} [plugins] Plugin declarations keyed by plugin name.
 * @param {string} [baseDir] Base directory used to resolve local plugin paths.
 * @returns {PluginReference[]} Normalized plugin references.
 */
const normalizePlugins = (plugins = [], baseDir = __dirname) => _(plugins)
// @NOTE: right now this is very "dumb", if the plugin is a path that exist then we set to local
// otherwise we assume it needs to be grabbed, although we don't have a way to grab it yet
// @TODO: we need to figure out what the supported API for plugins should be, right now we ASSUME
// it is a key/value pair where value is ONLY a string but we should probably support passing in objects as well
    .map((value, key) => {
    // Try to figure out what the local path would be
      const pluginPath = path.isAbsolute(value) ? value : path.join(baseDir, value);
      // If SOMETHING exists at that path then assume its a local plugin
      if (fs.existsSync(pluginPath)) return {name: key, type: 'local', path: pluginPath};
      // Otherwise assume its an external one
      // @TODO: Should we also set a path here for where the plugin should be installed?
      else return {name: key, type: 'remote', version: value};
    })
    .value();

/**
 * Attempt to parse a JSON string to an objects
 * @since 3.0.0
 * @alias lando.utils.config.tryConvertJson
 * @param {string} value The string to convert
 * @returns {object} A parsed object or the inputted value
 */
exports.tryConvertJson = value => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/**
 * Uses _.mergeWith to concat arrays, this helps replicate how Docker Compose
 * merges its things
 * @see https://lodash.com/docs#mergeWith
 * @since 3.0.0
 * @alias lando.utils.config.merge
 * @param {object} old object to be merged
 * @param {object} fresh object to be merged
 * @returns {object} The new object
 * @example
 * // Take an object and write a docker compose file
 * const newObject = _.mergeWith(a, b, lando.utils.merger);
 */
exports.merge = (old, ...fresh) => _.mergeWith(old, ...fresh, (s, f) => {
  if (_.isArray(s)) return _.uniq(s.concat(f));
});

/**
 * Strips process.env of all envvars with PREFIX and returns process.env
 *
 * NOTE: this actually returns process.env not a NEW object cloned from process.env
 * @since 3.0.0
 * @alias lando.utils.config.stripEnv
 * @param {string} prefix - The prefix to strip
 * @returns {object} Updated process.env
 * @example
 * // Reset the process.env without any DOCKER_ prefixed envvars
 * process.env = config.stripEnv('DOCKER_');
 */
exports.stripEnv = prefix => {
  // Strip it down
  _.each(process.env, (value, key) => {
    if (_.includes(key, prefix)) {
      delete process.env[key];
    }
  });

  // Return
  return process.env;
};

/**
 * Define default config
 * @since 3.0.0
 * @alias lando.utils.config.defaults
 * @returns {object} The default config object.
 */
exports.defaults = () => {
  // Also add some info to the process so we can use this elsewhere
  process.lando = 'node';
  // The default config
  return _.merge(defaultConfig, {process: process.lando});
};

/**
 * Applies engine-specific environment variables and TLS material.
 * @param {object} [options] Engine settings to normalize.
 * @param {object} [options.engineConfig] Raw engine configuration.
 * @param {object} [options.env] Environment object to mutate with Docker vars.
 * @returns {object} The updated engine configuration.
 */
exports.getEngineConfig = ({engineConfig = {}, env = {}}) => {
  // Set the docker host if its non-standard
  if (engineConfig.host !== undefined && engineConfig.host !== '127.0.0.1') {
    env.DOCKER_HOST = setDockerHost(engineConfig.host, engineConfig.port);
  }
  // Set the TLS/cert things if needed
  if (_.has(engineConfig, 'certPath')) {
    env.DOCKER_CERT_PATH = engineConfig.certPath;
    env.DOCKER_TLS_VERIFY = 1;
    env.DOCKER_BUILDKIT = 1;
    engineConfig.ca = fs.readFileSync(path.join(env.DOCKER_CERT_PATH, 'ca.pem'));
    engineConfig.cert = fs.readFileSync(path.join(env.DOCKER_CERT_PATH, 'cert.pem'));
    engineConfig.key = fs.readFileSync(path.join(env.DOCKER_CERT_PATH, 'key.pem'));
  }
  // Return
  return engineConfig;
};
/**
 * Merge in config file if it exists
 * @since 3.5.0
 * @alias lando.utils.config.loadFiles
 * @param {Array<string|{file: string, data?: object, landoFile?: boolean}>} files An array of files or source objects to try loading.
 * @returns {object} An object of config merged from file sources
 */
exports.loadFiles = files => _(files)
// Filter the source out if it doesn't exist
    .filter(source => {
      if (typeof source === 'string') {
        return fs.existsSync(source);
      }
      if (typeof source.file === 'string') {
        return fs.existsSync(source.file);
      }
      return false;
    })
// If the file is just a string lets map it to an object
    .map(source => {
      return _.isString(source) ? {file: source, data: yaml.load(fs.readFileSync(source)) || {}} : source;
    })
// Add on the root directory for mapping purposes
    .map(source => _.merge({}, source, {root: path.dirname(source.file)}))
// Handle plugins/pluginDirs if they are relative paths
// @TODO: is this the right place to do this? probably not but lets vibe it until we redo it all in v4
    .map(source => {
    // Normlize pluginDirs data
      if (!_.isEmpty(source.data.pluginDirs)) {
        source.data.pluginDirs = normalizePluginDirs(source.data.pluginDirs, source.root, source.landoFile);
      }
      // Ditto for plugins
      if (!_.isEmpty(source.data.plugins)) {
        source.data.plugins = normalizePlugins(source.data.plugins, source.root);
      }
      // Return the source back
      return source;
    })
// Start collecting
    .reduce((a, source) => exports.merge(a, source.data), {});

/**
 * Filter process.env by a given prefix
 * @since 3.0.0
 * @alias lando.utils.config.loadEnvs
 * @param {string} prefix - The prefix by which to filter. Should be without the trailing `_` eg `LANDO` not `LANDO_`
 * @returns {object} Object of things with camelCased keys
 */
exports.loadEnvs = prefix => _(process.env)
// Only muck with prefix_ variables
    .pickBy((value, key) => _.includes(key, prefix))
// Prep the keys for consumption
    .mapKeys((value, key) => _.camelCase(_.trimStart(key, prefix)))
// If we have a JSON string as a value, parse that and assign its sub-keys
    .mapValues(exports.tryConvertJson)
// Resolve the lodash wrapper
    .value();
