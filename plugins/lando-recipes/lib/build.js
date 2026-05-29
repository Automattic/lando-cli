'use strict';

// Modules
const _ = require('lodash');
const path = require('path');
const utils = require('./../../../lib/utils');

/**
 * Builds a purge run descriptor used to clean up failed init containers.
 * @param {object} config Engine run descriptor.
 * @returns {object} Purge run descriptor.
 */
const killRun = config => ({
  id: config.id,
  compose: config.compose,
  project: config.project,
  opts: {
    purge: true,
    mode: 'attach',
  },
});

/**
 * Builds the engine run descriptor for recipe initialization.
 * @param {object} config Run defaults and command metadata.
 * @returns {object} Engine run descriptor.
 */
exports.buildRun = config => ({
  id: config.id,
  compose: config.compose,
  project: config.project,
  cmd: config.cmd,
  opts: {
    mode: 'attach',
    user: config.user,
    services: ['init'],
    autoRemove: config.remove,
  },
});

/**
 * Runs recipe initialization and cleans up failed init containers.
 * @param {import('../../../lib/lando')} lando Lando runtime instance.
 * @param {object} run Engine run descriptor.
 * @returns {Promise} Promise for the recipe init workflow.
 */
exports.run = (lando, run) => lando.engine.run(run).catch(err => {
  return lando.engine.stop(killRun(run))
      .then(() => lando.engine.destroy(killRun(run)))
      .then(() => lando.Promise.reject(err));
});

/**
 * Builds default run settings for recipe initialization.
 * @param {import('../../../lib/lando')} lando Lando runtime instance.
 * @param {object} options Init command options.
 * @returns {object} Default run descriptor.
 */
exports.runDefaults = (lando, options) => {
  // Handle all the compose stuff
  const LandoInit = lando.factory.get('_init');
  const initData = new LandoInit(
      lando.config.userConfRoot,
      lando.config.home,
      options.destination,
      _.cloneDeep(lando.config.appEnv),
      _.cloneDeep(lando.config.appLabels),
      _.get(options, 'initImage', 'ghcr.io/automattic/vip-container-images/lando-util:4'),
  );
  const initDir = path.join(lando.config.userConfRoot, 'init', options.name);
  const initFiles = lando.utils.dumpComposeData(initData, initDir);
  // Start to build out some propz and shiz
  const project = `${lando.config.product}init` + utils.dockerComposify(options.name);
  // Return
  return {
    id: `${project}-init-1`,
    project,
    user: 'www-data',
    compose: initFiles,
    remove: false,
  };
};
