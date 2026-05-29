'use strict';

// Modules
const _ = require('lodash');
const getUser = require('./../../../lib/utils').getUser;

/**
 * Resolves the default service name for an event command.
 * @param {object} data Event command metadata.
 * @returns {string} Service name.
 */
const getDefaultService = data => {
  if (_.has(data, 'service')) {
    if (_.startsWith(data.service, ':')) {
      const option = _.trimStart(data.service, ':');
      return _.get(data, `options.${option}.default`, 'appserver');
    } else {
      return _.get(data, 'service');
    }
  } else {
    return 'appserver';
  }
};

/**
 * Extracts the command string or argv from an event command definition.
 * @param {string|object} cmd Event command definition.
 * @returns {string|string[]} Command payload.
 */
const getCommand = cmd => typeof cmd === 'object' ? cmd[getFirstKey(cmd)] : cmd;

/**
 * Returns the first key from an object.
 * @param {object} obj Object to inspect.
 * @returns {string|undefined} First key.
 */
const getFirstKey = obj => _.first(_.keys(obj));

/**
 * Resolves the target service for an event command.
 * @param {string|object} cmd Event command definition.
 * @param {object} [data] Event command metadata.
 * @returns {string} Service name.
 */
const getService = (cmd, data = {}) => {
  return typeof cmd === 'object' ? getFirstKey(cmd) : getDefaultService(data);
};

/**
 * Translates event command definitions into engine run tasks.
 * @param {Array<string|object>} cmds Event command definitions.
 * @param {object} app App instance.
 * @param {object} [data] Event command metadata.
 * @returns {object[]} Engine run tasks.
 */
exports.events2Runz = (cmds, app, data = {}) => _.map(cmds, cmd => {
  // Discover the service
  const command = getCommand(cmd);
  const service = getService(cmd, data);
  // Validate the service if we can
  // @NOTE fast engine runs might not have this data yet
  if (app.services && !_.includes(app.services, service)) {
    throw new Error(`This app has no service called ${service}`);
  }
  // Add the build command
  return {
    id: `${app.project}-${service}-1`,
    cmd: ['/bin/sh', '-c', _.isArray(command) ? command.join(' ') : command],
    compose: app.compose,
    project: app.project,
    opts: {
      cstdio: ['inherit', 'pipe', 'pipe'],
      mode: 'attach',
      user: getUser(service, app.info),
      services: [service],
    },
  };
});
