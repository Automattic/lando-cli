/**
 * Real-filesystem coverage for bootstrap discovery patterns.
 * @file discovery.spec.js
 */
'use strict';

const {expect} = require('chai');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const Plugins = require('../lib/plugins');

/**
 * Creates a JavaScript fixture below a temporary directory.
 * @param {string} root Fixture directory.
 * @param {string} relative File path below the fixture directory.
 * @param {string} content JavaScript source.
 * @returns {string} Created file path.
 */
const write = (root, relative, content = 'module.exports = () => ({});') => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return file;
};

describe('bootstrap discovery', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lando discovery-'));
  });
  afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

  it('sorts visible plugins, ignores missing entries, and preserves namespaced discovery', () => {
    write(root, 'plugins/zeta/index.js');
    write(root, 'plugins/alpha/index.js');
    write(root, 'plugins/.hidden/index.js');
    write(root, 'plugins/incomplete/other.js');
    const plugins = new Plugins().find([{path: root, namespace: 'fixture'}]);
    expect(plugins.map(plugin => plugin.name)).to.deep.equal(['fixture/alpha', 'fixture/zeta']);
    expect(new Plugins().find([path.join(root, 'missing')])).to.deep.equal([]);
  });

  it('discovers directory symlinks without treating hidden plugins as visible', () => {
    write(root, 'target/index.js');
    const pluginDir = path.join(root, 'plugins');
    fs.mkdirSync(pluginDir);
    fs.symlinkSync(path.join(root, 'target'), path.join(pluginDir, 'linked'), 'junction');
    fs.symlinkSync(path.join(root, 'target'), path.join(pluginDir, '.hidden'), 'junction');
    expect(new Plugins().find([root]).map(plugin => plugin.name)).to.deep.equal(['linked']);
  });

  it('loads recipe inits, source modules, and builders in sorted order through full bootstrap', () => {
    write(root, 'plugins/fixture/index.js');
    write(root, 'plugins/fixture/recipes/zeta/init.js', 'module.exports = {name: "zeta"};');
    write(root, 'plugins/fixture/recipes/alpha/init.js', 'module.exports = {name: "alpha"};');
    write(root, 'plugins/fixture/recipes/.hidden/init.js', 'throw new Error("Hidden recipe loaded");');
    write(root, 'plugins/fixture/sources/zeta.js', 'module.exports = {sources: [{label: "Zeta"}]};');
    write(root, 'plugins/fixture/sources/alpha.js', 'module.exports = {sources: [{label: "Alpha"}]};');
    write(root, 'plugins/fixture/sources/directory.js/index.js', 'module.exports = {sources: [{label: "Directory"}]};');
    write(root, 'plugins/fixture/sources/.hidden.js', 'throw new Error("Hidden source loaded");');
    write(root, 'plugins/fixture/types/zeta/builder.js',
        'module.exports = {name: "zeta", builder: () => class Zeta {}};');
    write(root, 'plugins/fixture/types/alpha/builder.js',
        'module.exports = {name: "alpha", builder: () => class Alpha {}};');
    write(root, 'plugins/fixture/types/.hidden/builder.js', 'throw new Error("Hidden builder loaded");');
    // Run bootstrap in a child because Lando's defaults are mutated across instances.
    const script = `
      const Lando = require(${JSON.stringify(path.resolve(__dirname, '../lib/lando'))});
      const path = require('node:path');
      const root = ${JSON.stringify(root)};
      const lando = new Lando({
        configSources: [], pluginDirs: [root], userConfRoot: path.join(root, 'config'),
        home: path.join(root, 'home'), logDir: path.join(root, 'logs'),
        dockerBin: false, composeBin: false, logLevelConsole: 'error',
      });
      lando.cache.set('docker-version', {engine: 'fixture', compose: 'fixture'}, {ttl: 300});
      lando.bootstrap().then(() => console.log(JSON.stringify({
        inits: lando.config.inits.map(init => init.name),
        sources: lando.config.sources.map(source => source.label),
        builders: lando.factory.get().map(builder => builder.name),
      }))).catch(error => { console.error(error); process.exitCode = 1; });
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['-e', script], {encoding: 'utf8'}));
    expect(result.inits).to.deep.equal(['alpha', 'zeta']);
    expect(result.sources).to.deep.equal(['Alpha', 'Directory', 'Zeta']);
    expect(result.builders).to.deep.equal(['_compose', '_recipe', 'alpha', 'zeta']);
  });
});
