'use strict';

// Modules
const _ = require('lodash');
// eslint-disable-next-line no-redeclare
const Promise = require('./promise');
const utils = require('./utils');

/**
 * Removes run-specific options before delegating to start/stop operations.
 * @param {import('./engine').EngineTaskData} datum Engine task data.
 * @returns {import('./engine').EngineTaskData} Cloned task data without incompatible run options.
 */
const stripRun = datum => {
  const newDatum = _.cloneDeep(datum);
  if (_.has(newDatum, 'opts.user')) delete newDatum.opts.user;
  if (_.has(newDatum, 'opts.workdir')) delete newDatum.opts.workdir;
  if (_.has(newDatum, 'opts.environment')) delete newDatum.opts.environment;
  if (_.has(newDatum, 'opts.detach')) delete newDatum.opts.detach;
  return newDatum;
};

/**
 * Runs an operation over one or more task entries in series.
 * @param {import('./engine').EngineTaskData|import('./engine').EngineTaskData[]} data Engine task data.
 * @param {function(import('./engine').EngineTaskData): Promise} run Operation to run for each datum.
 * @returns {Promise} Bluebird promise for the serial operation.
 */
const retryEach = (data, run) => Promise.each(utils.normalizer(data), datum => run(datum));

/**
 * Wraps an engine command with daemon startup and event emission.
 * @param {string} name Engine action name.
 * @param {import('./daemon')} daemon Daemon controller.
 * @param {import('./events')} events Event emitter.
 * @param {import('./engine').EngineTaskData|import('./engine').EngineTaskData[]} data Engine task data.
 * @param {function(import('./engine').EngineTaskData|import('./engine').EngineTaskData[]): Promise} run Action callback.
 * @returns {Promise} Promise for the wrapped action.
 */
exports.eventWrapper = (name, daemon, events, data, run) => daemon.up()
    .then(() => events.emit(`pre-engine-${name}`, data))
    .then(() => run(data))
    .tap(() => events.emit(`post-engine-${name}`, data));

/**
 * Routes pull requests through compose.
 * @param {import('./engine').EngineComposeTaskData|import('./engine').EngineComposeTaskData[]} data Compose task data.
 * @param {import('./engine').ComposeCommandRunner} compose Compose command runner.
 * @returns {Promise} Promise for the pull operation.
 */
exports.pull = (data, compose) => retryEach(data, datum => compose('pull', datum));

/**
 * Pulls images and then builds compose services.
 * @param {import('./engine').EngineComposeTaskData|import('./engine').EngineComposeTaskData[]} data Compose task data.
 * @param {import('./engine').ComposeCommandRunner} compose Compose command runner.
 * @returns {Promise} Promise for the build workflow.
 */
exports.build = (data, compose) => {
  // Pull
  return retryEach(data, datum => compose('pull', datum))
  // then build
      .then(() => retryEach(data, datum => compose('build', datum)));
};

/**
 * Removes compose or docker resources for the provided task data.
 * @param {import('./engine').EngineTaskData|import('./engine').EngineTaskData[]} data Engine task data.
 * @param {import('./engine').ComposeCommandRunner} compose Compose command runner.
 * @param {import('./docker')} docker Docker client wrapper.
 * @returns {Promise} Promise for the destroy workflow.
 */
exports.destroy = (data, compose, docker) => retryEach(data, datum => {
  return (datum.compose) ? compose('remove', datum) : docker.remove(utils.getId(datum), datum.opts);
});

/**
 * Checks whether the target compose service or container exists.
 * @param {import('./engine').EngineTaskData} data Engine task data.
 * @param {import('./engine').ComposeCommandRunner} compose Compose command runner.
 * @param {import('./docker')} docker Docker client wrapper.
 * @param {string[]} [ids] Reused id accumulator.
 * @returns {Promise} Promise resolving to whether the target exists.
 */
exports.exists = (data, compose, docker, ids = []) => {
  if (data.compose) return compose('getId', data).then(id => !_.isEmpty(id));
  else {
    return docker.list()
        .each(container => {
          ids.push(container.id);
          ids.push(container.name);
        })
        .then(() => _.includes(ids, utils.getId(data)));
  }
};

