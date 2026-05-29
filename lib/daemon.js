'use strict';

// Modules
const Cache = require('./cache');
const env = require('./env');
const Events = require('./events');
const Log = require('./logger');
// eslint-disable-next-line no-redeclare
const Promise = require('./promise');
const Shell = require('./shell');

/**
 * Represents the docker daemon abstraction used by Lando.
 */
module.exports = class LandoDaemon {
  /**
  * @param {Cache} [cache] Cache instance.
  * @param {Events} [events] Event emitter.
   * @param {string|false} [docker] Docker binary path.
  * @param {Log} [log] Logger instance.
   * @param {string} [context] Runtime context label.
   * @param {string|false} [compose] Compose binary path.
   */
  constructor(
      cache = new Cache(),
      events = new Events(),
      docker = env.getDockerExecutable(),
      log = new Log(),
      context = 'node',
      compose = env.getComposeExecutable(),
  ) {
    /** @type {Cache} */
    this.cache = cache;
    /** @type {string|false} */
    this.compose = compose;
    /** @type {string} */
    this.context = context;
    /** @type {string|false} */
    this.docker = docker;
    /** @type {Events} */
    this.events = events;
    /** @type {Log} */
    this.log = log;
  }

  /*
   * Tries to active the docker engine/daemon.
   *
   * @since 3.0.0
   * @fires pre_engine_up
   * @fires post_engine_up
  * @returns {Promise} A Promise.
   */
  up() {
    /*
     * Not officially documented event that allows you to do some things before
     * the docker engine is booted up.
     *
     * @since 3.0.0
     * @event pre_engine_up
     */
    return this.events.emit('pre-engine-up')
    /*
     * Not officially documented event that allows you to do some things after
     * the docker engine is booted up.
     *
     * @since 3.0.0
     * @event post_engine_up
     */
        .then(() => this.events.emit('post-engine-up'));
  }

  /**
   * Emits daemon shutdown lifecycle events.
   * @returns {Promise} A Promise.
   */
  down() {
    /*
     * Event that allows you to do some things after the docker engine is booted
     * up.
     *
     * @since 3.0.0
     * @event pre_engine_down
     */
    return this.events.emit('pre-engine-down')
    /*
     * Event that allows you to do some things after the docker engine is booted
     * up.
     *
     * @since 3.0.0
     * @event post_engine_down
     */
        .then(() => this.events.emit('post-engine-down'));
  }

  /**
   * Reports whether the daemon is considered available.
   * @returns {Promise<boolean>} Promise resolving to the daemon state.
   */
  isUp() {
    return Promise.resolve(true);
  }

  /**
   * Queries Docker and Compose version information.
   * @returns {Promise<{engine: string, composePlugin: string, compose: string}>} Version data.
   */
  getVersions() {
    return Promise.all([
      Shell.exec([`"${this.docker}"`, 'info', '--format', 'json'], {silent: true}),
      Shell.exec([`"${this.compose}"`, 'version', '--short'], {silent: true}),
    ])
        .then(data => {
          let composePluginVersion = '';
          let dockerData;
          try {
            dockerData = JSON.parse(data[0].stdout);
          } catch {
            dockerData = {};
            console.error(data[0].stdout);
          }
          const plugins = dockerData.ClientInfo?.Plugins;
          if (Array.isArray(plugins)) {
            const composePlugin = plugins.find(plugin => plugin.Name === 'compose');
            composePluginVersion = composePlugin?.Version ?? '';
          }
          return {
            engine: dockerData.ServerVersion ?? '',
            composePlugin: composePluginVersion,
            compose: data[1].stdout.trim(),
          };
        });
  }
};
