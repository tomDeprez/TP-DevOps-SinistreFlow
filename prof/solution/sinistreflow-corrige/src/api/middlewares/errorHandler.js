const config = require('../../config');
const logger = require('../../observability/logger');
const { errorsTotal } = require('../../observability/metrics');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  // SF-114 : nos erreurs métier portent leur code HTTP dans "status" (pas "statusCode")
  const status = err.status || err.statusCode || 500;
  errorsTotal.inc({ type: err.name || 'Error', status: String(status) });

  if (status >= 500) {
    logger.error('request_failed', { method: req.method, path: req.originalUrl, status, error: err.message, stack: err.stack });
  } else {
    logger.warn('request_rejected', { method: req.method, path: req.originalUrl, status, error: err.message });
  }

  // SF-114 : jamais de stack trace (chemins, versions de librairies, SQL...) renvoyée au client
  const body = {
    error: status >= 500 && config.env === 'production' ? 'Erreur interne, réessayez plus tard' : err.message,
  };
  if (err.details && err.details.length) body.details = err.details;
  if (config.env !== 'production' && status >= 500) body.stack = err.stack;
  res.status(status).json(body);
};
