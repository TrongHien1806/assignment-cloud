'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHealth } = require('../src/health');
const { startServer } = require('./helpers');

let flagDir;
let server;

beforeEach(() => {
  flagDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipquote-test-'));
});
afterEach(async () => {
  if (server) {
    await server.close();
    server = undefined;
  }
  fs.rmSync(flagDir, { recursive: true, force: true });
});

const setFlag = (name) => fs.writeFileSync(path.join(flagDir, name), '');
const removeFlag = (name) => fs.rmSync(path.join(flagDir, name));

async function probe(name) {
  const response = await fetch(`${server.baseUrl}/health/${name}`);
  return { status: response.status, body: await response.json() };
}

const OK = { status: 200, body: { status: 'ok' } };
const UNAVAILABLE = { status: 503, body: { status: 'unavailable' } };

test('hai probe trả 200 khi không có cờ', async () => {
  server = await startServer({ env: { DEMO_MODE: 'true' }, flagDir });
  assert.deepEqual(await probe('live'), OK);
  assert.deepEqual(await probe('ready'), OK);
});

test('readiness trả 503 khi chưa khởi tạo xong hoặc đang shutdown', async () => {
  server = await startServer({ flagDir, ready: false });
  assert.deepEqual(await probe('live'), OK);
  assert.deepEqual(await probe('ready'), UNAVAILABLE);

  server.health.markReady();
  assert.deepEqual(await probe('ready'), OK);

  server.health.markNotReady();
  assert.deepEqual(await probe('ready'), UNAVAILABLE);
  assert.deepEqual(await probe('live'), OK);
});

test('cờ unready: readiness 503, liveness vẫn 200; phục hồi khi xóa cờ', async () => {
  server = await startServer({ env: { DEMO_MODE: 'true' }, flagDir });
  setFlag('shipquote-unready');
  assert.deepEqual(await probe('ready'), UNAVAILABLE);
  assert.deepEqual(await probe('live'), OK);

  removeFlag('shipquote-unready');
  assert.deepEqual(await probe('ready'), OK);
});

test('cờ unhealthy: cả hai probe 503', async () => {
  server = await startServer({ env: { DEMO_MODE: 'true' }, flagDir });
  setFlag('shipquote-unhealthy');
  assert.deepEqual(await probe('live'), UNAVAILABLE);
  assert.deepEqual(await probe('ready'), UNAVAILABLE);

  removeFlag('shipquote-unhealthy');
  assert.deepEqual(await probe('live'), OK);
  assert.deepEqual(await probe('ready'), OK);
});

test('DEMO_MODE=false: cờ không ảnh hưởng probe', async () => {
  server = await startServer({ env: { DEMO_MODE: 'false' }, flagDir });
  setFlag('shipquote-unready');
  setFlag('shipquote-unhealthy');
  assert.deepEqual(await probe('live'), OK);
  assert.deepEqual(await probe('ready'), OK);
});

test('clearFlags xóa cả hai cờ và không lỗi khi cờ không tồn tại', () => {
  const health = createHealth({ demoMode: true, flagDir });
  setFlag('shipquote-unready');
  setFlag('shipquote-unhealthy');

  health.clearFlags();
  health.clearFlags();

  assert.deepEqual(fs.readdirSync(flagDir), []);
});

test('đường dẫn cờ mặc định nằm trong /tmp theo contract', () => {
  const unready = '/tmp/shipquote-unready';
  const health = createHealth({ demoMode: true });
  health.markReady();
  fs.rmSync(unready, { force: true });
  assert.equal(health.isReady(), true);
  try {
    fs.writeFileSync(unready, '');
    assert.equal(health.isReady(), false);
    assert.equal(health.isLive(), true);
  } finally {
    fs.rmSync(unready, { force: true });
  }
});
