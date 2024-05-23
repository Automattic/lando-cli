'use strict';

// Helper object for flags
const composeFlags = {
  background: '--detach',
  detach: '--detach',
  follow: '--follow',
  force: '--force',
  noCache: '--no-cache',
  noRecreate: '--no-recreate',
  noDeps: '--no-deps',
  noTTY: '-T',
  pull: '--pull',
  q: '--quiet',
  recreate: '--force-recreate',
  removeOrphans: '--remove-orphans',
  rm: '--rm',
  timestamps: '--timestamps',
  volumes: '-v',
};

// Default options nad things
const defaultOptions = {
  build: {noCache: false, pull: true},
  down: {removeOrphans: true, volumes: true},
  exec: {detach: false, noTTY: !process.stdin.isTTY},
  kill: {},
  logs: {follow: false, timestamps: false},
  ps: {q: true},
  pull: {},
  rm: {force: true, volumes: true},
  up: {background: true, noRecreate: true, recreate: false, removeOrphans: true},
};

/**
 * Helper to merge options with default
 *
 * @param {string} run The command to run
 * @param {Object} opts The options to merge
 * @return {Object} The merged options
 */
const mergeOpts = (run, opts = {}) => ({...defaultOptions[run], ...opts});

/**
 * Parse docker-compose options
 *
 * @param {Object} opts The options to parse
 * @return {Array} The parsed options
 */
const parseOptions = (opts = {}) => {
  const flags = Object.keys(composeFlags).map(key => opts[key] ? composeFlags[key] : '');
  const environment = Object.entries(opts.environment || {}).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
  const user = opts.user ? ['--user', opts.user] : [];
  const workdir = opts.workdir ? ['--workdir', opts.workdir] : [];
  const ep = opts.entrypoint ?? [];
  const entrypoint = (Array.isArray(ep) ? ep : [ep]).map(entrypoint => ['--entrypoint', entrypoint]);
  return [flags, environment, user, workdir, entrypoint].flat().filter(Boolean);
};

/**
 * Helper to standardize construction of docker commands
 *
 * @param {string} run The command to run
 * @param {string} name The name of the project
 * @param {string[]} compose The array of compose files
 * @param {Object} opts The options to pass to the command
 * @return {Array} The constructed command
 */
const buildCmd = (run, name, compose, {services, cmd}, opts = {}) => {
  if (!name) throw new Error('Need to give this composition a project name!');
  // @TODO: we need to strip out opts.user on start/stop because we often get it as part of run
  const project = ['--project-name', name];
  const files = compose.flatMap(unit => ['--file', unit]);
  const options = parseOptions(opts);
  const argz = [services, cmd].flat().filter(Boolean);
  return [project, files, run, options, argz].flat();
};

/**
 * Helper to build build object needed by lando.shell.sh
 *
 * @param {string} run The command to run
 * @param {string} name The name of the project
 * @param {string[]} compose The array of compose files
 * @param {Object} opts The options to pass to the command
 * @param {string[]} [opts.pullable]
 * @param {string[]} [opts.local]
 * @param {boolean} [opts.purge]
 * @param {boolean} [opts.pull]
 * @param {string[]} [opts.services]
 * @param {string[]} [opts.cmd]
 * @param {Array} [opts.cstdio]
 * @param {string} [opts.mode]
 * @param {boolean} [opts.prestart]
 * @param {boolean} [opts.last]
 * @param {boolean} [opts.detach]
 * @param {boolean} [opts.silent]
 * @param {string} [opts.user]
 * @param {string} [opts.id]
 * @param {Record<string,string>} [opts.environment]
 * @return {Object} The shell object
 */
const buildShell = (run, name, compose, opts = {}) => ({
  cmd: buildCmd(run, name, compose, {services: opts.services, cmd: opts.cmd}, mergeOpts(run, opts)),
  opts: {mode: 'spawn', cstdio: opts.cstdio, silent: opts.silent},
});

/*
 * Run docker compose build
 */
exports.build = (compose, project, opts = {}) => {
  return buildShell('build', project, compose, {pull: !opts.local});
};

/*
 * Run docker compose ps
 */
exports.getId = (compose, project, opts = {}) => buildShell('ps', project, compose, opts);

/*
 * Run docker compose logs
 */
exports.logs = (compose, project, opts = {}) => buildShell('logs', project, compose, opts);

/*
 * Run docker compose pull
 */
exports.pull = (compose, project, opts = {}) => {
  /** @type {string[]} */
  const pull = (opts.pullable || [])
    .filter(service => !opts.services || opts.services.includes(service));
  if (pull.length) {
    return buildShell('pull', project, compose, {services: pull});
  }

  return buildShell('ps', project, compose, {});
};

/*
 * Run docker compose remove
 */
exports.remove = (compose, project, opts = {}) => {
  const subCmd = (opts.purge) ? 'down' : 'rm';
  return buildShell(subCmd, project, compose, opts);
};

/*
 * Run docker compose run
 */
exports.run = (compose, project, opts = {}) => buildShell('exec', project, compose, opts);

/*
 * You can do a create, rebuild and start with variants of this
 */
exports.start = (compose, project, opts = {}) => buildShell('up', project, compose, opts);

/*
 * Run docker compose kill
 */
exports.stop = (compose, project, opts = {}) => buildShell('kill', project, compose, opts);
