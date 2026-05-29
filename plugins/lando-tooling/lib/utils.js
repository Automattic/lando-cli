'use strict';

// Modules
const _ = require('lodash');
// eslint-disable-next-line no-redeclare
const escape = require('./../../../lib/utils').shellEscape;
const getUser = require('./../../../lib/utils').getUser;
const getCliEnvironment = require('./../../../lib/utils').getCliEnvironment;

/**
 * Builds docker exec argv for a tooling task.
 * @param {string} docker Docker executable path.
 * @param {object} datum Engine task data.
 * @returns {string[]} Docker exec argv.
 */
const getExecOpts = (docker, datum) => {
  const exec = [docker, 'exec'];
  // Should only use this if we have to
  if (process.stdin.isTTY) exec.push('--tty');
  exec.push('--interactive');
  // Add user and workdir
  exec.push('--user');
  exec.push(datum.opts.user);
  exec.push('--workdir');
  exec.push(datum.opts.workdir);
  // Add envvvars
  _.forEach(datum.opts.environment, (value, key) => {
    exec.push('--env');
    exec.push(`${key}=${value}`);
  });
  // Add id
  exec.push(datum.id);
  return exec;
};

/**
 * Finds argv switches that correspond to a selected dynamic service answer.
 * @param {string} answer Selected answer.
 * @param {object} [answers] All interactive answers.
 * @returns {string[]} Arg keys that should be stripped from passthrough argv.
 */
const getDynamicKeys = (answer, answers = {}) => _(answers)
    .map((value, key) => ({key, value}))
    .filter(data => data.value === answer)
    .map(data => data.key)
    .map(key => (_.size(key) === 1) ? `-${key}` : `--${key}`)
    .value();

/**
 * Resolves dynamic service placeholders from interactive answers.
 * @param {object} config Tooling config.
 * @param {object} [options] Tooling option metadata.
 * @param {object} [answers] Interactive answers.
 * @returns {object} Updated tooling config.
 */
const handleDynamic = (config, options = {}, answers = {}) => {
  if (_.startsWith(config.service, ':')) {
    const answer = answers[config.service.split(':')[1]];
    // Remove dynamic service option from argv
    _.remove(process.argv, arg => _.includes(getDynamicKeys(answer, answers).concat(answer), arg));
    // Return updated config
    return _.merge({}, config, {service: answers[config.service.split(':')[1]]});
  } else {
    return config;
  }
};

/**
 * Appends passthrough argv to a tooling config.
 * @param {object} config Tooling config.
 * @param {string[]} [argopts] Explicit passthrough args.
 * @returns {object} Updated tooling config.
 */
const handleOpts = (config, argopts = []) => {
  // Append any user specificed opts
  argopts = argopts.concat(process.argv.slice(3));
  // If we have no args then just return right away
  if (_.isEmpty(argopts)) return config;
  // Return
  return _.merge({}, config, {args: argopts});
};

/**
 * Converts passthrough options into argv fragments.
 * @param {object} [options] Tooling option metadata.
 * @param {object} [answers] Interactive answers.
 * @returns {string[]} Passthrough argv fragments.
 */
const handlePassthruOpts = (options = {}, answers = {}) => _(options)
    .map((value, key) => _.merge({}, {name: key}, value))
    .filter(value => value.passthrough === true && !_.isNil(answers[value.name]))
    .map(value => `--${value.name}=${answers[value.name]}`)
    .value();

/**
 * Normalizes a tooling command into a config object.
 * @param {string|object} cmd Tooling command definition.
 * @param {string} service Default service name.
 * @returns {{command: string|string[], service: string}} Normalized command config.
 */
const parseCommand = (cmd, service) => ({
  command: (_.isObject(cmd)) ? cmd[_.first(_.keys(cmd))] : cmd,
  service: (_.isObject(cmd)) ? _.first(_.keys(cmd)) : service,
});

/**
 * Builds an engine run task for a tooling command.
 * @param {object} app App instance.
 * @param {string|string[]} command Tooling command.
 * @param {string} service Service name.
 * @param {string|null} user User override.
 * @param {object} [env] Extra environment variables.
 * @param {string} [dir] Working directory override.
 * @returns {object} Engine run task.
 */
exports.buildCommand = (app, command, service, user, env = {}, dir = undefined) => ({
  id: app.getServiceContainerId(service),
  compose: app.compose,
  project: app.project,
  cmd: command,
  opts: {
    environment: getCliEnvironment(env),
    mode: 'attach',
    workdir: dir || '/app',
    user: (user === null) ? getUser(service, app.info) : user,
    services: _.compact([service]),
    hijack: false,
    autoRemove: true,
  },
});

/**
 * Runs a docker exec command for a tooling task.
 * @param {object} injected App or lando runtime object.
 * @param {Array<string|null>} stdio stdio configuration.
 * @param {object} [datum] Engine task data.
 * @returns {Promise} Promise for the shell execution.
 */
exports.dockerExec = (injected, stdio, datum = {}) => {
  // Depending on whether injected is the app or lando
  const dockerBin = injected.config.dockerBin || injected._config.dockerBin;
  const opts = {mode: 'attach', cstdio: stdio};
  // Run run run
  return injected.shell.sh(getExecOpts(dockerBin, datum).concat(datum.cmd), opts);
};

/**
 * Normalizes tooling task config into task metadata.
 * @param {object} config Tooling config keyed by task name.
 * @param {object} app App instance.
 * @returns {object[]} Tooling tasks.
 */
exports.getToolingTasks = (config, app) => _(config)
    .map((task, name) => _.merge({}, task, {app, name}))
    .filter(task => _.isObject(task))
    .value();

/**
 * Resolves tooling config into executable command configs.
 * @param {Array<string|object>} cmd Tooling commands.
 * @param {string} service Default service name.
 * @param {object} [options] Tooling option metadata.
 * @param {object} [answers] Interactive answers.
 * @returns {object[]} Parsed tooling command configs.
 */
exports.parseConfig = (cmd, service, options = {}, answers = {}) => _(cmd)
// Put into an object so we can handle "multi-service" tooling
    .map(cmd => parseCommand(cmd, service))
// Handle dynamic services
    .map(config => handleDynamic(config, options, answers))
// Add in any argv extras if they've been passed in
    .map(config => handleOpts(config, handlePassthruOpts(options, answers)))
// Wrap the command in /bin/sh if that makes sense
    .map(config => _.merge({}, config, {command: escape(config.command, true, config.args)}))
// Add any args to the command and compact to remove undefined
    .map(config => _.merge({}, config, {command: _.compact(config.command.concat(config.args))}))
// Put into an object
    .value();

/**
 * Builds default metadata for a tooling definition.
 * @param {object} [options] Tooling definition overrides.
 * @returns {object} Tooling defaults.
 */
exports.toolingDefaults = (options = {}) => {
  const {
    name,
    app = {},
    cmd = name,
    dir,
    description = `Runs ${name} commands`,
    env = {},
    options: toolOptions = {},
    service = '',
    stdio = ['inherit', 'pipe', 'pipe'],
    user = null,
  } = options;

  return {
    name,
    app,
    cmd: !_.isArray(cmd) ? [cmd] : cmd,
    dir,
    env,
    describe: description,
    options: toolOptions,
    service,
    stdio,
    user,
  };
};
