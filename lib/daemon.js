'use strict';

// Modules
const Cache = require('./cache');
const env = require('./env');
const Events = require('./events');
const Log = require('./logger');
const Promise = require('./promise');
const Shell = require('./shell');

/*
 * Creates a new Daemon instance.
 */
module.exports = class LandoDaemon {
  constructor(
      cache = new Cache(),
      events = new Events(),
      docker = env.getDockerExecutable(),
      log = new Log(),
      context = 'node',
      compose = env.getComposeExecutable(),
  ) {
    this.cache = cache;
    this.compose = compose;
    this.context = context;
    this.docker = docker;
    this.events = events;
    this.log = log;
  };

  /*
   * Tries to active the docker engine/daemon.
   *
   * @since 3.0.0
   * @fires pre_engine_up
   * @fires post_engine_up
   * @return {Promise} A Promise.
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
  };

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

  /*
   * Helper to determine up and down
   * NOTE: we now assume that docker has been installed by this point
   * this means we also assume whatever necessary installation checks have been
   * performed and dockers existence verified
   */
  isUp() {
    return Promise.resolve(true);
  };

  /*
   * Helper to get the versions of the things we need
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
          } catch (e) {
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
  };
};
