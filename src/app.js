'use strict';

const express = require('express');
const { ValidationError, parseQuoteRequest, calculateQuote } = require('./pricing');

function sendError(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

function sendHealth(res, ok) {
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'unavailable' });
}

function requireJsonContentType(req, res, next) {
  const mediaType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
    return;
  }
  next();
}

function createApp({ config, health, logger, version }) {
  const app = express();
  app.disable('x-powered-by');

  const metadata = { pod_name: config.podName, app_version: version };

  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const log = req.path.startsWith('/health/') ? logger.debug : logger.info;
      log('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Number(process.hrtime.bigint() - startedAt) / 1e6,
      });
    });
    next();
  });

  app.get('/health/live', (req, res) => sendHealth(res, health.isLive()));
  app.get('/health/ready', (req, res) => sendHealth(res, health.isReady()));

  app.get('/api/v1/info', (req, res) => {
    res.json({ service: 'shipquote', ...metadata });
  });

  app.get('/api/v1/rates', (req, res) => {
    res.json({
      base_fee_vnd: config.rates.baseFeeVnd,
      per_km_vnd: config.rates.perKmVnd,
      per_kg_vnd: config.rates.perKgVnd,
      metadata,
    });
  });

  app.post(
    '/api/v1/quotes',
    requireJsonContentType,
    express.text({ type: 'application/json', limit: '10kb' }),
    (req, res) => {
      let body;
      try {
        body = JSON.parse(req.body);
      } catch {
        sendError(res, 400, 'INVALID_JSON', 'request body must be valid JSON');
        return;
      }
      const input = parseQuoteRequest(body);
      const { billableWeightKg, totalVnd } = calculateQuote(input, config.rates);
      res.json({
        weight_grams: input.weightGrams,
        distance_km: input.distanceKm,
        billable_weight_kg: billableWeightKg,
        total_vnd: totalVnd,
        metadata,
      });
    },
  );

  app.use((req, res) => sendError(res, 404, 'NOT_FOUND', 'resource not found'));

  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) {
      sendError(res, 422, 'VALIDATION_ERROR', err.message);
    } else if (err.type === 'entity.too.large') {
      sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'request body is too large');
    } else if (err.status === 415) {
      sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'unsupported charset or content encoding');
    } else if (err.status >= 400 && err.status < 500) {
      sendError(res, 400, 'BAD_REQUEST', 'malformed request');
    } else {
      logger.error('unhandled error', { path: req.path, error: err.stack || String(err) });
      sendError(res, 500, 'INTERNAL_ERROR', 'internal server error');
    }
  });

  return app;
}

module.exports = { createApp };
