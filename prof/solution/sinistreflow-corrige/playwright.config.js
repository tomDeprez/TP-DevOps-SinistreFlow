// Tests End-to-End : un vrai navigateur pilote l'application démarrée avec une vraie base.
// Prérequis : base restaurée + migrée (voir tests/integration/env.js). Lancement : npm run test:e2e
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.E2E_PORT || 3100;
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // démarre l'application si E2E_BASE_URL n'est pas fourni (sinon : on teste un environnement déjà déployé)
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'node src/index.js',
    url: `${BASE_URL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      PORT: String(PORT),
      NODE_ENV: 'development',
      TZ: 'Europe/Paris',
      DB_HOST: process.env.DB_HOST_TEST || 'localhost',
      BACKOFFICE_USER: 'gestionnaire',
      BACKOFFICE_PASSWORD: 'e2e-bo-password',
    },
  },
});
