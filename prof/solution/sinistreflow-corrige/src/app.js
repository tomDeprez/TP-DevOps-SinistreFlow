const path = require('path');
const express = require('express');

const config = require('./config');
const healthRoutes = require('./api/health');
const publicRoutes = require('./api/public/declarations');
const internalRoutes = require('./api/internal/backoffice');
const v1Routes = require('./api/v1/claims');
const v2Routes = require('./api/v2/claims');
const v3Routes = require('./api/v3/claims');
const apiKeyAuth = require('./api/middlewares/apiKey');
const errorHandler = require('./api/middlewares/errorHandler');
const { NotFoundError } = require('./domain/errors');
const logger = require('./observability/logger');
const { register, httpMetrics } = require('./observability/metrics');

const app = express();
app.disable('x-powered-by');

app.use(httpMetrics);
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.path === '/metrics' || req.path.startsWith('/health')) return;
    logger.info('http_request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - started,
      partner: req.partner ? req.partner.name : undefined,
    });
  });
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/metrics', async (req, res) => {
  if (config.metrics.token && req.get('authorization') !== `Bearer ${config.metrics.token}`) {
    return res.status(401).end();
  }
  res.set('Content-Type', register.contentType);
  return res.end(await register.metrics());
});

app.use(healthRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/internal', internalRoutes);

// API partenaires (versionnée). Toutes les versions restent servies : des partenaires externes
// en dépendent (cf. docs/adr/0001-versioning-api.md). La v1 est annoncée comme dépréciée (RFC 8594 / 9745).
function deprecated(sunset, successor) {
  return (req, res, next) => {
    res.set('Deprecation', 'true');
    res.set('Sunset', sunset);
    res.set('Link', `<${successor}>; rel="successor-version"`);
    next();
  };
}
app.use('/api/v1', deprecated('Wed, 30 Jun 2027 23:59:59 GMT', '/api/v3'), apiKeyAuth, v1Routes);
app.use('/api/v2', apiKeyAuth, v2Routes);
app.use('/api/v3', apiKeyAuth, v3Routes);

app.use('/api', (req, res, next) => next(new NotFoundError(`Route inconnue : ${req.method} ${req.originalUrl}`)));
app.use(errorHandler);

module.exports = app;
