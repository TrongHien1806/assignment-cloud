'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ValidationError, parseQuoteRequest, calculateQuote } = require('../src/pricing');

const DEFAULT_RATES = { baseFeeVnd: 10000, perKmVnd: 2000, perKgVnd: 5000 };

test('ví dụ chuẩn: 1500g, 12km → 2kg, 44.000 VND', () => {
  assert.deepEqual(calculateQuote({ weightGrams: 1500, distanceKm: 12 }, DEFAULT_RATES), {
    billableWeightKg: 2,
    totalVnd: 44000,
  });
});

test('khối lượng tính phí làm tròn lên theo kg', () => {
  const cases = [
    [1, 1],
    [999, 1],
    [1000, 1],
    [1001, 2],
    [30000, 30],
  ];
  for (const [weightGrams, expectedKg] of cases) {
    const { billableWeightKg } = calculateQuote({ weightGrams, distanceKm: 1 }, DEFAULT_RATES);
    assert.equal(billableWeightKg, expectedKg, `${weightGrams}g`);
  }
});

test('đổi phí cơ bản thành 15.000 → 49.000 VND', () => {
  const rates = { ...DEFAULT_RATES, baseFeeVnd: 15000 };
  assert.equal(calculateQuote({ weightGrams: 1500, distanceKm: 12 }, rates).totalVnd, 49000);
});

test('bảng giá bằng 0 cho tổng bằng 0', () => {
  const rates = { baseFeeVnd: 0, perKmVnd: 0, perKgVnd: 0 };
  assert.equal(calculateQuote({ weightGrams: 30000, distanceKm: 1000 }, rates).totalVnd, 0);
});

test('parseQuoteRequest nhận input hợp lệ ở hai biên', () => {
  assert.deepEqual(parseQuoteRequest({ weight_grams: 1, distance_km: 1 }), {
    weightGrams: 1,
    distanceKm: 1,
  });
  assert.deepEqual(parseQuoteRequest({ weight_grams: 30000, distance_km: 1000 }), {
    weightGrams: 30000,
    distanceKm: 1000,
  });
});

test('parseQuoteRequest từ chối input sai', () => {
  const cases = [
    [null, 'request body must be a JSON object'],
    [[], 'request body must be a JSON object'],
    [123, 'request body must be a JSON object'],
    [{ distance_km: 12 }, 'weight_grams is required'],
    [{ weight_grams: 1500 }, 'distance_km is required'],
    [{ weight_grams: '1500', distance_km: 12 }, 'weight_grams must be an integer'],
    [{ weight_grams: 1500.5, distance_km: 12 }, 'weight_grams must be an integer'],
    [{ weight_grams: true, distance_km: 12 }, 'weight_grams must be an integer'],
    [{ weight_grams: null, distance_km: 12 }, 'weight_grams must be an integer'],
    [{ weight_grams: 0, distance_km: 12 }, 'weight_grams must be between 1 and 30000'],
    [{ weight_grams: -5, distance_km: 12 }, 'weight_grams must be between 1 and 30000'],
    [{ weight_grams: 30001, distance_km: 12 }, 'weight_grams must be between 1 and 30000'],
    [{ weight_grams: 1500, distance_km: 0 }, 'distance_km must be between 1 and 1000'],
    [{ weight_grams: 1500, distance_km: 1001 }, 'distance_km must be between 1 and 1000'],
  ];
  for (const [body, message] of cases) {
    assert.throws(() => parseQuoteRequest(body), { constructor: ValidationError, message });
  }
});
