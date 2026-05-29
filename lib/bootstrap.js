'use strict';

// Modules
const {randomUUID} = require('crypto');
const _ = require('lodash');
const merger = require('./config').merge;
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Docker and Compose version metadata.
 * @typedef {object} ComposeVersionInfo
 * @property {string} [engine] Docker engine version.
 * @property {string} [compose] Docker Compose version.
 * @property {string} [composePlugin] Docker Compose plugin version.
 */

/**
 * Config source entry used during bootstrap.
 * @typedef {object} ConfigSourceEntry
 * @property {object} data Config data to merge.
 * @property {string} file Source file path.
 * @property {boolean} [landoFile] Whether the source came from a Landofile.
 */

/**
 * Bootstrap options used to assemble runtime config.
 * @typedef {object} BootstrapOptions
 * @property {Array<ConfigSourceEntry>} [configSources] Bootstrap config sources.
 * @property {string} [envPrefix] Environment variable prefix.
 * @property {object} [engineConfig] Raw engine configuration.
 * @property {object} [landoFileConfig] Landofile config overrides.
 * @property {string} [userConfRoot] User config root.
 */

/**
 * Runtime config shape used during bootstrap.
 * @typedef {object} RuntimeConfig
 * @property {string|false} [composeBin] Docker Compose binary path.
 * @property {string} [composeCache] Compose cache file path.
 * @property {Array<ConfigSourceEntry>} [configSources] Bootstrap config sources.
 * @property {string|false} [dockerBin] Docker binary path.
 * @property {object} [engineConfig] Raw engine configuration.
 * @property {Record<string, unknown>} [env] Runtime environment variables.
 * @property {string} [envPrefix] Environment variable prefix.
 * @property {string} [home] User home directory.
 * @property {string} [id] Runtime user identifier.
 * @property {string} [instance] Runtime instance id.
 * @property {object} [landoFileConfig] Landofile config overrides.
 * @property {string} [process] Runtime process label.
 * @property {string} [recipe] Active recipe name.
 * @property {Record<string, unknown>} [tooling] Tooling definitions.
 * @property {string} [toolingCache] Tooling cache file path.
 * @property {string} [toolingRouter] Tooling router cache file path.
 * @property {string} [user] Runtime user id.
 * @property {string} userConfRoot User config root.
 * @property {ComposeVersionInfo} [versions] Docker and Compose version metadata.
 */

/**
 * Minimal app-like object loaded from Landofiles.
 * @typedef {object} MinimalAppData
 * @property {string[]} compose Array of Docker Compose file paths.
 * @property {string} composeCache Compose cache file path.
 * @property {string[]} configFiles Source config files.
 * @property {string} metaCache Metadata cache key.
 * @property {string} name App name.
 * @property {string} project Docker Compose project name.
 * @property {string} root App root directory.
 * @property {string} toolingCache Tooling cache file path.
 * @property {string} toolingRouter Tooling router cache file path.
 */

/**
 * Parsed CLI argv used during task bootstrap.
 * @typedef {object} ParsedArgv
 * @property {string[]} [_] Positional command arguments.
 * @property {{root: string}} [_app] Active app metadata.
 */

/**
 * Determines whether a tooling command can run at app or engine bootstrap level.
 * @param {RuntimeConfig} config App config.
 * @param {string} command Tooling command name.
 * @returns {'app'|'engine'} Bootstrap level.
 */
const getBsLevel = (config, command) => {
  if (_.has(config, `tooling.${command}.level`)) return config.tooling[command].level;
  else return (!fs.existsSync(config.composeCache)) ? 'app' : 'engine';
};

/**
 * Loads a cached JSON payload without going through the cache module.
 * @param {string} file Cache file path.
 * @returns {Record<string, unknown>} Parsed cached data.
 */
