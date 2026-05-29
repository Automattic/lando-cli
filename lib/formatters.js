'use strict';

// Modules
const _ = require('lodash');
const os = require('os');
const util = require('util');

// Const
/** @type {string[]} */
const formats = ['default', 'json', 'table'];
/** @type {object} */
const formatOpts = {
  format: {
    describe: `Output in given format: ${formats.join(', ')}`,
    choices: formats,
    string: true,
  },
  path: {
    describe: 'Only return the value at the given path',
    default: null,
    string: true,
  },
  filter: {
    describe: 'Filter data by "key=value"',
    array: true,
  },
};

/**
 * Formats command output for CLI display.
 * @param {unknown} data Output data.
 * @param {object} [formatting] Output formatting options.
 * @param {string} [formatting.path] Object path to extract.
 * @param {'default'|'json'|'table'} [formatting.format] Output format.
 * @param {string[]} [formatting.filter] Array filters in `key=value` form.
 * @param {object} [opts] Table or inspect options.
 * @returns {string} Formatted output.
 */
exports.formatData = (data, {path = '', format = 'default', filter = []} = {}, opts = {}) => {
  // Attempt to filter if we can
  if (_.isArray(data) && !_.isEmpty(filter)) {
    const filters = _(filter).map(f => f.split('=')).fromPairs().value();
    data = _.filter(data, filters);
  }
  // Attempt to get a path if we can
  if (_.isObject(data) && !_.isEmpty(path)) {
    data = _.get(data, path, data);
  }
  switch (format) {
    case 'json':
      return JSON.stringify(data);
    case 'table': {
      const Table = require('./table');
      if (!_.isArray(data)) {
        const table = new Table(data, opts);
        return table.toString();
      }
      return _(data)
          .map((value, index) => new Table(value, opts))
          .map(table => table.toString())
          .thru(data => data.join(os.EOL))
          .value();
    }
    default:
      return util.inspect(data, {
        colors: process.stdout.isTTY,
        depth: 10,
        compact: true,
        sorted: _.get(opts, 'sort', false),
      });
  }
};

/**
 * Returns CLI formatter options, omitting selected keys.
 * @param {string[]} [omit] Option keys to omit.
 * @returns {object} Formatter option config.
 */
exports.formatOptions = (omit = []) => _.omit(formatOpts, omit);

/**
 * Extracts interactive option definitions in prompt order.
 * @param {object} options Command option definitions.
 * @param {object} argv Parsed argv values.
 * @returns {object[]} Interactive option metadata.
 */
exports.getInteractive = (options, argv) => _(options)
    .map((option, name) => _.merge({}, {name}, {option}))
    .filter(option => !_.isEmpty(_.get(option, 'option.interactive', {})))
    .map(option => _.merge({}, {name: option.name, weight: 0}, option.option.interactive))
    .map(option => {
      if (_.isNil(argv[option.name]) || argv[option.name] === false) return option;
      else {
        return _.merge({}, option, {when: answers => {
          answers[option.name] = argv[option.name];
          return false;
        }});
      }
    })
    .value();

/**
 * Sorts option objects by key name.
 * @param {object} options Option config keyed by name.
 * @returns {object} Sorted option config.
 */
exports.sortOptions = options => _(options)
    .keys()
    .sortBy()
    .map(key => [key, options[key]])
    .fromPairs()
    .value();
