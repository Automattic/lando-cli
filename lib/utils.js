'use strict';

// Modules
const _ = require('lodash');
const copydir = require('copy-dir');
const fs = require('fs');
const parse = require('string-argv');
const os = require('os');
const path = require('path');
const Yaml = require('./yaml');
/** @type {Yaml} */
const yaml = new Yaml();

/**
 * Builds app bind mounts for each enabled service.
 * @param {object} app App data with service definitions and a project root.
 * @returns {object} Compose-ready volume config keyed by service name.
 */
exports.getAppMounts = app => _(app.services)
// Objectify
    .map(service => _.merge({name: service}, _.get(app, `config.services.${service}`, {})))
// Set the default
    .map(config => _.merge({}, config, {app_mount: _.get(config, 'app_mount', 'cached')}))
// Filter out disabled mountes
    .filter(config => config.app_mount !== false && config.app_mount !== 'disabled')
// Combine together
    .map(config => ([config.name, {volumes: [`${app.root}:/app:${config.app_mount}`]}]))
    .fromPairs()
    .value();

/**
 * Normalizes a project name for docker compose identifiers.
 * @param {string} data Raw project or app name.
 * @returns {string} Docker compose-safe identifier.
 */
exports.dockerComposify = data => _.toLower(data).replace(/_|-|\.+/g, '');

/**
 * Normalizes an app name into a stable machine-readable slug.
 * @param {string} data Raw app name.
 * @returns {string} Slugified app name.
 */
exports.appMachineName = data => require('transliteration').slugify(data);

/**
 * Writes compose groups to numbered YAML files.
 * @param {object|object[]} data Compose groups to serialize.
 * @param {string} dir Directory where the YAML files should be written.
 * @returns {string[]} Written file paths.
 */
exports.dumpComposeData = (data, dir) => _(_.flatten([data]))
    .flatMap(group => _.map(group.data, (compose, index) => ({data: compose, file: `${group.id}-${index}.yml`})))
    .map(compose => yaml.dump(path.join(dir, compose.file), compose.data))
    .value();

/**
 * Loads docker compose files that exist on disk.
 * @param {string[]} files Candidate compose file paths.
 * @param {string} dir Base directory used to resolve relative paths.
 * @returns {object[]} Parsed compose documents.
 */
exports.loadComposeFiles = (files, dir) => _(exports.validateFiles(files, dir))
    .map(file => yaml.load(file))
    .value();

/**
 * Builds the default environment passed to CLI tooling commands.
 * @param {object} [more] Extra environment variables to merge in.
 * @returns {object} Combined environment variables.
 */
exports.getCliEnvironment = (more = {}) => _.merge({}, {
  PHP_MEMORY_LIMIT: '-1',
}, more);

/**
 * Extracts the first usable identifier from container-like data.
 * @param {object} c Container or service metadata.
 * @returns {string|undefined} First available container identifier.
 */
exports.getId = c => c.cid || c.id || c.containerName || c.containerID || c.name;

/**
 * Builds default app info entries for every known service.
 * @param {object} app App data with services and existing info records.
 * @returns {object[]} Normalized app info entries.
 */
exports.getInfoDefaults = app => _(app.services)
    .map(service => ({service, urls: [], type: 'docker-compose', healthy: true}))
    .map(service => _.merge({}, service, _.find(app.info, {service: service.service})))
    .value();

/**
 * Builds the shared compose globals injected into each service.
 * @param {object} app App data with environment, labels, and config roots.
 * @returns {object} Shared compose service defaults.
 */
exports.getGlobals = app => exports.toObject(app.services, {
  networks: {default: {}},
  environment: app.env,
  env_file: app.envFiles,
  labels: app.labels,
  volumes: [`${app._config.userConfRoot}/scripts:/helpers`],
});

/**
 * Collects every unique service name from compose data.
 * @param {Array<{data: object[]}>} composeData Compose groups to inspect.
 * @returns {string[]} Unique service names.
 */
exports.getServices = composeData => _(composeData)
    .flatMap(data => data.data)
    .flatMap(data => _.keys(data.services))
    .uniq()
    .value();

/**
 * Gets the effective user for a service from app info.
 * @param {string} service Service name.
 * @param {object[]} [info] Existing app info records.
 * @returns {string} Service user name.
 */
exports.getUser = (service, info = []) => {
  return _.get(_.find(info, {service}), 'meUser', 'www-data');
};

/**
 * Wraps a single datum in an array for Promise iteration helpers.
 * @param {unknown|unknown[]} data Single value or array of values.
 * @returns {unknown[]} Array form of the input.
 */
exports.normalizer = data => (!_.isArray(data)) ? [data] : data;

/**
 * Makes each provided file executable.
 * @param {string[]} files Files to chmod.
 * @param {string} [base] Base directory for relative file paths.
 * @returns {void}
 */
