/**
 * Isolated engine initialization and first-use regression coverage.
 * @file bootstrap-engine.spec.js
 */
'use strict';

const {expect} = require('chai');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * Runs an engine probe with a fresh module cache and private filesystem state.
 * @param {string} source Probe assertions.
 * @returns {void}
 */
const probe = source => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lando-engine-'));
  try {
    const script = `
      const assert = require('node:assert/strict');
      const path = require('node:path');
      const root = ${JSON.stringify(path.resolve(__dirname, '..'))};
      const home = ${JSON.stringify(home)};
      const setupEngine = require(path.join(root, 'lib/bootstrap')).setupEngine;
      const config = {engineConfig: {host: '127.0.0.1', port: 1}, dockerBin: false, composeBin: false};
      const loaded = () => Object.keys(require.cache).some(file => /[\\\\/]dockerode[\\\\/]/.test(file));
      const setup = () => setupEngine(config, undefined, undefined, undefined, undefined, 'fixture');
      ${source}
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      env: {
        HOME: home, USERPROFILE: home, XDG_DATA_HOME: home, XDG_CONFIG_HOME: home,
        XDG_CACHE_HOME: home, TMPDIR: home, TMP: home, TEMP: home, PATH: '',
        SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
        DOCKER_HOST: 'tcp://127.0.0.1:1', NODE_ENV: 'test', DO_NOT_TRACK: '1',
      },
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.error, result.stderr).to.equal(undefined);
    expect(result.status, result.stderr + result.stdout).to.equal(0);
  } finally {
    fs.rmSync(home, {recursive: true, force: true});
  }
};

describe('engine bootstrap', () => {
  it('defers Dockerode, preserves eager options, and supports replacement before first use', () => probe(`
    const engine = setup();
    assert.equal(loaded(), false);
    assert.equal(config.engineConfig.Promise, require(path.join(root, 'lib/promise')));
    assert.ok(Object.keys(engine).includes('docker'));
    const derived = Object.create(engine);
    const derivedClient = {};
    derived.docker = derivedClient;
    assert.equal(Object.getOwnPropertyDescriptor(derived, 'docker').value, derivedClient);
    assert.equal(typeof Object.getOwnPropertyDescriptor(engine, 'docker').get, 'function');
    assert.equal(loaded(), false);
    const replacement = {createNet(name) { assert.equal(this, replacement); return name; }};
    engine.docker = replacement;
    assert.equal(engine.createNetwork('fixture'), 'fixture');
    assert.equal(loaded(), false);
    const descriptor = Object.getOwnPropertyDescriptor(engine, 'docker');
    assert.equal(descriptor.value, replacement);
    assert.equal(descriptor.writable, true);
  `));

  it('creates a real client on first network operation and reuses its modem and Promise library', () => probe(`
    (async () => {
      const http = require('node:http');
      const calls = [];
      const server = http.createServer((request, response) => {
        calls.push(request.method + ' ' + request.url);
        const missing = request.url.includes('missing');
        response.writeHead(missing ? 404 : request.method === 'POST' ? 201 : 200,
          {'Content-Type': 'application/json'});
        response.end(JSON.stringify(missing ? {message: 'fixture not found'} : {Id: 'fixture'}));
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        config.engineConfig.port = server.address().port;
        const engine = setup();
        assert.equal(loaded(), false);
        const result = await engine.getNetwork('fixture').inspect();
        assert.equal(result.Id, 'fixture');
        assert.equal(loaded(), true);
        const client = engine.docker;
        assert.equal(client.id, 'fixture');
        assert.equal(client.modem.Promise, require(path.join(root, 'lib/promise')));
        assert.equal((await engine.createNetwork('fixture')).id, 'fixture');
        await assert.rejects(engine.getNetwork('missing').inspect(), error =>
          error.statusCode === 404 && error.message.includes('fixture not found'));
        assert.equal(engine.docker, client);
        assert.equal(Object.getOwnPropertyDescriptor(engine, 'docker').value, client);
        assert.deepEqual(calls.map(call => call.split('?')[0]),
          ['GET /networks/fixture', 'POST /networks/create', 'GET /networks/missing']);
        const query = new URLSearchParams(calls[1].split('?')[1]);
        assert.equal(query.get('Name'), 'fixture');
        assert.equal(query.get('Attachable'), 'true');
        assert.equal(query.get('Internal'), 'true');
      } finally {
        await new Promise(resolve => server.close(resolve));
      }
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `));

  it('retains the eager default Engine constructor', () => probe(`
    const Engine = require(path.join(root, 'lib/engine'));
    assert.equal(loaded(), false);
    const engine = new Engine();
    assert.equal(loaded(), true);
    assert.ok(engine.docker instanceof require(path.join(root, 'lib/docker')));
  `));

  it('preserves custom modem setters and the original eager client', () => probe(`
    let assignments = 0;
    const modem = {};
    Object.defineProperty(modem, 'Promise', {set(value) { assignments++; }, configurable: true});
    process.env.DOCKER_HOST = 'not a valid host';
    config.engineConfig = {modem};
    const engine = setup();
    assert.equal(assignments, 1);
    assert.equal(engine.docker.modem, modem);
    assert.equal(loaded(), true);
    assert.equal(assignments, 1);
    assert.equal(Object.getOwnPropertyDescriptor(engine, 'docker').value, engine.docker);
  `));

  it('preserves function-valued options and read-only custom modem properties', () => probe(`
    const modem = {};
    Object.defineProperty(modem, 'Promise', {value: Promise, writable: false});
    config.engineConfig = function options() {};
    config.engineConfig.modem = modem;
    const engine = setup();
    assert.equal(engine.docker.modem, modem);
    assert.equal(modem.Promise, Promise);
    assert.equal(loaded(), true);
  `));

  for (const customPrototype of [false, true]) {
    const kind = customPrototype ? 'custom prototypes' : 'option accessors';
    it('retains the eager semantics of ' + kind, () => probe(`
      let reads = 0;
      const customPrototype = ${JSON.stringify(customPrototype)};
      const options = customPrototype ? Object.create({inherited: true}) : {};
      if (!customPrototype) {
        Object.defineProperty(options, 'sshOptions', {get() { reads++; throw new Error('must not be read'); }});
      }
      config.engineConfig = options;
      const engine = setup();
      assert.equal(loaded(), true);
      assert.equal(reads, 0);
      assert.equal(engine.docker.id, 'fixture');
    `));
  }

  it('snapshots transport defaults and never revalidates later environment changes', () => probe(`
    config.engineConfig = {};
    const engine = setup();
    assert.equal(loaded(), false);
    process.env.DOCKER_HOST = 'not a valid host';
    process.env.DOCKER_CERT_PATH = path.join(home, 'missing');
    assert.equal(engine.docker.modem.host, '127.0.0.1');
    assert.equal(String(engine.docker.modem.port), '1');
  `));

  for (const scenario of ['invalid host', 'missing TLS certificates', 'frozen options']) {
    it('preserves eager failure for ' + scenario, () => probe(`
      const scenario = ${JSON.stringify(scenario)};
      if (scenario === 'invalid host') process.env.DOCKER_HOST = 'not a valid host';
      if (scenario === 'missing TLS certificates') process.env.DOCKER_CERT_PATH = path.join(home, 'missing');
      if (scenario === 'frozen options') config.engineConfig = Object.freeze({});
      let actual;
      try { setup(); } catch (error) { actual = error; }
      assert.ok(actual, 'setup must fail before Docker API client access');
      assert.equal(loaded(), false);
      let expected;
      try { new (require(path.join(root, 'lib/docker')))(
        scenario === 'frozen options' ? Object.freeze({}) : {host: '127.0.0.1', port: 1});
      } catch (error) { expected = error; }
      assert.ok(expected);
      assert.equal(actual.name, expected.name);
      assert.equal(actual.message, expected.message);
      assert.equal(actual.code, expected.code);
      assert.equal(actual.path, expected.path);
    `));
  }
});
