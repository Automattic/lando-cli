/**
 * Tests for logging system.
 * @file logger.spec.js
 */

'use strict';

const _ = require('lodash');
const chai = require('chai');
const EventEmitter = require('events').EventEmitter;
const filesystem = require('mock-fs');
const fs = require('fs');
chai.should();

const Log = require('./../lib/logger');

describe('logger', () => {
  describe('#Log', () => {
    it('should return a Log instance with correct default options', () => {
      const log = new Log();
      log.should.be.instanceof(Log);
      log.should.have.property('exitOnError', true);
      log.transports.should.be.an('array');
      log.transports.should.have.lengthOf(1);
      log.transports[0].should.be.instanceof(EventEmitter);
      log.transports[0].should.have.property('level', 'warn');
      _.forEach(['error', 'warn', 'info', 'verbose', 'debug', 'silly'], level => {
        log[level].should.be.a('function');
      });
    });

    it('should return a Log instance with custom logLevelConsole', () => {
      const log = new Log({logLevelConsole: 'info'});
      log.transports[0].should.have.property('level', 'info');
    });

    it('should return a Log instance with custom integer logLevelConsole', () => {
      const logLevels = {
        '0': 'error',
        '1': 'warn',
        '2': 'info',
        '3': 'verbose',
        '4': 'debug',
        '5': 'silly',
      };
      _.forEach(logLevels, (word, num) => {
        const log = new Log({logLevelConsole: _.toInteger(num)});
        log.transports[0].should.have.property('level', word);
      });
    });

    it('should create a log directory and file transports if logDir specified', () => {
      // Need to preemptively load in the winston File transports because mock-fs handles
      // lazy requires on the mock filesystem and CAN'T FIND SHIT
      // @see: https://github.com/tschaub/mock-fs/issues/213
      require('winston/lib/winston/transports/file');
      filesystem();
      const log = new Log({logDir: '/tmp/logz', logLevel: 'warn'});
      fs.existsSync('/tmp/logz').should.be.true;
      log.transports.should.be.an('array');
      log.transports.should.have.lengthOf(3);

      // First transport should be console
      log.transports[0].should.be.instanceof(EventEmitter);

      // Other two should be file transports
      log.transports[1].should.be.instanceof(EventEmitter);
      log.transports[1].should.have.property('level', 'warn');
      log.transports[2].should.be.instanceof(EventEmitter);
      log.transports[2].should.have.property('level', 'warn');

      filesystem.restore();
    });
  });
});
