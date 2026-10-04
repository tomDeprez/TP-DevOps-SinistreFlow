require('dotenv').config();

const env = process.env.NODE_ENV || 'development';

// SF-204 : plus aucun secret dans le code. En production, une variable manquante = arrêt immédiat.
function secret(name, devDefault) {
  const value = process.env[name];
  if (value) return value;
  if (env === 'production') {
    throw new Error(`Variable d'environnement obligatoire manquante : ${name}`);
  }
  return devDefault;
}

module.exports = {
  env,
  port: parseInt(process.env.PORT || '3000', 10),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'sinistreflow',
    password: secret('DB_PASSWORD', 'dev-only-password'),
    database: process.env.DB_NAME || 'sinistreflow',
  },
  backoffice: {
    user: process.env.BACKOFFICE_USER || 'gestionnaire',
    password: secret('BACKOFFICE_PASSWORD', 'dev-only-password'),
  },
  metrics: {
    // jeton optionnel exigé sur /metrics (en-tête Authorization: Bearer ...)
    token: process.env.METRICS_TOKEN || null,
  },
};