const loadCacheFile = file => {
  try {
    return JSON.parse(JSON.parse(fs.readFileSync(file, {encoding: 'utf-8'})));
  } catch (e) {
    throw new Error(`There was a problem with parsing ${file}. Ensure it is valid JSON! ${e}`, {cause: e});
  }
};

/**
 * Loads a Landofile from disk.
 * @param {string} file Landofile path.
 * @returns {Record<string, unknown>} Parsed YAML payload.
 */
const loadLandoFile = file => {
  try {
    return yaml.load(fs.readFileSync(file));
  } catch (e) {
    throw new Error(`There was a problem with parsing ${file}. Ensure it is valid YAML! ${e}`, {cause: e});
  }
};

/**
 * Builds an app-level task runner for a tooling command.
 * @param {string} command Tooling command name.
 * @returns {function(object, import('./lando')): Promise} Task runner.
 */
const appRunner = command => (argv, lando) => {
  const app = lando.getApp(argv._app.root);
  return lando.events.emit('pre-app-runner', app)
      .then(() => lando.events.emit('pre-command-runner', app))
      .then(() => app.init().then(() => _.find(app.tasks, {command}).run(argv)));
};

/**
 * Builds an engine-level task runner for a tooling command.
 * @param {RuntimeConfig} config App config.
 * @param {string} command Tooling command name.
 * @returns {function(object, import('./lando')): Promise} Task runner.
 */
const engineRunner = (config, command) => (argv, lando) => {
  const AsyncEvents = require('./events');
  // Build a minimal app
  const app = lando.cache.get(path.basename(config.composeCache));
  app.config = config;
  app.events = new AsyncEvents(lando.log);
  app.getServiceContainerId = service => `${app.project}-${service}-1`;
  app.getServiceFromContainerId = id => id.replace(new RegExp(`${app.project}-(.*)-1`), '$1');
  // Load only what we need so we don't pay the appinit penalty
  const utils = require('./../plugins/lando-tooling/lib/utils');
  const buildTask = require('./../plugins/lando-tooling/lib/build');
  require('./../plugins/lando-events/app')(app, lando);
  app.config.tooling = utils.getToolingTasks(app.config.tooling, app);
  // Final event to modify and then load and run
  return lando.events.emit('pre-engine-runner', app)
      .then(() => lando.events.emit('pre-command-runner', app))
      .then(() => buildTask(_.find(app.config.tooling, task => task.name === command), lando).run(argv));
};

/**
 * Builds candidate file locations while traversing upward from a start path.
 * @param {string} file File path to traverse from.
 * @returns {string[]} Candidate file paths.
 */
const traverseUp = file => _(_.range(path.dirname(file).split(path.sep).length))
    .map(end => _.dropRight(path.dirname(file).split(path.sep), end).join(path.sep))
    .map(dir => path.join(dir, path.basename(file)))
    .value();

/**
 * Returns directory paths from a starting point up to the filesystem root.
 * @param {string} [startFrom] Starting directory.
 * @returns {string[]} Directory paths ordered from nearest to farthest.
 */
const pathsToRoot = (startFrom = process.cwd()) => {
  return _(_.range(path.dirname(startFrom).split(path.sep).length))
      .map(end => _.dropRight(path.dirname(startFrom).split(path.sep), end).join(path.sep))
      .unshift(startFrom)
      .dropRight()
      .value();
};

/**
 * Converts Landofile-derived plugin config into a config source entry.
 * @param {RuntimeConfig} [config] App config.
 * @returns {ConfigSourceEntry} Config source entry.
 */
const parseLandofileConfig = (config = {}) => ({
  data: _.pickBy(config, (value, key) => {
    return _.includes(['plugins', 'pluginDirs'], key) && !_.isEmpty(value);
  }),
  file: config.configFiles[0],
  landoFile: true,
});

/**
 * Builds the final runtime config from defaults, files, env, and computed values.
 * @param {BootstrapOptions} options Bootstrap options.
 * @returns {RuntimeConfig} Final runtime config.
 */