/**
 * Streams logs for compose services.
 * @param {import('./engine').EngineComposeTaskData|import('./engine').EngineComposeTaskData[]} data Compose task data.
 * @param {import('./engine').ComposeCommandRunner} compose Compose command runner.
 * @returns {Promise} Promise for the logs operation.
 */
exports.logs = (data, compose) => retryEach(data, datum => compose('logs', datum));

/**
 * Runs commands inside services, starting or stopping containers as needed.
 * @param {import('./engine').EngineRunTaskData|import('./engine').EngineRunTaskData[]} data Engine task data.
 * @param {import('./engine').ComposeCommandRunner} compose Compose command runner.
 * @param {import('./docker')} docker Docker client wrapper.
 * @param {boolean} [started] Whether the target is already running.
 * @returns {Promise} Promise for the run workflow.
 */
exports.run = (data, compose, docker, started = true) => Promise.mapSeries(utils.normalizer(data), datum => {
  // Merge in default cli envars
  datum.opts.environment = utils.getCliEnvironment(datum.opts.environment);
  // Escape command if it is still a string
  if (_.isString(datum.cmd)) datum.cmd = utils.shellEscape(datum.cmd, true);
  return docker.isRunning(utils.getId(datum)).then(isRunning => {
    started = isRunning;
    if (!isRunning) {
      return exports.start(stripRun(datum), compose).then(() => {
        // if this is a prestart build step and its not the last one make sure we set started = true
        // this prevents us from having to stop and then restart the container during builds
        started = _.get(datum, 'opts.prestart', false) && !_.get(datum, 'opts.last', false);
      });
    }
  })
  // Why were we still using dockerode for this on non-win?
      .then(() => compose('run', _.merge({}, datum, {opts: {cmd: datum.cmd, id: datum.id}})))
  // Stop if we have to
      .tap(() => {
        // If this is the last step of a build we need to make sure all the containers are stopped
        if (_.get(datum, 'opts.prestart', false) && _.get(datum, 'opts.last', false)) delete datum.opts.services;
        // Stop if we have to and remove build flags so lando doesn't get tripped up downstream
        if (!started || _.get(datum, 'opts.last', false)) return exports.stop(stripRun(datum), compose, docker);
      })
  // Destroy if we have to
      .tap(() => {
        if (!started && _.get(datum, 'opts.autoRemove', false)) {
          return exports.destroy(stripRun(datum), compose, docker);
        }
      });
});

/**
 * Inspects the running container backing a compose or docker task.
 * @param {import('./engine').EngineTaskData} data Engine task data.
 * @param {import('./engine').ComposeCommandRunner} compose Compose command runner.
 * @param {import('./docker')} docker Docker client wrapper.
 * @returns {Promise|undefined} Promise for the scan operation.
 */
exports.scan = (data, compose, docker) => {
  if (data.compose) {
    return compose('getId', data).then(id => {
      if (!_.isEmpty(id)) {
        // @todo: this assumes that the container we want
        // is probably the first id returned. What happens if that is
        // not true or we need other ids for this service?
        const ids = id.split('\n');
        return docker.scan(_.trim(ids.shift()));
      }
    });
  } else if (utils.getId(data)) {
    return docker.scan(utils.getId(data));
  }

  return undefined;
};

/**
 * Starts compose services.
 * @param {import('./engine').EngineComposeTaskData|import('./engine').EngineComposeTaskData[]} data Compose task data.
 * @param {import('./engine').ComposeCommandRunner} compose Compose command runner.
 * @returns {Promise} Promise for the start operation.
 */
exports.start = (data, compose) => retryEach(data, datum => compose('start', datum));

/**
 * Stops compose or standalone docker containers.
 * @param {import('./engine').EngineTaskData|import('./engine').EngineTaskData[]} data Engine task data.
 * @param {import('./engine').ComposeCommandRunner} compose Compose command runner.
 * @param {import('./docker')} docker Docker client wrapper.
 * @returns {Promise} Promise for the stop operation.
 */
exports.stop = (data, compose, docker) => retryEach(data, datum => {
  return (datum.compose) ? compose('stop', datum) : docker.stop(utils.getId(datum));
});
