'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { TEST_VERSION, startServer, postQuote } = require('./helpers');

const METADATA = { pod_name: 'local', app_version: TEST_VERSION };

let server;
before(async () => {
  server = await startServer();
});
after(() => server.close());

async function assertError(response, status, code, message) {
  assert.equal(response.status, status);
  const body = await response.json();
  assert.equal(body.error.code, code);
  if (message !== undefined) {
    assert.equal(body.error.message, message);
  }
  assert.deepEqual(Object.keys(body), ['error']);
}

test('GET /api/v1/info', async () => {
  const response = await fetch(`${server.baseUrl}/api/v1/info`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { service: 'shipquote', ...METADATA });
});

test('GET /api/v1/rates', async () => {
  const response = await fetch(`${server.baseUrl}/api/v1/rates`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    base_fee_vnd: 10000,
    per_km_vnd: 2000,
    per_kg_vnd: 5000,
    metadata: METADATA,
  });
});

test('POST /api/v1/quotes trả 200 với ví dụ chuẩn', async () => {
  const response = await postQuote(server.baseUrl, { weight_grams: 1500, distance_km: 12 });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(await response.json(), {
    weight_grams: 1500,
    distance_km: 12,
    billable_weight_kg: 2,
    total_vnd: 44000,
    metadata: METADATA,
  });
});

test('Content-Type có charset vẫn được chấp nhận', async () => {
  const response = await postQuote(
    server.baseUrl,
    { weight_grams: 1500, distance_km: 12 },
    { 'Content-Type': 'application/json; charset=utf-8' },
  );
  assert.equal(response.status, 200);
});

test('bảng giá và metadata lấy từ cấu hình', async () => {
  const custom = await startServer({ env: { BASE_FEE_VND: '15000', POD_NAME: 'shipquote-xyz' } });
  try {
    const response = await postQuote(custom.baseUrl, { weight_grams: 1500, distance_km: 12 });
    const body = await response.json();
    assert.equal(body.total_vnd, 49000);
    assert.equal(body.metadata.pod_name, 'shipquote-xyz');
  } finally {
    await custom.close();
  }
});

test('415 khi Content-Type không phải application/json', async () => {
  const valid = JSON.stringify({ weight_grams: 1500, distance_km: 12 });
  for (const headers of [{ 'Content-Type': 'text/plain' }, { 'Content-Type': 'application/xml' }]) {
    await assertError(await postQuote(server.baseUrl, valid, headers), 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  const noContentType = await fetch(`${server.baseUrl}/api/v1/quotes`, {
    method: 'POST',
    body: new TextEncoder().encode(valid),
  });
  await assertError(noContentType, 415, 'UNSUPPORTED_MEDIA_TYPE');
});

test('415 được kiểm tra trước cú pháp JSON', async () => {
  const response = await postQuote(server.baseUrl, '{broken', { 'Content-Type': 'text/plain' });
  await assertError(response, 415, 'UNSUPPORTED_MEDIA_TYPE');
});

test('400 khi body không phải JSON hợp lệ', async () => {
  for (const body of ['{broken', '{"weight_grams": 1500,}', '', 'weight_grams=1500']) {
    await assertError(await postQuote(server.baseUrl, body), 400, 'INVALID_JSON');
  }
});

test('422 khi thiếu field, sai kiểu hoặc ngoài miền', async () => {
  const cases = [
    ['{}', 'weight_grams is required'],
    ['{"weight_grams":1500}', 'distance_km is required'],
    ['{"weight_grams":"1500","distance_km":12}', 'weight_grams must be an integer'],
    ['{"weight_grams":1500.5,"distance_km":12}', 'weight_grams must be an integer'],
    ['{"weight_grams":true,"distance_km":12}', 'weight_grams must be an integer'],
    ['{"weight_grams":null,"distance_km":12}', 'weight_grams must be an integer'],
    ['{"weight_grams":1e400,"distance_km":12}', 'weight_grams must be an integer'],
    ['{"weight_grams":0,"distance_km":12}', 'weight_grams must be between 1 and 30000'],
    ['{"weight_grams":-1,"distance_km":12}', 'weight_grams must be between 1 and 30000'],
    ['{"weight_grams":30001,"distance_km":12}', 'weight_grams must be between 1 and 30000'],
    ['{"weight_grams":1500,"distance_km":0}', 'distance_km must be between 1 and 1000'],
    ['{"weight_grams":1500,"distance_km":1001}', 'distance_km must be between 1 and 1000'],
    ['[1500,12]', 'request body must be a JSON object'],
    ['123', 'request body must be a JSON object'],
    ['null', 'request body must be a JSON object'],
  ];
  for (const [body, message] of cases) {
    await assertError(await postQuote(server.baseUrl, body), 422, 'VALIDATION_ERROR', message);
  }
});

test('413 khi body quá lớn', async () => {
  const body = JSON.stringify({ weight_grams: 1500, distance_km: 12, padding: 'x'.repeat(20000) });
  await assertError(await postQuote(server.baseUrl, body), 413, 'PAYLOAD_TOO_LARGE');
});

test('404 theo schema lỗi; không phục vụ file trong repo', async () => {
  for (const path of ['/', '/api/v1/unknown', '/README.md', '/README.local.md', '/.git/config', '/.env', '/package.json']) {
    await assertError(await fetch(`${server.baseUrl}${path}`), 404, 'NOT_FOUND');
  }
  await assertError(await fetch(`${server.baseUrl}/api/v1/quotes`), 404, 'NOT_FOUND');
});

test('500 không lộ chi tiết nội bộ', async () => {
  const broken = await startServer({
    health: {
      isLive: () => true,
      isReady: () => {
        throw new Error('secret internal detail');
      },
    },
  });
  try {
    const response = await fetch(`${broken.baseUrl}/health/ready`);
    assert.equal(response.status, 500);
    const text = await response.text();
    assert.deepEqual(JSON.parse(text), {
      error: { code: 'INTERNAL_ERROR', message: 'internal server error' },
    });
    assert.doesNotMatch(text, /secret/);
  } finally {
    await broken.close();
  }
});

test('không gửi header X-Powered-By', async () => {
  const response = await fetch(`${server.baseUrl}/api/v1/info`);
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('request đồng thời không lẫn dữ liệu; health vẫn đáp ứng', async () => {
  const inputs = Array.from({ length: 300 }, (_, i) => ({
    weight_grams: 1 + ((i * 97) % 30000),
    distance_km: 1 + ((i * 13) % 1000),
  }));

  const quotes = inputs.map(async (input) => {
    const response = await postQuote(server.baseUrl, input);
    assert.equal(response.status, 200);
    return response.json();
  });
  const probes = Array.from({ length: 20 }, () => fetch(`${server.baseUrl}/health/ready`));

  const [bodies, probeResponses] = await Promise.all([Promise.all(quotes), Promise.all(probes)]);

  bodies.forEach((body, i) => {
    const { weight_grams, distance_km } = inputs[i];
    const billable = Math.ceil(weight_grams / 1000);
    assert.equal(body.weight_grams, weight_grams);
    assert.equal(body.distance_km, distance_km);
    assert.equal(body.billable_weight_kg, billable);
    assert.equal(body.total_vnd, 10000 + distance_km * 2000 + billable * 5000);
  });
  for (const response of probeResponses) {
    assert.equal(response.status, 200);
    await response.body.cancel();
  }
});
