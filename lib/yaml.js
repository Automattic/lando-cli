'use strict';

// Modules
const fs = require('fs');
const Log = require('./logger');
const path = require('path');
const yaml = require('js-yaml');

/**
 * YAML helper for reading and writing config files.
 */
module.exports = class Yaml {
  /**
   * @param {Log} [log] Logger instance.
   */
  constructor(log = new Log()) {
    /** @type {Log} */
    this.log = log;
  };

  /**
   * Loads a yaml object from a file.
   * @since 3.0.0
   * @alias lando.yaml.load
   * @param {string} file The path to the file to be loaded.
   * @returns {object|undefined} The loaded object.
   * @example
   * // Add a string to the cache
   * const thing = lando.yaml.load('/tmp/myfile.yml');
   */
  load(file) {
    try {
      return yaml.load(fs.readFileSync(file));
    } catch (e) {
      this.log.error('Problem parsing %s with %s', file, e.message);
    }
  };

  /**
   * Dumps an object to a YAML file
   * @since 3.0.0
   * @alias lando.yaml.dump
   * @param {string} file The path to the file to be written.
   * @param {object} data The object to dump.
   * @returns {string} Written filename.
   */
  dump(file, data = {}) {
    // Make sure we have a place to store these files
    fs.mkdirSync(path.dirname(file), {recursive: true});
    // Remove any properties that might be bad and dump
    data = JSON.parse(JSON.stringify(data));
    // And dump
    fs.writeFileSync(file, yaml.dump(data));
    // Log and return filename
    return file;
  };
};
