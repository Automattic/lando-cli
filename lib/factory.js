'use strict';

// Modules
const _ = require('lodash');
const fs = require('fs');
const utils = require('./utils');

/**
 * A registered builder entry in the factory.
 * @typedef {object} FactoryRegistryEntry
 * @property {string} name Builder name.
 * @property {function((object|null), object): object} builder Builder constructor or factory.
 */

/**
 * Base compose service used by generated service definitions.
 */
const dockerCompose = class ComposeService {
  /**
   * @param {string} id Compose group identifier.
   * @param {object} [info] Metadata about the compose group.
   * @param {...object} sources Compose source fragments.
   */
  constructor(id, info = {}, ...sources) {
    /** @type {string} */
    this.id = id;
    /** @type {object} */
    this.info = info;
    /** @type {object[]} */
    this.data = _(sources).map(source => _.merge({}, source, {})).value();
  };
};

/**
 * Base recipe wrapper used by generated app recipes.
 */
const landoRecipe = class LandoRecipe {
  /**
   * @param {string} id Recipe identifier.
   * @param {object} [config] Recipe configuration.
   */
  constructor(id, config = {}) {
    // Move our config into the userconfroot if we have some
    // NOTE: we need to do this because on macOS and Windows not all host files
    // are shared into the docker vm

    if (fs.existsSync(config.confSrc)) utils.moveConfig(config.confSrc, config.confDest);
    /** @type {string} */
    this.id = id;
    /** @type {object} */
    this.config = {
      proxy: config.proxy,
      services: config.services,
      tooling: config.tooling,
    };
  };
};

/**
 * Creates registry-backed builders for compose services and recipes.
 */
module.exports = class Factory {
  // @TODO add recipe base class as well?
  /**
   * @param {FactoryRegistryEntry[]} [classes] Initial factory registry.
   */
  constructor(classes = [
    {name: '_compose', builder: dockerCompose},
    {name: '_recipe', builder: landoRecipe},
  ]) {
    /** @type {FactoryRegistryEntry[]} */
    this.registry = classes;
  };

  /**
   * Registers a new builder derived from an optional parent builder.
   * @param {object} entry Builder definition.
   * @param {string} entry.name Builder name.
   * @param {function((object|null), object): object} entry.builder Builder factory.
   * @param {object} [entry.config] Builder configuration.
   * @param {string|null} [entry.parent] Parent builder name.
   * @returns {object|undefined} Resolved builder instance.
   */
  add({name, builder, config = {}, parent = null}) {
    this.registry.push({name, builder: builder(this.get(parent), config)});
    return this.get(name);
  };

  /**
   * Retrieves a specific builder or the full registry.
   * @param {string} [name] Builder name.
   * @returns {object|FactoryRegistryEntry[]|undefined} Matching builder or the registry.
   */
  get(name = '') {
    return (!_.isEmpty(name)) ? _.find(this.registry, {name}).builder : this.registry;
  };
};
