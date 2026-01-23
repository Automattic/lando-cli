'use strict';

// Modules
const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const util = require('util');
const winston = require('winston');
const EventEmitter = require('events').EventEmitter;

// Constants
const logLevels = {
  '0': 'error',
  '1': 'warn',
  '2': 'info',
  '3': 'verbose',
  '4': 'debug',
  '5': 'silly',
};
const logColors = {
  error: 'bgRed',
  warn: 'bgYellow',
  info: 'bold',
  verbose: 'gray',
  debug: 'dim',
  silly: 'blue',
  timestamp: 'magenta',
  lando: 'cyan',
  app: 'green',
};
const userLevels = ['warn', 'error'];

// Maxsize
let fcw = 0;

// Create a custom format for key sanitization
const sanitizeKeys = (sanitizedKeys = []) => winston.format(info => {
  _.forEach(info, (value, key) => {
    if (sanitizedKeys.includes(key)) {
      info[key] = '****';
    }
  });
  return info;
});

// Custom console format that mimics the old formatter behavior
const consoleFormat = (logLevelConsole, defaultLogName) =>
  winston.format.printf(({level, message, timestamp, logName, ...meta}) => {
    // Get da prefixes
    const resolvedLogName = logName || defaultLogName;
    const element = (resolvedLogName === 'lando') ? 'lando' : resolvedLogName;
    const elementColor = (resolvedLogName === 'lando') ? 'lando' : 'app';
    // Set the leftmost column width
    fcw = _.max([fcw, _.size(element)]);

    // Extract the splat array (format arguments) if available
    const splat = meta[Symbol.for('splat')] || [];

    // Format the message with splat arguments using util.format
    const formattedMessage = splat.length > 0 ?
      util.format(message, ...splat) :
      message;

    // Remove splat from meta before serializing
    const metaWithoutSplat = {...meta};
    delete metaWithoutSplat[Symbol.for('splat')];

    // Serialize remaining metadata
    const serializedMeta = Object.keys(metaWithoutSplat).length ?
      ' ' + JSON.stringify(metaWithoutSplat) :
      '';

    // Default output
    const output = [
      winston.format.colorize({colors: logColors}).colorize(elementColor, _.padEnd(element.toLowerCase(), fcw)),
      winston.format.colorize({colors: logColors}).colorize('timestamp', timestamp),
      winston.format.colorize().colorize(level, level.toUpperCase()),
      '==>',
      formattedMessage + serializedMeta,
    ];

    // If this is a warning or error and we aren't verbose then omit prefixes
    if (_.includes(userLevels, level) && _.includes(userLevels, logLevelConsole)) {
      return _.drop(output, 2).join(' ');
    }
    return output.join(' ');
  });

/**
 * Logs a debug message.
 *
 * Debug messages are intended to communicate lifecycle milestones and events that are relevant to developers
 *
 * @since 3.0.0
 * @function
 * @name lando.log.debug
 * @alias lando.log.debug
 * @param {String} msg A string that will be passed into nodes core `utils.format()`
 * @param {...Any} [values] Values to be passed `utils.format()`
 * @example
 * // Log a debug message
 * lando.log.debug('All details about docker inspect %j', massiveObject);
 */
/**
 * Logs an error message.
 *
 * Errors are intended to communicate there is a serious problem with the application
 *
 * @since 3.0.0
 * @function
 * @name lando.log.error
 * @alias lando.log.error
 * @param {String} msg A string that will be passed into nodes core `utils.format()`
 * @param {...Any} [values] Values to be passed `utils.format()`
 * @example
 * // Log an error message
 * lando.log.error('This is an err with details %s', err);
 */
/**
 * Logs an info message.
 *
 * Info messages are intended to communicate lifecycle milestones and events that are relevant to users
 *
 * @since 3.0.0
 * @function
 * @name lando.log.info
 * @alias lando.log.info
 * @param {String} msg A string that will be passed into nodes core `utils.format()`
 * @param {...Any} [values] Values to be passed `utils.format()`
 * @example
 * // Log an info message
 * lando.log.info('It is happening!');
 */
/**
 * Logs a silly message.
 *
 * Silly messages are meant for hardcore debugging
 *
 * @since 3.0.0
 * @function
 * @name lando.log.silly
 * @alias lando.log.silly
 * @param {String} msg A string that will be passed into nodes core `utils.format()`
 * @param {...Any} [values] Values to be passed `utils.format()`
 * @example
 * // Log a silly message
 * lando.log.silly('All details about all the things', unreasonablySizedObject);
 *
 * // Log a silly message
 * lando.log.silly('If you are seeing this you have delved too greedily and too deep and likely have awoken something.');
 */
/**
 * Logs a verbose message.
 *
 * Verbose messages are intended to communicate extra information to the user and basics to a developer. They sit somewhere
 * in between info and debug
 *
 * @since 3.0.0
 * @function
 * @name lando.log.verbose
 * @alias lando.log.verbose
 * @param {String} msg A string that will be passed into nodes core `utils.format()`
 * @param {...Any} [values] Values to be passed `utils.format()`
 * @example
 * // Log a verbose message
 * lando.log.verbose('Config file %j loaded from %d', config, directory);
 */
