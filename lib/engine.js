'use strict';

// Modules
const LandoDaemon = require('./daemon');
const Landerode = require('./docker');
const router = require('./router');

/**
 * Engine initialization config.
 * @typedef {object} EngineConfig
 * @property {string|false} [composeBin] Docker Compose binary path or disabled flag.
 */

/**
 * Common options passed to engine task descriptors.
 * @typedef {object} EngineTaskOptions
 * @property {boolean} [autoRemove] Automatically remove the container after execution.
 * @property {boolean} [background] Start services in the background.
 * @property {Array<string|null>} [cstdio] Custom stdio configuration.
 * @property {boolean} [detach] Run the process in the background.
 * @property {Record<string, string>} [environment] Additional environment variables.
 * @property {boolean} [follow] Follow the log stream like `tail -f`.
 * @property {boolean} [force] Force container removal.
 * @property {boolean} [hijack] Whether the shell execution should hijack stdio.
 * @property {string} [id] Target container id.
 * @property {boolean} [last] Whether this is the final task in a sequence.
 * @property {string[]} [local] Services that should be treated as local-only.
 * @property {'collect'|'attach'} [mode] Shell execution mode.
 * @property {boolean} [nocache] Ignore the build cache.
 * @property {string|string[]} [pre] Arguments to prepend before the user command.
 * @property {boolean} [prestart] Whether the task runs before container startup.
 * @property {boolean} [pull] Try to pull images first.
 * @property {string[]} [pullable] Services that may be pulled.
 * @property {boolean} [purge] Also imply volume and force removal.
 * @property {boolean} [recreate] Recreate services.
 * @property {boolean} [removeOrphans] Remove orphaned containers.
 * @property {string[]} [services] Target services.
 * @property {boolean} [silent] Suppress shell output.
 * @property {boolean} [timestamps] Show timestamps in output.
 * @property {string} [user] User, `user:group`, `uid`, or `uid:gid`.
 * @property {boolean} [volumes] Remove associated volumes.
 * @property {string} [workdir] Working directory inside the container.
 */

/**
 * Generic engine task descriptor.
 * @typedef {object} EngineTaskData
 * @property {string|string[]} [cmd] Command string or argv parts.
 * @property {string[]} [compose] Array of Docker Compose file paths.
 * @property {string} [id] Docker-recognizable id, name, or cid.
 * @property {EngineTaskOptions} [opts] Task options.
 * @property {string} [project] Project name, usually the app name.
 */

/**
 * Compose-backed engine task descriptor.
 * @typedef {object} EngineComposeTaskData
 * @property {string[]} compose Array of Docker Compose file paths.
 * @property {EngineTaskOptions} [opts] Task options.
 * @property {string} project Project name, usually the app name.
 */

/**
 * Engine task descriptor for container command execution.
 * @typedef {object} EngineRunTaskData
 * @property {string|string[]} cmd Command string or argv parts.
 * @property {string[]} [compose] Array of Docker Compose file paths.
 * @property {string} id Container id or name to run against.
 * @property {EngineTaskOptions} [opts] Command execution options.
 * @property {string} [project] Project name, usually the app name.
 */

/**
 * Options for listing Lando containers.
 * @typedef {object} EngineListOptions
 * @property {boolean} [all] Show even stopped containers.
 * @property {string} [app] Show containers for only one app.
 * @property {string[]} [filter] Additional `key=value` filters.
 */

/**
 * Options passed to Docker network listing.
 * @typedef {object} DockerNetworkListOptions
 * @property {object} [filters] Filter options.
 */

/**
 * Engine compose command runner.
 * @typedef {function(string, EngineTaskData): Promise<unknown>} ComposeCommandRunner
 */

/**
 * Engine service metadata returned from docker inspection.
 * @typedef {Record<string, unknown>} EngineServiceMetadata
 */

/**
 * Engine wrapper around router, daemon, docker, and compose operations.
 */
