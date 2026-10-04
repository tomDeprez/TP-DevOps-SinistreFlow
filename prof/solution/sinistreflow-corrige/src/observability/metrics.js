/**
 * Métriques Prometheus exposées sur GET /metrics.
 *  - méthode RED (Rate, Errors, Duration) sur les requêtes HTTP
 *  - métriques métier (déclarations, expertises, usage des versions d'API)
 *  - état du pool de connexions PostgreSQL
 */
const client = require('prom-client');
const { pool } = require('../db/pool');

const register = new client.Registry();
register.setDefaultLabels({ app: 'sinistreflow' });
client.collectDefaultMetrics({ register, prefix: 'sinistreflow_' });

const httpRequestsTotal = new client.Counter({
  name: 'sinistreflow_http_requests_total',
  help: 'Nombre de requêtes HTTP traitées',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'sinistreflow_http_request_duration_seconds',
  help: 'Durée de traitement des requêtes HTTP',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const errorsTotal = new client.Counter({
  name: 'sinistreflow_errors_total',
  help: 'Erreurs renvoyées par l\'API, par type',
  labelNames: ['type', 'status'],
  registers: [register],
});

const claimsDeclaredTotal = new client.Counter({
  name: 'sinistreflow_claims_declared_total',
  help: 'Déclarations de sinistre enregistrées',
  labelNames: ['type', 'late'],
  registers: [register],
});

const expertisesRecordedTotal = new client.Counter({
  name: 'sinistreflow_expertises_recorded_total',
  help: 'Rapports d\'expertise déposés par les partenaires',
  labelNames: ['partner'],
  registers: [register],
});

const apiVersionRequestsTotal = new client.Counter({
  name: 'sinistreflow_api_version_requests_total',
  help: 'Appels partenaires par version d\'API (pilotage de la dépréciation)',
  labelNames: ['version', 'partner'],
  registers: [register],
});

// eslint-disable-next-line no-new
new client.Gauge({
  name: 'sinistreflow_db_pool_connections',
  help: 'Connexions du pool PostgreSQL',
  labelNames: ['state'],
  registers: [register],
  collect() {
    this.set({ state: 'total' }, pool.totalCount);
    this.set({ state: 'idle' }, pool.idleCount);
    this.set({ state: 'waiting' }, pool.waitingCount);
  },
});

/** Middleware : mesure chaque requête. Le label "route" utilise le motif (/api/v2/claims/:reference)
 *  et non l'URL réelle, sinon une série par référence de dossier (explosion de cardinalité). */
function httpMetrics(req, res, next) {
  if (req.path === '/metrics') return next();
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    let route = 'unmatched';
    if (req.route) {
      // après un next(err), Express a déjà réinitialisé req.baseUrl : on le reconstitue depuis l'URL
      const prefix = req.baseUrl || (req.originalUrl.match(/^\/api\/[a-z0-9]+/) || [''])[0];
      route = `${prefix}${req.route.path}`;
    }
    else if (res.statusCode < 400 && !req.path.startsWith('/api')) route = 'static';
    const labels = { method: req.method, route, status: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    end(labels);
  });
  return next();
}

module.exports = {
  register,
  httpMetrics,
  errorsTotal,
  claimsDeclaredTotal,
  expertisesRecordedTotal,
  apiVersionRequestsTotal,
};
