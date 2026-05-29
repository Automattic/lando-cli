'use strict';

// Modules
const _ = require('lodash');
const Dockerode = require('dockerode');
const fs = require('fs');
// eslint-disable-next-line no-redeclare
const Promise = require('./promise');
const utils = require('./utils');

/**
 * Invokes a dockerode container method and re-wraps failures with context.
 * @param {object} container Dockerode container instance.
 * @param {string} method Container method to call.
 * @param {string} message Error message template.
 * @param {object} [opts] Method options.
 * @returns {Promise} Promise for the container operation.
 */
const containerOpt = (container, method, message, opts = {}) => container[method](opts).catch(err => {
  throw new Error(err, message, container);
});

/**
 * Checks whether any source path in a list exists on disk.
 * @param {string[]} [files] File paths to inspect.
 * @returns {boolean} Whether at least one source exists.
 */
const srcExists = (files = []) => _.reduce(files, (exists, file) => fs.existsSync(file) || exists, false);

/**
 * Dockerode wrapper with Lando-specific helpers.
 */
module.exports = class Landerode extends Dockerode {
  /**
   * @param {object} [opts] Dockerode connection options.
   * @param {string} [id] Lando instance identifier.
   * @param {typeof Promise} [promise] Promise implementation.
   */
  constructor(opts = {}, id = 'lando', promise = Promise) {
    opts.Promise = promise;
    super(opts);
    /** @type {string} */
    this.id = id;
  }

  /**
   * Creates an attachable internal docker network.
   * @param {string} name Network name.
   * @param {object} [opts] Additional network options.
   * @returns {Promise} Promise for the network creation.
   */
  createNet(name, opts = {}) {
    return this.createNetwork(_.merge({}, opts, {Name: name, Attachable: true, Internal: true}))
    // Wrap errors.
        .catch(err => {
          throw new Error(err, 'Error creating network.');
        });
  }

  /**
   * Inspects a container by id.
   * @param {string} cid Container id.
   * @returns {Promise} Promise for the container inspection payload.
   */
  scan(cid) {
    return containerOpt(this.getContainer(cid), 'inspect', 'Error inspecting container: %j');
  }

  /**
   * Checks whether a container is currently running.
   * @param {string} cid Container id.
   * @returns {Promise} Promise resolving to the running state.
   */
  isRunning(cid) {
    return this.scan(cid)
    // Get the running state
        .then(data => _.get(data, 'State.Running', false))
    // If the container no longer exists, return false since it isn't running.
    // This will prevent a race condition from happening.
    // Wrap errors.
        .catch(err => {
          // This was true for docker composer 1.26.x and below
          if (_.includes(err.message, `No such container: ${cid}`)) return false;
          // This is what it looks like for 1.27 and above
          else if (_.includes(err.message, `no such container -`)) return false;
          // Otherwise throw
          else throw err;
        });
  }

  /**
   * Lists running containers that belong to the current Lando instance.
   * @param {object} [options] Docker list filters and app selectors.
   * @returns {Promise} Promise resolving to normalized Lando containers.
   */
  list(options = {}) {
    return this.listContainers(options)
    // Filter out nulls and undefineds.
        .filter(_.identity)
    // Filter out containers with invalid status/name
        .filter(data => data.Status !== 'Removal In Progress' && !['exited', 'removing', 'dead'].includes(data.State))
        .filter(data => Array.isArray(data.Names) && data.Names.length > 0 && typeof data.Names[0] === 'string')
    // Map docker containers to lando containers.
        .map(container => utils.toLandoContainer(container))
    // Filter out all non-lando containers
        .filter(data => data.lando === true)
    // Filter out other instances
        .filter(data => data.instance === this.id)
    // Remove orphaned app containers
        .filter(container => {
          if (!srcExists(container.src) && container.kind === 'app') {
            return this.remove(container.id, {force: true}).then(() => false);
          } else {
            return true;
          }
        })
    // Filter by app name if an app name was given.
        .then(containers => {
          if (options.project) return _.filter(containers, c => c.app === options.project);
          else if (options.app) return _.filter(containers, c => c.app === utils.dockerComposify(options.app));
          return containers;
        })
    // And finally filter by everything else
        .then(containers => {
          if (!_.isEmpty(options.filter)) {
            return _.filter(containers, _.fromPairs(_.map(options.filter, filter => filter.split('='))));
          } else {
            return containers;
          }
        });
  }

  /**
   * Removes a container.
   * @param {string} cid Container id.
   * @param {object} [opts] Docker remove options.
   * @returns {Promise} Promise for the remove operation.
   */
  remove(cid, opts = {v: true, force: false}) {
    return containerOpt(this.getContainer(cid), 'remove', 'Error removing container: %j', opts);
  }

  /**
   * Stops a container.
   * @param {string} cid Container id.
   * @param {object} [opts] Docker stop options.
   * @returns {Promise} Promise for the stop operation.
   */
  stop(cid, opts = {}) {
    return containerOpt(this.getContainer(cid), 'stop', 'Error stopping container: %j', opts);
  }
};
