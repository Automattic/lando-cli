/**
 * Tests for plugin system.
 * @file plugins.spec.js
 */

'use strict';

// Setup chai.
const _ = require('lodash');
const chai = require('chai');
const Cli = require('./../lib/cli');
const {execFileSync} = require('child_process');
const path = require('path');
const sinon = require('sinon');
chai.use(require('chai-as-promised').default);
chai.should();

// Take task
const fakeTask = {
  command: 'task [arg1]',
  describe: 'Does the thing on the [appname]',
  options: {
    list: {
      describe: 'list some datas',
      alias: ['l'],
      array: true,
    },
    yes: {
      describe: 'ask me if i am ok',
      alias: ['y'],
      default: false,
      boolean: true,
    },
    other: {
      describe: 'some other thing',
      string: true,
    },
  },
  run: options => options,
};

// This is the file we are testing
describe('cli', () => {
  describe('#Cli', () => {
    it('should return a Cli instance with correct default options', () => {
      const cli = new Cli();
      cli.should.be.instanceof(Cli);
      cli.should.have.property('prefix', 'LANDO');
      cli.should.have.property('logLevel', 'warn');
      cli.should.have.property('userConfRoot').and.not.be.empty;
    });

    it('should return a Cli instance with custom options', () => {
      const prefix = '16309';
      const logLevel = 'allthelogz';
      const userConfRoot = '/tmp';
      const cli = new Cli(prefix, logLevel, userConfRoot);
      cli.should.be.instanceof(Cli);
      cli.should.have.property('prefix', prefix);
      cli.should.have.property('logLevel', logLevel);
      cli.should.have.property('userConfRoot', userConfRoot);
    });
  });

  describe('#argv', () => {
    it('should return parsed CLI arguments', () => {
      const cli = new Cli();
      cli.argv().should.be.an('object');
      cli.argv()._.should.be.an('array');
    });

    it('should parse command arguments and flags without handling help or version', () => {
      const script = [
        'process.argv = ["node", "lando", "task", "quoted value", "--clear", "-vvv", "--help", "--version"];',
        'const Cli = require("./lib/cli");',
        'const cli = new Cli();',
        'console.log(JSON.stringify({argv: cli.argv(), logLevel: cli.defaultConfig().logLevelConsole}));',
      ].join('\n');
      const output = execFileSync(process.execPath, ['-e', script], {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
      });
      const {argv, logLevel} = JSON.parse(output);
      argv._.should.deep.equal(['task', 'quoted value']);
      argv.should.include({clear: true, v: 3, verbose: 3, help: true, version: true});
      logLevel.should.equal(4);
    });
  });

  describe('#defaultConfig', () => {
    it('should return default config object that can be used to bootstrap a lando cli', () => {
      const cli = new Cli();
      const config = cli.defaultConfig();
      const types = {
        string: [
          'domain',
          'envPrefix',
          'landoFile',
          'logLevelConsole',
          'logDir',
          'mode',
          'product',
          'userAgent',
          'userConfRoot',
          'version',
        ],
        array: ['configSources', 'pluginDirs'],
      };
      _.forEach(types, (props, type) => {
        _.forEach(props, prop => {
          config[prop].should.be.a(type);
        });
      });
      config.mode.should.equal('cli');
    });

    it('should set log level from argv() if set', () => {
      const cli = new Cli();
      sinon.stub(cli, 'argv').returns({v: 3, verbose: 3});
      const config = cli.defaultConfig();
      config.logLevelConsole.should.equal(4);
      cli.argv.restore();
    });
  });

  describe('#parseToYargs', () => {
    it('should return an object that yargs can use', () => {
      const cli = new Cli();
      const task = cli.parseToYargs(fakeTask);
      task.command.should.be.a('string');
      task.describe.should.be.a('string');
      task.builder.should.be.an('object');
      task.handler.should.be.a('function');
    });
  });

  describe('#run', () => {
    it('should return a yargs cli', async () => {
      const cli = new Cli();
      const task = cli.parseToYargs({command: 'task', describe: 'desc'});
      await cli.run([task]);
    });

    it('should show registered commands for global help without invoking a handler', () => {
      const script = [
        'process.argv = ["node", "lando", "--help"];',
        'const Cli = require("./lib/cli");',
        'const cli = new Cli();',
        'cli.updateUserConfig = () => ({});',
        'cli.run([{command: "task", describe: "Test command", handler: () => console.log("HANDLER_RAN")}]);',
      ].join('\n');
      const output = execFileSync(process.execPath, ['-e', script], {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
      });
      output.should.include('Test command');
      output.should.include('--verbose');
      output.should.not.include('HANDLER_RAN');
    });
  });

  describe('#init', () => {
    it('should await an async command handler and invoke it once', async () => {
      const cli = new Cli();
      const yargs = require('yargs/yargs')(['task', '-vvv']);
      let calls = 0;
      const task = {
        command: 'task',
        handler: async argv => {
          await Promise.resolve();
          calls += 1;
          argv.verbose.should.equal(3);
        },
      };
      const argv = await cli.init(yargs, [task], {}, {});
      calls.should.equal(1);
      argv._.should.deep.equal(['task']);
    });
  });
});
