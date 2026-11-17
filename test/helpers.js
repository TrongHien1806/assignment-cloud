'use strict';

const http = require('node:http');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { createHealth } = require('../src/health');

const TEST_VERSION = '9.9.9';
const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

async function startServer({ env = {}, flagDir, health, ready = true } = {}) {
  const config = loadConfig(env);
  const appHealth = health ?? createHealth({ demoMode: config.demoMode, flagDir });
  if (ready && appHealth.markReady) {
    appHealth.markReady();
  }

  const app = createApp({ config, health: appHealth, logger: silentLogger, version: TEST_VERSION });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    health: appHealth,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}

function postQuote(baseUrl, body, headers = { 'Content-Type': 'application/json' }) {
  return fetch(`${baseUrl}/api/v1/quotes`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

module.exports = { TEST_VERSION, startServer, postQuote };
