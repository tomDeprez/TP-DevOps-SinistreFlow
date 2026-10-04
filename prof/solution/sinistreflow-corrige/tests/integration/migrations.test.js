/**
 * SF-203 : toutes les migrations doivent passer sur une base VIDE (nouvel environnement, CI, reprise d'activité).
 * Le test crée une base temporaire, lance le vrai script de migration, puis la supprime.
 */
const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');
const { Client } = require('pg');
const { db } = require('./helpers');

const FRESH_DB = `sf_migrations_${Date.now()}`;
const config = require('../../src/config');

async function admin(sql) {
  const client = new Client({ ...config.db, database: 'postgres' });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

beforeAll(() => admin(`CREATE DATABASE ${FRESH_DB}`));
afterAll(async () => {
  await admin(`DROP DATABASE IF EXISTS ${FRESH_DB} WITH (FORCE)`);
  await db.pool.end();
});

test('toutes les migrations s\'appliquent dans l\'ordre sur une base vide', async () => {
  const output = execFileSync('node', ['src/db/migrate.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, DB_NAME: FRESH_DB },
    encoding: 'utf8',
  });
  expect(output).toContain('Migrations OK');

  const files = fs.readdirSync(path.join(__dirname, '..', '..', 'migrations')).filter((f) => f.endsWith('.sql'));
  const client = new Client({ ...config.db, database: FRESH_DB });
  await client.connect();
  const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version');
  await client.end();
  expect(rows.map((r) => r.version)).toEqual(files.map((f) => parseInt(f, 10)).sort((a, b) => a - b));
});

test('relancer les migrations ne fait rien (idempotence)', () => {
  const output = execFileSync('node', ['src/db/migrate.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, DB_NAME: FRESH_DB },
    encoding: 'utf8',
  });
  expect(output).not.toContain('→ migration');
});
