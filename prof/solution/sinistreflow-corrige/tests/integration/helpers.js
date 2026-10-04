const supertest = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db/pool');

const API_KEY = process.env.EXPERTAUTO_API_KEY || 'ea_live_7f3c9a1e5b2d4f60';
const BO_AUTH = `Basic ${Buffer.from('gestionnaire:test-bo-password').toString('base64')}`;

const request = supertest(app);

const partner = {
  get: (url) => request.get(url).set('X-API-Key', API_KEY),
  post: (url) => request.post(url).set('X-API-Key', API_KEY),
};

const backoffice = {
  get: (url) => request.get(url).set('Authorization', BO_AUTH),
  post: (url) => request.post(url).set('Authorization', BO_AUTH),
};

const isoDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Prend un dossier AUTO en attente d'expertise (consomme la donnée : utiliser une fois). */
async function takePendingAutoClaim() {
  const { rows } = await db.query(
    `SELECT c.reference FROM claims c JOIN contracts ct ON ct.id = c.contract_id
     WHERE c.status = 'EXPERTISE_EN_COURS' AND ct.product = 'AUTO'
     ORDER BY c.declared_at LIMIT 1`,
  );
  if (!rows[0]) throw new Error('Plus de dossier AUTO en attente : restaurez la base (bash db/restore.sh)');
  return rows[0].reference;
}

module.exports = { request, partner, backoffice, db, isoDaysAgo, takePendingAutoClaim, API_KEY };
