'use strict';

// Modules
const _ = require('lodash');
const os = require('os');
const util = require('util');

// Const
const formats = ['default', 'json', 'table'];
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

/*
 * Format data
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
      break;
    case 'table':
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
      break;
    default:
      return util.inspect(data, {
        colors: process.stdout.isTTY,
        depth: 10,
        compact: true,
        sorted: _.get(opts, 'sort', false),
      });
  }
};

/*
 * FormatOptios
 */
exports.formatOptions = (omit = []) => _.omit(formatOpts, omit);

/*
 * Helper to get interactive options
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

/*
 * Helper to prompt the user if needed
 */
exports.handleInteractive = (inquiry, argv, command, lando) => lando.Promise.try(() => {
  return {};
});

/*
 * Helper to sort options
 */
exports.sortOptions = options => _(options)
    .keys()
    .sortBy()
    .map(key => [key, options[key]])
    .fromPairs()
    .value();