module.exports = class Engine {
  // @TODO: We need to figure out compose a bit better here, there is no default option right now, see similar comments in ./lando.js
  /**
   * @param {LandoDaemon} [daemon] Daemon adapter instance.
   * @param {Landerode} [docker] Docker adapter instance.
   * @param {ComposeCommandRunner} [compose] Compose command runner.
   * @param {EngineConfig} [config] Engine config.
   */
  constructor(daemon = new LandoDaemon(), docker = new Landerode(), compose = () => {}, config = {}) {
    /** @type {Landerode} */
    this.docker = docker;
    /** @type {LandoDaemon} */
    this.daemon = daemon;
    /** @type {ComposeCommandRunner} */
    this.compose = compose;
    /** @type {function(string, EngineTaskData|EngineTaskData[], function(): (Promise<unknown>|object|void)): Promise} */
    this.engineCmd = (name, data, run = () => router[name](data, this.compose, this.docker)) => router.eventWrapper(
        name,
        daemon,
        daemon.events,
        data,
        run,
    );
    // Determine install status
    /** @type {boolean} */
    this.composeInstalled = config.composeBin !== false;
    /** @type {boolean} */
    this.dockerInstalled = this.daemon.docker !== false;
  };

  /**
   * Event that allows you to do some things before a `compose` object's containers are
   * built
   * @since 3.0.0
   * @event pre_engine_build
   */
  /**
   * Event that allows you to do some things after a `compose` object's containers are
   * built
   * @since 3.0.0
   * @event post_engine_build
   */
  /**
   * Tries to pull the services for a `compose` object, and then tries to build them if they are found
   * locally. This is a wrapper around `docker pull` and `docker build`.
   * **NOTE:** Generally an instantiated `App` instance is a valid `compose` object
   * @since 3.0.0
   * @alias lando.engine.build
   * @fires pre_engine_build
   * @fires post_engine_build
   * @param {EngineComposeTaskData|import('./app')} data Compose object or array item wrapper.
   * @returns {Promise} A promise.
   * @example
   * return lando.engine.build(app);
   */
  build(data) {
    return this.engineCmd('build', data, data => router.build(data, this.compose));
  };

  /**
   * Creates a Docker network
   * @since 3.0.0
   * @function
   * @alias lando.engine.createNetwork
   * @see [docker api network docs](https://docs.docker.com/engine/api/v1.35/#operation/NetworkCreate) for info on opts.
   * @param {string} name The network name.
   * @returns {Promise} A promise with inspect data.
   * @example
   * return lando.engine.createNetwork('mynetwork')
   */
  createNetwork(name) {
    return this.docker.createNet(name);
  };

  /**
   * Event that allows you to do some things before some containers are destroyed.
   * @since 3.0.0
   * @event pre_engine_destroy
   */
  /**
   * Event that allows you to do some things after some containers are destroyed.
   * @since 3.0.0
   * @event post_engine_destroy
   */
  /**
   * Removes containers for a `compose` object or a particular container.
   * There are two ways to remove containers:
   *  1. Using an object with `{id: id}` where `id` is a docker recognizable id
   *  2. Using a `compose` object with `{compose: compose, project: project, opts: opts}`
   * These are detailed more below.
   * **NOTE:** Generally an instantiated `App` instance is a valid `compose` object
   * @since 3.0.0
   * @alias lando.engine.destroy
   * @fires pre_engine_destroy
   * @fires post_engine_destroy
   * @param {EngineTaskData|import('./app')} data Remove criteria for a container or compose context.
   * @returns {Promise} A promise.
   * @example
   * return lando.engine.destroy(app);
   */
  destroy(data) {
    return this.engineCmd('destroy', data);
  };

  /**
   * Checks whether a specific service exists or not.
   * There are two ways to check whether a container exists:
   *  1. Using an object with `{id: id}` where `id` is a docker recognizable id
   *  2. Using a `compose` object with `{compose: compose, project: project, opts: opts}`
   * These are detailed more below.
   * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
   * @since 3.0.0
   * @alias lando.engine.exists
   * @param {EngineTaskData|import('./app')} data Search criteria for a container or compose context.
   * @returns {Promise<boolean>} Promise resolving to whether the service exists.
   * @example
   * return lando.engine.exists(compose);
   */
  exists(data) {
    return this.engineCmd('exists', data);
  };

  /**
   * Gets a Docker network
   * @since 3.0.0
   * @function
   * @alias lando.engine.getNetwork
   * @param {string} id The network id.
   * @returns {import('dockerode').Network} Dockerode network object.
   * @example
   * const network = lando.engine.getNetwork('mynetwork')
   */
  getNetwork(id) {
    return this.docker.getNetwork(id);
  };

  /**
   * Gets the docker networks.
   * @since 3.0.0
   * @function
   * @alias lando.engine.getNetworks
   * @see [docker api network docs](https://docs.docker.com/engine/api/v1.27/#operation/NetworkList) for info on filters option.
   * @param {DockerNetworkListOptions} [opts] Options for the Docker networks call.
   * @returns {Promise<object[]>} Promise resolving to network objects.
   */
  getNetworks(opts) {
    return this.docker.listNetworks(opts);
  };

  /**
   * Determines whether a container is running or not
   * @since 3.0.0
   * @alias lando.engine.isRunning
   * @param {string} data Docker-recognizable container id or name.
   * @returns {Promise<boolean>} Promise resolving to whether the container is running.
   * @example
   * // Check to see if our app's web service is running
   * return lando.engine.isRunning('myapp-web-1').then(isRunning) {
   *   lando.log.info('Container %s is running: %s', 'myapp-web-1', isRunning);
   * });
   */
  isRunning(data) {
    return this.engineCmd('isRunning', data, data => this.docker.isRunning(data));
  };

  /**
   * Lists all the Lando containers. Optionally filter by app name.
   * @since 3.0.0
   * @alias lando.engine.list
   * @param {EngineListOptions} [options] Options to filter the list.
   * @returns {Promise<object[]>} Promise resolving to container objects.
   * @example
   * return lando.engine.list().each(function(container) {
   *   lando.log.info(container);
   * });
   */
  list(options = {}) {
    return this.engineCmd('list', options, options => this.docker.list(options));
  };

  /**
   * Returns logs for a given `compose` object
   * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
   * @since 3.0.0
   * @alias lando.engine.logs
   * @param {EngineComposeTaskData|import('./app')} data Compose object or array item wrapper.
   * @returns {Promise} A promise.
   * @example
   * // Get logs for an app
   * return lando.engine.logs(app);
   */
  logs(data) {
    return this.engineCmd('logs', data, data => router.logs(data, this.compose));
  };

  /**
   * Event that allows you to do some things before a command is run on a particular
   * container.
   * @since 3.0.0
   * @event pre_engine_run
   */
  /**
   * Event that allows you to do some things after a command is run on a particular
   * container.
   * @since 3.0.0
   * @event post_engine_run
   */
  /**
   * Runs a command on a given service/container. This is a wrapper around `docker exec`.
   * UNTIL the resolution of https://github.com/apocas/docker-modem/issues/83 data needs to also be or be an
   * array of compose objects for this to work correctly on Windows as well. See some of the other engine
   * documentation for what a compose object looks like.
   * @since 3.0.0
   * @alias lando.engine.run
   * @fires pre_engine_run
   * @fires post_engine_run
   * @param {EngineRunTaskData} data Run object or array item wrapper.
   * @returns {Promise} Promise resolving with command output.
   * @example
   * // Run composer install on the appserver container for an app called myapp
   * return lando.engine.run({id: 'myapp-appserver-1', cmd: ['composer', 'install']});
   * // Drop into an interactive bash shell on the database continer for an app called myapp
   * return lando.engine.run({
   *   id: 'myapp-database-1',
   *   cmd: ['bash'],
   *   opts: {
   *     mode: 'attach'
   *   }
   * });
   */
  run(data) {
    return this.engineCmd('run', data);
  };

  /**
   * Returns comprehensive service metadata. This is a wrapper around `docker inspect`.
   * There are two ways to get container metadata:
   *  1. Using an object with `{id: id}` where `id` is a docker recognizable id
   *  2. Using a `compose` object with `{compose: compose, project: project, opts: opts}`
   * These are detailed more below.
   * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
   * @since 3.0.0
   * @alias lando.engine.scan
   * @param {EngineTaskData|import('./app')} data Search criteria for a container or compose context.
   * @returns {Promise<EngineServiceMetadata>} Promise resolving to service metadata.
   * @example
   * // Log scan data using an id
   * return lando.engine.scan({id: '146d321f212d'}).then(function(data) {
   *   lando.log.info('Container data is %j', data);
   * });
   */
  scan(data) {
    return this.engineCmd('scan', data);
  };

  /**
   * Event that allows you to do some things before a `compose` Objects containers are
   * started
   * @since 3.0.0
   * @event pre_engine_start
   */
  /**
   * Event that allows you to do some things after a `compose` Objects containers are
   * started
   * @since 3.0.0
   * @event post_engine_start
   */
  /**
   * Starts the containers/services for the specified `compose` object.
   * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
   * @since 3.0.0
   * @alias lando.engine.start
   * @fires pre_engine_start
   * @fires post_engine_start
   * @param {EngineComposeTaskData|import('./app')} data Compose object or array item wrapper.
   * @returns {Promise} A promise.
   * @example
   * return lando.engine.start(app);
   */
  start(data) {
    return this.engineCmd('start', data, data => router.start(data, this.compose));
  };

  /**
   * Event that allows you to do some things before some containers are stopped.
   * @since 3.0.0
   * @event pre_engine_stop
   */
  /**
   * Event that allows you to do some things after some containers are stopped.
   * @since 3.0.0
   * @event post_engine_stop
   */
  /**
   * Stops containers for a `compose` object or a particular container.
   * There are two ways to stop containers:
   *  1. Using an object with `{id: id}` where `id` is a docker recognizable id
   *  2. Using a `compose` object with `{compose: compose, project: project, opts: opts}`
   * These are detailed more below.
   * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
   * @since 3.0.0
   * @alias lando.engine.stop
   * @fires pre_engine_stop
   * @fires post_engine_stop
   * @param {EngineTaskData|import('./app')} data Stop criteria for a container or compose context.
   * @returns {Promise} A promise.
   * @example
   * return lando.engine.stop(app);
   */
  stop(data) {
    return this.engineCmd('stop', data);
  };
};

