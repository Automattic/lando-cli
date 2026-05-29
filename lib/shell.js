'use strict';

// Modules
const _ = require('lodash');
const child = require('child_process');
const Log = require('./logger');
const _shell = require('shelljs');
const path = require('path');
const parse = require('yargs-parser');
// eslint-disable-next-line no-redeclare
const Promise = require('./promise');
const {PassThrough} = require('stream');

/**
 * Parses a command into running-process metadata.
 * @param {object} meta Parsed argv metadata.
 * @returns {object} Normalized process metadata.
 */
const parseCmd = meta => _.merge({}, meta, {
  bin: _.trimEnd(path.basename(_.first(meta._), '"')),
  cmd: meta._[1],
  args: _.drop(meta._, 2),
});

/**
 * Builds a running-process record.
 * @param {object} [options] Process options.
 * @param {string|string[]} [options.cmd] Command argv.
 * @param {string} [options.id] Process id.
 * @param {string} [options.mode] Execution mode.
 * @param {object} [options.process] Child process instance.
 * @returns {object} Running-process record.
 */
const addCommand = ({cmd, id, mode = 'exec', process = {}} = {}) => _.merge({},
    parseCmd(parse(cmd)), {id, mode, process},
);

/**
 * Promisifies shelljs exec.
 * @param {string[]} cmd Command argv.
 * @param {object} opts Exec options.
 * @returns {Promise<{code: number, stdout: string, stderr: string}>} Collected results.
 */
const exec = (cmd, opts) => new Promise(resolve => {
  _shell.exec(cmd.join(' '), opts, (code, stdout, stderr) => {
    resolve({code, stdout, stderr});
  });
});

/**
 * Collects output from a spawned child process.
 * @param {object} run Child process instance.
 * @param {{stdio: string|string[]}} options Spawn stdio options.
 * @param {boolean} [silent] Whether process output should be suppressed.
 * @param {object} shell Shell instance.
 * @param {string} [stdout] Collected stdout.
 * @param {string} [stderr] Collected stderr.
 * @returns {Promise<{code: number, stdout: string, stderr: string}>} Collected results.
 */
const spawn = (run, {stdio}, silent = false, shell, stdout = '', stderr = '') => {
  // Run the spawn
  return new Promise(resolve => {
    if (stdio === 'pipe' || stdio[1] === 'pipe') {
      run.stdout.on('data', buffer => {
        shell.stdout.write(buffer);
        if (!silent) process.stdout.write(buffer);
        stdout = stdout + String(buffer);
      });
    }
    if (stdio === 'pipe' || stdio[2] === 'pipe') {
      run.stderr.on('data', buffer => {
        shell.stderr.write(buffer);
        if (!silent) process.stderr.write(buffer);
        stderr = stderr + String(buffer);
      });
    }
    run.on('error', buffer => {
      stderr = stderr + String(buffer);
    });
    run.on('close', code => {
      resolve({code, stdout, stderr});
    });
  });
};

// We make this module into a function so we can pass in a logger
module.exports = class Shell {
  /**
   * @param {Log} [log] Logger instance.
   */
  constructor(log = new Log()) {
    /** @type {Log} */
    this.log = log;
    /** @type {object[]} */
    this.running = [];
    /** @type {PassThrough} */
    this.stdout = new PassThrough();
    /** @type {PassThrough} */
    this.stderr = new PassThrough();
  }

  /**
   * Gets running processes.
   * @since 3.0.0
   * @alias lando.shell.get
   * @returns {object[]} An array of the currently running processes.
   */
  get() {
    return this.running;
  }

  /**
   * Runs a command.
   *
   * This is an abstraction method that:
   *
   *  1. Delegates to either node's native `spawn` or `exec` methods.
   *  2. Promisifies the calling of these function
   *  3. Handles `stdout`, `stdin` and `stderr`
   * @since 3.0.0
   * @alias lando.shell.sh
   * @see [extra exec options](https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback)
   * @see [extra spawn options](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options)
   * @param {string[]} cmd The command to run as elements in an array.
   * @param {object} [opts] Options to help determine how the exec is run.
   * @param {string} [opts.mode] The mode to run in.
   * @param {boolean} [opts.detached] Whether we are running in detached mode or not (deprecated).
   * @param {string} [opts.cwd] The directory to run the command from.
   * @param {string|string[]} [opts.cstdio] stdio setting for spawn mode.
   * @param {boolean} [opts.silent] Whether process output should be suppressed.
   * @returns {Promise<string>} A promise with collected results if applicable.
   * @example
   * // Run a command in collect mode
   * return lando.shell.sh(['ls', '-lsa', '/'], {mode: 'collect'})
   *
   * // Catch and log any errors
   * .catch(err => {
   *   lando.log.error(err);
   * })
   *
   * // Print the collected results of the command
   * .then(results => {
   *   console.log(results);
   * });
   */
  sh(cmd, {mode = 'exec', detached = false, cwd = process.cwd(), cstdio = 'inherit', silent = false} = {}) {
    // Log more because this shit important!
    const id = _.uniqueId('pid');
    // Basically just remove the options so things are readable in debug mode
    const strippedCmd = _.compact(parse(cmd)._.concat(parse(cmd).c)).join(' ');
    this.log.debug('process %s running %s', id, strippedCmd, {cstdio, silent, mode, detached});
    this.log.silly('process %s full command, running', id, parse(cmd));

    // Promise it
    return Promise.try(() => {
      // Immediately exec if we can
      if (mode === 'exec' && detached === false) {
        // Add a record of this process while its running
        // @NOTE: sadly we can't really do much here in terms of manipulating the process
        this.running.push(addCommand({cmd, id, mode}));
        return exec(cmd, _.merge({}, {silent: true}, {cwd, detached, mode}));
      }

      // Determine stdio
      const stdio = {stdio: cstdio};
      // Get the run spawn so we can add it
      const run = child.spawn(_.first(cmd), _.tail(cmd), _.merge({}, {detached, cwd}, stdio));
      // Add a record of this process while its running
      this.running.push(addCommand({cmd, id, mode, process: run}));
      return spawn(run, stdio, silent, this);
    })

    // Assess the results
        .then(({code, stdout, stderr}) => {
          // if this is an error and stderr is empty use the last few lines of STDOUT
          if (code !== 0 && _.isEmpty(stderr)) {
            stderr = stdout.trim();
          }
          // Log
          this.log.debug('process %s finished with exit code %s', id, code);
          this.log.silly('process %s had output', id, {stdout, stderr});
          // Return
          _.remove(this.running, proc => proc.id === id);
          const msg = `${cmd} failed with exit code ${code}\n:${stderr}`;
          return (code !== 0) ? Promise.reject(new Error(msg)) : Promise.resolve(stdout);
        });
  }

  /**
   * Returns the path of a specific command or binary.
   * @since 3.0.0
   * @function
   * @alias lando.shell.which
   * @param {string} cmd A command to search for.
   * @returns {string|null} The path to the command or null.
   * @example
   * // Determine the location of the 'docker' command
   * const which = lando.shell.which(DOCKER_EXECUTABLE);
   */
  which(cmd) {
    return _shell.which(cmd);
  }
};

module.exports.exec = exec;
