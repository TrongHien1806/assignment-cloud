'use strict';

const http = require('node:http');
const { version } = require('../package.json');
const { createApp } = require('./app');
const { loadConfig } = require('./config');
const { createHealth } = require('./health');
const { createLogger } = require('./logger');

const HOST = '0.0.0.0';
const PORT = 8080;
const SHUTDOWN_TIMEOUT_MS = 25000;

function main() {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    process.stderr.write(`shipquote: invalid configuration: ${err.message}\n`);
    process.exit(1);
  }

  const logger = createLogger(config.logLevel);
  const health = createHealth({ demoMode: config.demoMode });
  health.clearFlags();

  const server = http.createServer(createApp({ config, health, logger, version }));

  server.on('error', (err) => {
    logger.error('server failed to start', { error: err.message });
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    health.markReady();
    logger.info('shipquote started', {
      version,
      host: HOST,
      port: PORT,
      pod_name: config.podName,
      demo_mode: config.demoMode,
      rates: config.rates,
    });
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    health.markNotReady();
    logger.info('shutting down', { signal });

    server.close(() => logger.info('shipquote stopped'));
    // Không gọi process.exit ở nhánh bình thường: tiến trình tự thoát khi request cuối cùng xong.
    setTimeout(() => {
      logger.warn('shutdown timed out, closing remaining connections');
      process.exitCode = 1;
      server.closeAllConnections();
    }, SHUTDOWN_TIMEOUT_MS).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
