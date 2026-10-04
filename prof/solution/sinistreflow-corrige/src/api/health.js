const express = require('express');
const db = require('../db/pool');
const pkg = require('../../package.json');

const router = express.Router();

// Liveness : le process Node répond (utilisé par le HEALTHCHECK Docker)
router.get('/health/live', (req, res) => {
  res.json({ status: 'UP' });
});

// SF-115 : readiness réelle, la base de données est vérifiée.
// 503 si PostgreSQL est indisponible -> le load-balancer et la supervision le voient.
router.get('/health', async (req, res) => {
  const started = Date.now();
  try {
    await db.query('SELECT 1');
    res.json({ status: 'UP', version: pkg.version, checks: { database: { status: 'UP', latencyMs: Date.now() - started } } });
  } catch (err) {
    res.status(503).json({ status: 'DOWN', version: pkg.version, checks: { database: { status: 'DOWN', error: err.code || err.message } } });
  }
});

module.exports = router;
