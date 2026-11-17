'use strict';

const { maxTotalVnd } = require('./pricing');

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

class ConfigError extends Error {}

function readAmount(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined) {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    throw new ConfigError(`${name} must be a non-negative integer, got "${raw}"`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new ConfigError(`${name} is too large, got "${raw}"`);
  }
  return value;
}

function readChoice(env, name, fallback, choices) {
  const raw = env[name];
  if (raw === undefined) {
    return fallback;
  }
  if (!choices.includes(raw)) {
    throw new ConfigError(`${name} must be one of ${choices.join(', ')}, got "${raw}"`);
  }
  return raw;
}

function loadConfig(env = process.env) {
  const rates = Object.freeze({
    baseFeeVnd: readAmount(env, 'BASE_FEE_VND', 10000),
    perKmVnd: readAmount(env, 'PER_KM_VND', 2000),
    perKgVnd: readAmount(env, 'PER_KG_VND', 5000),
  });
  // Số của JS chỉ chính xác tới 2^53 - 1, nên chặn bảng giá làm tràn ngay từ lúc khởi động.
  if (!Number.isSafeInteger(maxTotalVnd(rates))) {
    throw new ConfigError('BASE_FEE_VND, PER_KM_VND, PER_KG_VND are too large to compute quotes safely');
  }

  const podName = env.POD_NAME === undefined ? 'local' : env.POD_NAME;
  if (podName === '') {
    throw new ConfigError('POD_NAME must not be empty');
  }

  return Object.freeze({
    rates,
    podName,
    demoMode: readChoice(env, 'DEMO_MODE', 'false', ['true', 'false']) === 'true',
    logLevel: readChoice(env, 'LOG_LEVEL', 'info', LOG_LEVELS),
  });
}

module.exports = { ConfigError, LOG_LEVELS, loadConfig };