exports.makeExecutable = (files, base = process.cwd()) => {
  _.forEach(files, file => {
    fs.chmodSync(path.join(base, file), '755');
  });
};

/**
 * Copies mountable config assets into a writable directory.
 * @param {string} src Source directory to copy from.
 * @param {string} [dest] Destination directory.
 * @returns {string} Destination directory.
 */
exports.moveConfig = (src, dest = os.tmpdir()) => {
  // Copy opts and filter out all js files
  // We don't want to give the false impression that you can edit the JS
  const filter = (stat, filepath, filename) => (path.extname(filename) !== '.js');
  // Ensure to exists
  fs.mkdirSync(dest, {recursive: true});
  // Try to copy the assets over
  try {
    // @todo: why doesn't the below work for PLD?
    copydir.sync(src, dest, filter);
    exports.makeExecutable(_(fs.readdirSync(dest))
        .filter(file => path.extname(file) === '.sh')
        .value()
    , dest);
  } catch (error) {
    const code = _.get(error, 'code');
    const syscall = _.get(error, 'syscall');
    const f = _.get(error, 'path');

    // Catch this so we can try to repair
    if (code !== 'EISDIR' || syscall !== 'open' || !!fs.mkdirSync(f, {recursive: true})) {
      throw error;
    }

    // Try to take corrective action
    fs.unlinkSync(f);
    copydir.sync(src, dest, filter);
    exports.makeExecutable(_(fs.readdirSync(dest))
        .filter(file => path.extname(file) === '.sh')
        .value()
    , dest);
  };

  // Return the new scripts directory
  return dest;
};

/**
 * Escapes and optionally wraps a command for shell execution.
 * @param {string|string[]} command Command string or argv array.
 * @param {boolean} [wrap] Whether shell metacharacters should trigger wrapping.
 * @param {string[]} [args] Additional CLI args used to decide wrapping behavior.
 * @returns {string[]} Shell-safe argv.
 */
exports.shellEscape = (command, wrap = false, args = process.argv.slice(3)) => {
  // If no args and is string then just wrap and return
  if (_.isString(command) && _.isEmpty(args)) {
    return ['/bin/sh', '-c', command];
  }

  // Parse the command if its a string
  if (_.isString(command)) command = parse(command);

  // Wrap in shell if specified
  if (wrap && !_.isEmpty(_.intersection(command, ['&', '&&', '|', '||', '<<', '<', '>', '>>', '$']))) {
    command = ['/bin/sh', '-c', command.join(' ')];
  }

  // Return
  return command;
};

/**
 * Maps docker container summary data into Lando container metadata.
 * @param {object} container Raw docker container summary.
 * @param {string[]} container.Names Docker container names.
 * @param {object} container.Labels Docker container labels.
 * @param {string} container.Id Docker container id.
 * @param {string} container.Status Docker container status text.
 * @returns {object} Normalized Lando container metadata.
 */
exports.toLandoContainer = ({Names, Labels, Id, Status}) => {
  // Get name of docker container.
  const app = Labels['com.docker.compose.project'];
  const service = Labels['com.docker.compose.service'];
  const lando = Labels['io.lando.container'];
  const special = Labels['io.lando.service-container'];
  // Build generic container.
  return {
    id: Id,
    service: service,
    name: Names[0].slice(1),
    app: (special !== 'TRUE') ? app : '_global_',
    src: (Labels['io.lando.src']) ? Labels['io.lando.src'].split(',') : 'unknown',
    kind: (special !== 'TRUE') ? 'app' : 'service',
    lando: (lando === 'TRUE') ? true : false,
    instance: Labels['io.lando.id'] || 'unknown',
    status: Status,
  };
};

/**
 * Builds an object by assigning the same value shape to multiple keys.
 * @param {string[]} keys Keys to assign.
 * @param {object} [data] Value template for each key.
 * @returns {object} Object keyed by the provided names.
 */
exports.toObject = (keys, data = {}) => _(keys)
    .map(service => data)
    .map((service, index) => _.set({}, keys[index], service))
    .thru(services => _.reduce(services, (sum, service) => _.merge(sum, service), {}))
    .value();

/**
 * Filters compose files down to paths that actually exist.
 * @param {string[]} [files] Candidate compose file paths.
 * @param {string} [base] Base directory for relative file paths.
 * @returns {string[]} Existing file paths.
 */
exports.validateFiles = (files = [], base = process.cwd()) => _(files)
    .map(file => (path.isAbsolute(file) ? file : path.join(base, file)))
    .filter(file => fs.existsSync(file))
    .value();

/**
 * Normalizes a path for use with the `glob` package.
 * On Windows, it replaces backslashes with forward slashes.
 * On other platforms, it returns the path unchanged.
 * @param {string} p - The path to normalize.
 * @returns {string} - The normalized path.
 */
exports.normalizePathForGlob = p => os.platform() === 'win32' ? p.replace(/\\/g, '/') : p;