exports.buildConfig = options => {
  // Modules
  const hasher = require('object-hash');
  const helpers = require('./config');
  // Start building the config
  let config = helpers.merge(helpers.defaults(), options);
  // Add in relevant Landofile config to config sources
  // @NOTE: right now this is pretty limited and mostly just so we can accelerate the breakup of the repo
  // Lando 4 will allow all non-bootstrap/compiletime config to be overridden in Landofiles'
  if (!_.isEmpty(config.landoFileConfig)) config.configSources.push(parseLandofileConfig(config.landoFileConfig));
  // If we have configSources let's merge those in as well
  if (!_.isEmpty(config.configSources)) config = helpers.merge(config, helpers.loadFiles(config.configSources));
  // @TODO: app plugin dir gets through but core yml does not?
  // If we have an envPrefix set then lets merge that in as well
  if (_.has(config, 'envPrefix')) config = helpers.merge(config, helpers.loadEnvs(config.envPrefix));
  // Add some final computed properties to the config
  config.instance = hasher(config.userConfRoot);
  // Do some engine config setup
  // Strip all DOCKER_ and COMPOSE_ envvars
  config.env = helpers.stripEnv('DOCKER_');
  config.env = helpers.stripEnv('COMPOSE_');
  // Set up the default engine config if needed
  config.engineConfig = helpers.getEngineConfig(config);
  // Add some docker compose protection on windows
  if (process.platform === 'win32') config.env.COMPOSE_CONVERT_WINDOWS_PATHS = 1;
  // Extend the dockercompose timeout limit for future mutagen things
  config.env.COMPOSE_HTTP_TIMEOUT = 300;
  // Return the config
  return config;
};

/**
 * Helper for docker compose
 * TODO: eventually this needs to live somewhere else so we can have a better
 * default engine instantiation.
 * @param {import('./shell')} shell Shell helper.
 * @param {string} bin Docker compose binary.
 * @param {string} cmd Compose command name.
 * @param {import('./engine').EngineComposeTaskData} datum Compose run descriptor.
 * @param {string} dockerBin Docker binary.
 * @param {ComposeVersionInfo} versions Docker and compose version metadata.
 * @returns {Promise<string>} Command output.
 */
exports.dc = (shell, bin, cmd, {compose, project, opts = {}}, dockerBin, versions) => {
  const dockerCompose = require('./compose');
  const run = dockerCompose[cmd](compose, project, opts);
  if (versions.composePlugin) {
    return shell.sh([dockerBin, 'compose'].concat(run.cmd), run.opts);
  }
  return shell.sh([bin].concat(run.cmd), run.opts);
};

/**
 * Loads a minimal app-like object from a set of Landofiles.
 * @param {string[]} files Landofile paths.
 * @param {string} userConfRoot User config root.
 * @returns {MinimalAppData} Minimal app data.
 */
exports.getApp = (files, userConfRoot) => {
  const config = merger({}, ..._.map(files, file => loadLandoFile(file)));
  return _.merge({}, config, {
    configFiles: files,
    metaCache: `${config.name}.meta.cache`,
    project: _.toLower(config.name).replace(/_|-|\.+/g, ''),
    root: path.dirname(files[0]),
    composeCache: path.join(userConfRoot, 'cache', `${config.name}.compose.cache`),
    toolingCache: path.join(userConfRoot, 'cache', `${config.name}.tooling.cache`),
    toolingRouter: path.join(userConfRoot, 'cache', `${config.name}.tooling.router`),
  });
};

/**
 * Finds Landofile candidates by walking upward from a starting directory.
 * @param {string[]} [files] Candidate file basenames.
 * @param {string} [startFrom] Starting directory.
 * @returns {string[]} Existing Landofile paths.
 */
