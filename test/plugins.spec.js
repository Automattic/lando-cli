/**
 * Tests for plugin system.
 * @file plugins.spec.js
 */

'use strict';

// Setup chai.
const _ = require('lodash');
const chai = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const expect = chai.expect;
const filesystem = require('mock-fs');
chai.use(require('chai-as-promised'));
chai.should();
const os = require('os');
const path = require('path');
const Plugins = require('./../lib/plugins');

const testPlugin = fs.readFileSync(path.resolve(__dirname, '..', 'plugins', 'lando-test', 'index.js'), 'utf8');
const searchDirs = [
  path.join(os.tmpdir(), 'dir1'),
  path.join(os.tmpdir(), 'dir2'),
  path.resolve(__dirname, '..'),
];
const fsConfig = {};
_.forEach(searchDirs, dir => {
  fsConfig[path.join(dir, 'plugins', 'lando-test', 'index.js')] = testPlugin;
  fsConfig[path.join(dir, 'plugins', 'lando-test', 'plugin.yml')] = 'DONT MATTER';
});

// This is the file we are testing
describe('plugins', () => {
  describe('#load', () => {
    beforeEach(() => {
      filesystem(fsConfig);
    });

    it('should use the plugin from the last location it finds it', () => {
      const plugins = new Plugins();
      const find = plugins.find(searchDirs);
      expect(_.includes(find[0].path, 'cli/plugins')).to.be.true;
    });

    it('should push a plugin to the plugin registry after it is loaded', () => {
      const plugins = new Plugins();
      const find = plugins.find(searchDirs);
      plugins.load(find[0]);
      plugins.registry.should.be.lengthOf(1);
    });

    it('should throw an error if dynamic require fails', () => {
      filesystem();
      const plugins = new Plugins({
        silly: sinon.spy(),
        debug: sinon.spy(),
        error: sinon.spy(),
        verbose: sinon.spy(),
      });
      plugins.load('irrelevant', 'somewhere', {});
      plugins.log.error.callCount.should.equal(1);
    });

    afterEach(() => {
      filesystem.restore();
    });
  });
});
