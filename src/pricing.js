'use strict';

const LIMITS = Object.freeze({
  weight_grams: Object.freeze({ min: 1, max: 30000 }),
  distance_km: Object.freeze({ min: 1, max: 1000 }),
});

class ValidationError extends Error {}

function readField(body, name) {
  const value = body[name];
  const { min, max } = LIMITS[name];
  if (value === undefined) {
    throw new ValidationError(`${name} is required`);
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(`${name} must be an integer`);
  }
  if (value < min || value > max) {
    throw new ValidationError(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

function parseQuoteRequest(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('request body must be a JSON object');
  }
  return {
    weightGrams: readField(body, 'weight_grams'),
    distanceKm: readField(body, 'distance_km'),
  };
}

function calculateQuote({ weightGrams, distanceKm }, rates) {
  const billableWeightKg = Math.ceil(weightGrams / 1000);
  const totalVnd =
    rates.baseFeeVnd + distanceKm * rates.perKmVnd + billableWeightKg * rates.perKgVnd;
  return { billableWeightKg, totalVnd };
}

function maxTotalVnd(rates) {
  return calculateQuote(
    { weightGrams: LIMITS.weight_grams.max, distanceKm: LIMITS.distance_km.max },
    rates,
  ).totalVnd;
}

module.exports = { LIMITS, ValidationError, parseQuoteRequest, calculateQuote, maxTotalVnd };