exports.getLandoFiles = (files = [], startFrom = process.cwd()) => _(files)
    .flatMap(file => traverseUp(path.resolve(startFrom, file)))
    .sortBy().reverse()
    .filter(file => fs.existsSync(file) && path.isAbsolute(file))
    .thru(files => _.isEmpty(files) ? [] : [_.first(files)])
    .flatMap(dirFile => _.map(files, file => path.join(path.dirname(dirFile), file)))
    .filter(file => fs.existsSync(file))
    .value();

/**
 * Builds tooling task metadata from cached and in-config tooling definitions.
 * @param {RuntimeConfig} [config] App config.
 * @param {ParsedArgv} [argv] Parsed argv.
 * @param {object[]} [tasks] Existing task list.
 * @returns {object[]} Tooling task metadata.
 */
exports.getTasks = (config = {}, argv = {}, tasks = []) => {
  // If we have a tooling router lets rebase on that
  if (fs.existsSync(config.toolingRouter)) {
    // Get the closest route
    const closestRoute = _(loadCacheFile(config.toolingRouter))
        .map(route => _.merge({}, route, {
          closeness: _.indexOf(pathsToRoot(), route.route),
        }))
        .filter(route => route.closeness !== -1)
        .orderBy('closeness')
        .thru(routes => routes[0])
        .value();

    // If we have a closest route lets mod config.tooling
    if (_.has(closestRoute, 'tooling')) {
      config.tooling = _.merge({}, config.tooling, closestRoute.tooling);
      config.route = closestRoute;
    }
  // Or we have a recipe lets rebase on that
  } else if (_.has(config, 'recipe')) {
    config.tooling = _.merge({}, loadCacheFile(config.toolingCache), config.tooling);
  }

  // If the tooling command is being called lets assess whether we can get away with engine bootstrap level
  const level = (_.includes(_.keys(config.tooling), argv._[0])) ? getBsLevel(config, argv._[0]) : 'app';

  // Load all the tasks, remember we need to remove "disabled" tasks (eg non-object tasks) here
  _.forEach(_.get(config, 'tooling', {}), (task, command) => {
    if (_.isObject(task)) {
      tasks.push({
        command,
        level,
        describe: _.get(task, 'description', `Runs ${command} commands`),
        options: _.get(task, 'options', {}),
        run: (level === 'app') ? appRunner(command) : engineRunner(config, command),
        delegate: _.isEmpty(_.get(task, 'options', {})),
      });
    }
  });
  return tasks.concat(loadCacheFile(process.landoTaskCacheFile));
};

/**
 * Creates the runtime cache and ensures a persistent user id exists.
 * @param {import('./logger')} log Logger instance.
 * @param {RuntimeConfig} config Runtime config.
 * @returns {import('./cache')} Cache instance.
 */
exports.setupCache = (log, config) => {
  const Cache = require('./cache');
  const cache = new Cache({log, cacheDir: path.join(config.userConfRoot, 'cache')});
  if (!cache.get('id')) cache.set('id', randomUUID(), {persist: true});
  config.user = cache.get('id');
  config.id = config.user;
  return cache;
};

/**
 * Creates the engine abstraction used for docker and compose operations.
 * @param {RuntimeConfig} config Runtime config.
 * @param {import('./cache')} cache Cache instance.
 * @param {import('./events')} events Event emitter.
 * @param {import('./logger')} log Logger instance.
 * @param {import('./shell')} shell Shell helper.
 * @param {string} id Runtime instance id.
 * @returns {import('./engine')} Engine instance.
 */
exports.setupEngine = (config, cache, events, log, shell, id) => {
  const Engine = require('./engine');
  const Landerode = require('./docker');
  const LandoDaemon = require('./daemon');
  const docker = new Landerode(config.engineConfig, id);
  const daemon = new LandoDaemon(cache, events, config.dockerBin, log, config.process, config.composeBin);
  const compose = (cmd, datum) => exports.dc(shell, config.composeBin, cmd, datum, config.dockerBin, config.versions);
  return new Engine(daemon, docker, compose, config);
};