/**
 * Logs a warning message.
 *
 * Warnings are intended to communicate you _might_ have a problem.
 *
 * @since 3.0.0
 * @function
 * @name lando.log.warn
 * @alias lando.log.warn
 * @param {String} msg A string that will be passed into nodes core `utils.format()`
 * @param {...Any} [values] Values to be passed `utils.format()`
 * @example
 * // Log a warning message
 * lando.log.warning('Something is up with app %s in directory %s', appName, dir);
 */
class Log extends EventEmitter {
  constructor({logDir, logFile, logLevelConsole = 'warn', logLevel = 'debug', logName = 'lando', logger} = {}) {
    super();

    if (process.env.DEBUG) {
      try {
        const debugLib = require('debug');
        debugLib.disable('winston:*');
      } catch {
        // Ignore if debug is unavailable.
      }
    }

    // If loglevelconsole is numeric lets map it!
    if (_.isInteger(logLevelConsole)) logLevelConsole = logLevels[logLevelConsole];

    // Initialize sanitized keys
    this.sanitizedKeys = ['auth', 'token', 'password', 'key', 'api_key', 'secret', 'machine_token'];

    if (logger) {
      this.sanitizedKeys = logger.sanitizedKeys || this.sanitizedKeys;
      logger.sanitizedKeys = this.sanitizedKeys;
      this.logger = logName ? logger.child({logName}) : logger;
    } else {
      // Create formats
      const formats = [
        winston.format.timestamp({format: () => new Date().toISOString().slice(11, 19)}),
        sanitizeKeys(this.sanitizedKeys)(),
      ];

      // The default console transport
      const transports = [
        new winston.transports.Console({
          format: winston.format.combine(
              ...formats,
              consoleFormat(logLevelConsole, logName),
          ),
          level: logLevelConsole,
        }),
      ];

      // File format without colorization
      const fileFormat = winston.format.combine(
          winston.format.timestamp(),
          sanitizeKeys(this.sanitizedKeys)(),
          winston.format.printf(({timestamp, level, message, logName, ...meta}) => {
            // Extract the splat array (format arguments) if available
            const splat = meta[Symbol.for('splat')] || [];

            // Format the message with splat arguments using util.format
            const formattedMessage = splat.length > 0 ?
              util.format(message, ...splat) :
              message;

            // Remove splat from meta before serializing
            const metaWithoutSplat = {...meta};
            delete metaWithoutSplat[Symbol.for('splat')];

            // Serialize remaining metadata
            const serializedMeta = Object.keys(metaWithoutSplat).length ?
              ' ' + JSON.stringify(metaWithoutSplat) :
              '';

            const resolvedLogName = logName || 'lando';
            return `${timestamp} [${resolvedLogName}] ${level.toUpperCase()}: ${formattedMessage}${serializedMeta}`;
          }),
      );

      if (logFile) {
        const resolvedLogFile = path.isAbsolute(logFile) ?
          logFile :
          path.join(logDir || '', logFile);
        fs.mkdirSync(path.dirname(resolvedLogFile), {recursive: true});
        transports.push(new winston.transports.File({
          format: fileFormat,
          level: logLevel,
          maxsize: 500000,
          maxFiles: 3,
          filename: resolvedLogFile,
        }));
      } else if (logDir) {
        // Ensure the log dir actually exists
        fs.mkdirSync(logDir, {recursive: true});

        // Add in our generic and error logs
        transports.push(new winston.transports.File({
          format: fileFormat,
          level: 'warn',
          maxsize: 500000,
          maxFiles: 2,
          filename: path.join(logDir, `${logName}-error.log`),
        }));
        transports.push(new winston.transports.File({
          format: fileFormat,
          level: logLevel,
          maxsize: 500000,
          maxFiles: 3,
          filename: path.join(logDir, `${logName}.log`),
        }));
      }

      // Add custom colors to winston
      winston.addColors(logColors);

      // Create the winston logger
      this.logger = winston.createLogger({
        transports: transports,
        exitOnError: true,
        defaultMeta: {logName},
      });
      this.logger.sanitizedKeys = this.sanitizedKeys;
    }

    // Create aliases for winston methods to maintain compatibility
    ['error', 'warn', 'info', 'verbose', 'debug', 'silly'].forEach(level => {
      this[level] = (...args) => this.logger[level](...args);
    });

    // Expose transports for compatibility with tests
    this.transports = [];
    const loggerTransports = this.logger && this.logger.transports ? this.logger.transports : [];
    loggerTransports.forEach(transport => {
      if (transport instanceof winston.transports.Console) {
        this.transports.push(transport);
      } else if (transport instanceof winston.transports.File) {
        if (transport.filename) this.transports.push(transport);
      }
    });

    // Add exitOnError property for test compatibility
    this.exitOnError = true;
  }

  // Method to help other things add sanitizations
  alsoSanitize(key) {
    this.sanitizedKeys.push(key);
    if (this.logger) this.logger.sanitizedKeys = this.sanitizedKeys;
    // We need to recreate the format with the updated keys
    // For simplicity, we'll just add to the array and it will be used in next log call
  }

  child(logName) {
    return new Log({logger: this.logger, logName});
  }
}

module.exports = Log;
