'use strict';

// Modules
const _ = require('lodash');
const fs = require('fs');
const {globSync} = require('glob');
const Log = require('./logger');
const path = require('path');
const {normalizePathForGlob} = require('./utils');
const resolver = (process.platform === 'win32') ? path.win32.resolve : path.posix.resolve;

// List of autoload locations to scan for
const autoLoaders = [
  'app.js',
  'compose',
  'methods',
  'scripts',
  'services',
  'sources',
  'recipes',
  'tasks',
  'types',
];

/**
 * Builds the base plugin metadata for a discovered plugin file.
 * @param {string} file Plugin entry file.
 * @param {string} namespace Plugin namespace prefix.
 * @returns {{name: string, path: string, dir: string}} Plugin metadata.
 */
const buildPlugin = (file, namespace) => ({
  name: _.compact([namespace, _.last(resolver(path.dirname(file)).split(path.sep))]).join('/'),
  path: file,
  dir: path.dirname(file),
});

/**
 * Discovers autoloadable resources within a plugin directory.
 * @param {{dir: string}} plugin Plugin metadata.
 * @returns {object} Discovered autoload entries keyed by basename.
 */
const discoverPlugin = plugin => _(autoLoaders)
    .map(thing => path.join(plugin.dir, thing))
    .filter(path => fs.existsSync(path))
    .keyBy(file => path.basename(_.last(file.split(path.sep)), '.js'))
    .value();

/**
 * Discovers and loads Lando plugins.
 */
module.exports = class Plugins {
  /**
   * @param {object} [log] Logger instance.
   */
  constructor(log = new Log()) {
    /** @type {object[]} */
    this.registry = [];
    /** @type {object} */
    this.log = log;
  };

  /**
   * Finds plugins
   * @since 3.5.0
   * @alias lando.plugins.find
   * @param {Array<string|object>} dirs Directories to scan for plugins.
   * @param {object} [options] Options to pass in.
   * @param {string[]} [options.disablePlugins] Array of plugin names to not load.
   * @param {object[]} [options.plugins] Array of additional plugins to consider loading.
   * @returns {object[]} Array of plugin metadata.
   */
  find(dirs, {disablePlugins = [], plugins = []} = {}) {
    return _(dirs)
    // Map string usage to object and set path
        .map(data => {
        // Map string to object
          if (_.isString(data)) data = {path: path.join(data)};
          // Assemble the dir to scan
          data.dir = path.join(data.path, _.get(data, 'subdir', 'plugins'));
          return data;
        })
    // Start by scanning for plugins
        .filter(data => fs.existsSync(data.dir))
        .flatMap(data => _.merge(
            {}, data,
            {plugins: globSync(
                normalizePathForGlob(path.join(data.dir, '*', 'index.js')),
            ).sort()},
        ))
        .flatMap(data => _.map(data.plugins, plugin => buildPlugin(plugin, data.namespace)))
    // This is a dumb filter to check that external "@lando" plugins have a plugin.yml
    // We do this to prevent things like @lando/vuepress-theme-default-plus from being from being loaded as plugins
    // @NOTE: in Lando 4 we we will explicitly look for a manifest file, that may be plugin.yml or something else.
        .filter(data => {
          if (_.includes(data.dir, path.join('node_modules', '@lando'))) {
            return fs.existsSync(path.join(data.dir, 'plugin.yml'));
          } else if (_.includes(data.dir, path.join('plugins', 'lando-'))) {
            return fs.existsSync(path.join(data.dir, 'plugin.yml'));
          } else return true;
        })
    // Then mix in any local ones that are passed in
        .thru(candidates => candidates.concat(_(plugins)
        // Start by filtering out non-local ones
            .filter(plugin => plugin.type === 'local')
        // Manually map into plugin object
            .map(plugin => ({name: plugin.name, path: path.join(plugin.path, 'index.js'), dir: plugin.path}))
        // Filter again to make sure we have an index.js
            .filter(plugin => fs.existsSync(plugin.path))
            .value(),
        ))
    // Then remove any that are flagged as disabled
        .filter(plugin => !_.includes(disablePlugins, plugin.name))
    // Then load the correct one based on the ordering
        .groupBy('name')
        .map(plugins => _.last(plugins))
        .map(plugin => _.merge({}, plugin, discoverPlugin(plugin)))
        .value();
  };

  /**
   * Loads a plugin.
   * @since 3.0.0
   * @alias lando.plugins.load
   * @param {object} plugin The plugin metadata.
   * @param {string} [file] The path to the plugin.
   * @param {...object} injected Something to inject into the plugin.
   * @returns {object} Data about our plugin.
   */
  load(plugin, file = plugin.path, ...injected) {
    try {
      plugin.data = require(file)(...injected);
    } catch (e) {
      this.log.error('problem loading plugin %s from %s: %s', plugin.name, file, e.stack);
    }

    // Register, log, return
    if (!this.registry.find(p => p.name === plugin.name)) {
      this.registry.push(plugin);
      this.log.debug('plugin %s loaded from %s', plugin.name, file);
      this.log.silly('plugin %s has', plugin.name, plugin.data);
    }
    return plugin;
  };
};
