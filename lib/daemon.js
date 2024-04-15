'use strict';

// Modules
const _ = require('lodash');
const Cache = require('./cache');
const env = require('./env');
const Events = require('./events');
const Log = require('./logger');
const Promise = require('./promise');
const Shell = require('./shell');
const shell = new Shell();

// Constants
const composeV1Separator = '_';
const composeV2Separator = '-';

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
      shell.sh([`"${this.docker}"`, 'version', '--format', '{{.Server.Version}}']).catch(() => '18.0.0'),
      shell.sh([`"${this.compose}"`, 'version', '--short']).catch(() => '11.0.0'),
    ])
    .then(data => ({
      compose: _.trim(data[1]),
      engine: _.trim(data[0]),
    }));
  };

  getComposeSeparator() {
    return this.compose ? new Promise(resolve => {
      const semver = require('semver');
      this.getVersions().then(versions => {
        const isComposeV1 = semver.lt(versions.compose || '1.0.0', '2.0.0');

        const composeSeparator = isComposeV1 ? composeV1Separator : composeV2Separator;
        resolve(composeSeparator);
      });
    }) : Promise.resolve(composeV1Separator);
  }
};
