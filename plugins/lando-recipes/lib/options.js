'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const utils = require('./../../../lib/utils');

/**
 * Builds source-related init options.
 * @param {object[]} sources Available source definitions.
 * @returns {object} Source option config.
 */
const coreOpts = sources => ({
  source: {
    describe: 'The location of your apps code',
    choices: _.map(sources, 'name'),
    alias: ['src'],
    string: true,
  },
});

/** @type {object} */
const defaultOpts = {
  destination: {
    hidden: true,
    alias: ['dest', 'd'],
    string: true,
  },
  full: {
    describe: 'Dump a lower level lando file',
    default: false,
    boolean: true,
  },
  option: {
    alias: ['o'],
    describe: 'Merge additional KEY=VALUE pairs into your recipes config',
    array: true,
  },
  yes: {
    describe: 'Auto answer yes to prompts',
    alias: ['y'],
    default: false,
    boolean: true,
  },
};

// Helper to get source option conflicts
/*
const getConflicts = (name, all, lando) => _(all)
  .filter(one => _.has(one, 'options'))
  .flatMap(one => _.keys(one.options(lando)))
  .thru(options => _.difference(options, _.keys(_.find(all, {name}).options(lando))))
  .value();
*/

/** @type {object} */
const nameOpts = {
  describe: 'The name of the app',
  string: true,
};

/**
 * Builds recipe selection options.
 * @param {string[]} recipes Available recipe names.
 * @returns {object} Recipe option config.
 */
const recipeOpts = recipes => ({
  describe: 'The recipe with which to initialize the app',
  choices: recipes,
  alias: ['r'],
  string: true,
});

/** @type {object} */
const webrootOpts = {
  describe: 'Specify the webroot relative to app root',
  string: true,
};

/**
 * Builds dynamic init options that depend on recipe or source choices.
 * @param {string[]} recipes Available recipe names.
 * @returns {object} Dynamic option config.
 */
const auxOpts = recipes => ({name: nameOpts, recipe: recipeOpts(_.orderBy(recipes)), webroot: webrootOpts});

/**
 * Builds the base init option set.
 * @param {string[]} [recipes] Available recipe names.
 * @param {object[]} [sources] Available source definitions.
 * @returns {object} Base option config.
 */
exports.baseOpts = (recipes = [], sources = []) => _.merge(defaultOpts, coreOpts(sources), auxOpts(recipes));

/**
 * Finds a named init plugin config.
 * @param {object[]} [data] Plugin config entries.
 * @param {string} name Plugin name.
 * @returns {object|undefined} Matching plugin config.
 */
exports.getConfig = (data = [], name) => _.find(data, {name});

/**
 * Merges dynamic option config from all init plugins.
 * @param {object[]} all Init plugin configs.
 * @param {import('../../../lib/lando')} lando Lando runtime instance.
 * @param {object} [options] Existing options.
 * @returns {object} Merged option config.
 */
exports.getConfigOptions = (all, lando, options = {}) => {
  _.forEach(all, one => {
    if (_.has(one, 'options')) {
      _.forEach(one.options(lando), (option, key) => {
        // @TODO: get auto conflict assignment to work properly
        // @NOTE: maybe it doesn't and we should just do this manually?
        // _.set(options, `${key}.conflicts`, getConflicts(one.name, all, lando));
      });
      options = _.merge({}, one.options(lando), options);
    }
  });
  return options;
};

/**
 * Normalizes initial init command options.
 * @param {object} options Parsed init options.
 * @returns {object} Normalized init options.
 */
exports.parseOptions = options => {
  // We set this here instad of as a default option because of our task caching
  if (!_.has(options, 'destination')) options.destination = process.cwd();
  // Generate a machine name for the app.
  options.name = utils.appMachineName(options.name);
  // Get absolute path of destination
  options.destination = path.resolve(options.destination);
  // Create directory if needed
  if (!fs.existsSync(options.destination)) {
    fs.mkdirSync(options.destination, {recursive: true});
  }
  // Set node working directory to the destination
  // @NOTE: is this still needed?
  process.chdir(options.destination);
  return options;
};

