const app = require('./app');
const config = require('./config');
const db = require('./db/pool');
const logger = require('./observability/logger');

// SF-201 : écoute sur toutes les interfaces (0.0.0.0), sinon injoignable hors du conteneur
const server = app.listen(config.port, () => {
  logger.info('server_started', { port: config.port, env: config.env });
});

// arrêt propre sur "docker stop" (SIGTERM) : on finit les requêtes en cours puis on ferme le pool
function shutdown(signal) {
  logger.info('server_stopping', { signal });
  server.close(() => db.pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
