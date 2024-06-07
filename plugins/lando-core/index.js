'use strict';

// Modules
const _ = require('lodash');
const fs = require('node:fs');
const path = require('node:path');
const {networkInterfaces} = require('node:os');

// Default env values
const defaults = {
  config: {
    appEnv: {
      COLUMNS: 256,
      LANDO: 'ON',
      LANDO_WEBROOT_USER: 'www-data',
      LANDO_WEBROOT_GROUP: 'www-data',
      TERM: 'xterm',
    },
    appLabels: {
      'io.lando.container': 'TRUE',
    },
  },
};

/*
 * Helper to get user conf
 */
const uc = (uid, gid, username) => ({
  config: {
    appEnv: {
      LANDO_HOST_UID: uid,
      LANDO_HOST_GID: gid,
      LANDO_HOST_USER: username,
    },
    gid,
    uid,
    username,
  },
});

/**
 * Emulates the behavior of `ip.address()`: returns the first address with `ipv4` or loopback address `127.0.0.1`.
 *
 * @return {string}
 */
const hostIp = () => {
  const interfaces = networkInterfaces();
  const names = Object.keys(interfaces);

  for (const name of names) {
    for (const {address, family, internal} of interfaces[name]) {
      if (family === 'IPv4' && !internal) {
        return address;
      }
    }
  }

  return '127.0.0.1';
};

/*
 * Helper to get ca run object
 */
const getCaRunner = (project, files) => ({
  id: [project, 'ca', '1'].join('_'),
  compose: files,
  project: project,
  cmd: '/setup-ca.sh',
  opts: {
    mode: 'attach',
    services: ['ca'],
    autoRemove: true,
  },
});

module.exports = lando => {
  // Set some stuff and set seom stuff up
  const caDir = path.join(lando.config.userConfRoot, 'certs');
  const caDomain = lando.config.domain;
  const caCert = path.join(caDir, `${caDomain}.pem`);
  const caKey = path.join(caDir, `${caDomain}.key`);
  const caProject = `landocasetupkenobi38ahsoka${lando.config.instance}`;
  const sshDir = path.join(lando.config.home, '.ssh');
  // Ensure some dirs exist before we start
  fs.mkdirSync(caDir, {recursive: true});
  if (lando.config.home) {
    fs.mkdirSync(sshDir, {recursive: true});
  }

  // Make sure we have a host-exposed root ca if we don't already
  // NOTE: we don't run this on the caProject otherwise infinite loop happens!
  lando.events.on('pre-engine-start', 2, data => {
    if (!fs.existsSync(caCert) && data.project !== caProject) {
      const LandoCa = lando.factory.get('_casetup');
      const env = _.cloneDeep(lando.config.appEnv);
      const labels = _.cloneDeep(lando.config.appLabels);
      const caData = new LandoCa(lando.config.userConfRoot, env, labels);
      const caFiles = lando.utils.dumpComposeData(caData, caDir);
      lando.log.debug('setting up Lando Local CA at %s', caCert);
      return lando.engine.run(getCaRunner(caProject, caFiles));
    }
  });

  // Let's also make a copy of caCert with the standarized .crt ending for better linux compat
  // See: https://github.com/lando/lando/issues/1550
  lando.events.on('pre-engine-start', 3, data => {
    const caNormalizedCert = path.join(caDir, `${caDomain}.crt`);
    if (fs.existsSync(caCert) && !fs.existsSync(caNormalizedCert)) {
      // @NOTE: we need to use pre node 8.x-isms because pld roles with node 7.9 currently
      fs.writeFileSync(caNormalizedCert, fs.readFileSync(caCert));
    }
  });

  // Return some default things
  return _.merge({}, defaults, uc(lando.user.getUid(), lando.user.getGid(), lando.user.getUsername()), {config: {
    appEnv: {
      LANDO_CA_CERT: '/lando/certs/' + path.basename(caCert),
      LANDO_CA_KEY: '/lando/certs/' + path.basename(caKey),
      LANDO_CONFIG_DIR: lando.config.userConfRoot,
      LANDO_DOMAIN: lando.config.domain,
      LANDO_HOST_HOME: lando.config.home,
      LANDO_HOST_OS: lando.config.os.platform,
      LANDO_HOST_IP: (process.platform === 'linux') ? hostIp() : 'host.docker.internal',
      LANDO_LEIA: _.toInteger(lando.config.leia),
      LANDO_MOUNT: '/app',
    },
    appLabels: {
      'io.lando.id': lando.config.instance,
    },
    bindAddress: '127.0.0.1',
    caCert,
    caDomain,
    caKey,
    caProject,
    maxKeyWarning: 10,
  }});
};
