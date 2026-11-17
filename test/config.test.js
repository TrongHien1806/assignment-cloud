'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ConfigError, loadConfig } = require('../src/config');

test('dùng mặc định khi không có biến môi trường', () => {
  assert.deepEqual(loadConfig({}), {
    rates: { baseFeeVnd: 10000, perKmVnd: 2000, perKgVnd: 5000 },
    podName: 'local',
    demoMode: false,
    logLevel: 'info',
  });
});

test('đọc giá trị từ biến môi trường', () => {
  const config = loadConfig({
    BASE_FEE_VND: '15000',
    PER_KM_VND: '0',
    PER_KG_VND: '7000',
    POD_NAME: 'shipquote-abc',
    DEMO_MODE: 'true',
    LOG_LEVEL: 'debug',
  });
  assert.deepEqual(config, {
    rates: { baseFeeVnd: 15000, perKmVnd: 0, perKgVnd: 7000 },
    podName: 'shipquote-abc',
    demoMode: true,
    logLevel: 'debug',
  });
});

test('cấu hình bất biến sau khi đọc', () => {
  const config = loadConfig({});
  assert.throws(() => {
    config.rates.baseFeeVnd = 1;
  }, TypeError);
});

test('từ chối bảng giá không phải số nguyên không âm', () => {
  for (const raw of ['', '-1', '100abc', '1.5', ' 10', '1e3', 'abc']) {
    assert.throws(() => loadConfig({ PER_KM_VND: raw }), {
      constructor: ConfigError,
      message: /PER_KM_VND/,
    });
  }
});

test('từ chối bảng giá gây tràn số với input lớn nhất', () => {
  assert.throws(() => loadConfig({ BASE_FEE_VND: '99999999999999999999' }), ConfigError);
  assert.throws(() => loadConfig({ PER_KM_VND: String(Number.MAX_SAFE_INTEGER) }), ConfigError);
  assert.throws(() => loadConfig({ PER_KG_VND: String(Number.MAX_SAFE_INTEGER) }), ConfigError);
});

test('từ chối DEMO_MODE, LOG_LEVEL, POD_NAME sai', () => {
  for (const raw of ['TRUE', '1', 'yes', '']) {
    assert.throws(() => loadConfig({ DEMO_MODE: raw }), { message: /DEMO_MODE/ });
  }
  assert.throws(() => loadConfig({ LOG_LEVEL: 'verbose' }), { message: /LOG_LEVEL/ });
  assert.throws(() => loadConfig({ POD_NAME: '' }), { message: /POD_NAME/ });
});

test('tiến trình thoát mã khác 0 và nêu tên biến khi cấu hình sai', () => {
  const result = spawnSync(process.execPath, ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PER_KM_VND: 'abc' },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PER_KM_VND/);
});
