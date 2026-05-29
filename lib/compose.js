'use strict';

/** @type {Record<string, string>} */
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

/** @type {Record<string, object>} */
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
 * @param {string} run The command to run
 * @param {object} [opts] The options to merge
 * @returns {object} The merged options
 */
const mergeOpts = (run, opts = {}) => ({...defaultOptions[run], ...opts});

/**
 * Parse docker-compose options
 * @param {object} [opts] The options to parse
 * @returns {string[]} The parsed options
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
 * @param {string} run The command to run
 * @param {string} name The name of the project
 * @param {string[]} compose The array of compose files
 * @param {object} args Command args.
 * @param {string[]} [args.services] Target services.
 * @param {string|string[]} [args.cmd] Command argv.
 * @param {object} [opts] The options to pass to the command
 * @returns {string[]} The constructed command
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
 * @param {string} run The command to run
 * @param {string} name The name of the project
 * @param {string[]} compose The array of compose files
 * @param {object} [opts] The options to pass to the command
 * @param {string[]} [opts.pullable] Services that may be pulled.
 * @param {string[]} [opts.local] Services that should not be pulled.
 * @param {boolean} [opts.purge] Whether removal should purge networks and volumes.
 * @param {boolean} [opts.pull] Whether images should be pulled during build.
 * @param {string[]} [opts.services] Target services.
 * @param {string[]} [opts.cmd] Command argv passed to the service.
 * @param {Array} [opts.cstdio] Custom stdio configuration.
 * @param {string} [opts.mode] Shell execution mode.
 * @param {boolean} [opts.prestart] Whether this runs before startup.
 * @param {boolean} [opts.last] Whether this is the final step in a sequence.
 * @param {boolean} [opts.detach] Whether the process should detach.
 * @param {boolean} [opts.silent] Whether shell output should be silenced.
 * @param {string} [opts.user] User to run the command as.
 * @param {string} [opts.id] Target container id.
 * @param {Record<string,string>} [opts.environment] Extra environment variables.
 * @returns {object} The shell object
 */
const buildShell = (run, name, compose, opts = {}) => ({
  cmd: buildCmd(run, name, compose, {services: opts.services, cmd: opts.cmd}, mergeOpts(run, opts)),
  opts: {mode: 'spawn', cstdio: opts.cstdio, silent: opts.silent},
});

/**
 * Builds a docker compose build shell descriptor.
 * @param {string[]} compose Compose files.
 * @param {string} project Project name.
 * @param {object} [opts] Build options.
 * @returns {object} Shell descriptor.
 */
exports.build = (compose, project, opts = {}) => {
  return buildShell('build', project, compose, {pull: !opts.local});
};

/**
 * Builds a docker compose ps shell descriptor.
 * @param {string[]} compose Compose files.
 * @param {string} project Project name.
 * @param {object} [opts] Ps options.
 * @returns {object} Shell descriptor.
 */
exports.getId = (compose, project, opts = {}) => buildShell('ps', project, compose, opts);

/**
 * Builds a docker compose logs shell descriptor.
 * @param {string[]} compose Compose files.
 * @param {string} project Project name.
 * @param {object} [opts] Log options.
 * @returns {object} Shell descriptor.
 */
exports.logs = (compose, project, opts = {}) => buildShell('logs', project, compose, opts);

/**
 * Builds a docker compose pull shell descriptor.
 * @param {string[]} compose Compose files.
 * @param {string} project Project name.
 * @param {object} [opts] Pull options.
 * @returns {object} Shell descriptor.
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

/**
 * Builds a docker compose remove or down shell descriptor.
 * @param {string[]} compose Compose files.
 * @param {string} project Project name.
 * @param {object} [opts] Remove options.
 * @returns {object} Shell descriptor.
 */
exports.remove = (compose, project, opts = {}) => {
  const subCmd = (opts.purge) ? 'down' : 'rm';
  return buildShell(subCmd, project, compose, opts);
};

/**
 * Builds a docker compose exec shell descriptor.
 * @param {string[]} compose Compose files.
 * @param {string} project Project name.
 * @param {object} [opts] Exec options.
 * @returns {object} Shell descriptor.
 */
exports.run = (compose, project, opts = {}) => buildShell('exec', project, compose, opts);

/**
 * Builds a docker compose up shell descriptor.
 * @param {string[]} compose Compose files.
 * @param {string} project Project name.
 * @param {object} [opts] Up options.
 * @returns {object} Shell descriptor.
 */
exports.start = (compose, project, opts = {}) => buildShell('up', project, compose, opts);

/**
 * Builds a docker compose kill shell descriptor.
 * @param {string[]} compose Compose files.
 * @param {string} project Project name.
 * @param {object} [opts] Kill options.
 * @returns {object} Shell descriptor.
 */
exports.stop = (compose, project, opts = {}) => buildShell('kill', project, compose, opts);
