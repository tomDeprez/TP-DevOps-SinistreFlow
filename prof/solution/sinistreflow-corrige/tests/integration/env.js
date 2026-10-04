// Chargé avant chaque fichier de test d'intégration.
// Prérequis : base PostgreSQL restaurée depuis le dump de production puis migrée
//   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
//   bash db/restore.sh && DB_HOST=localhost npm run migrate
process.env.NODE_ENV = 'test';
process.env.TZ = 'Europe/Paris';
process.env.DB_HOST = process.env.DB_HOST_TEST || 'localhost';
process.env.BACKOFFICE_USER = 'gestionnaire';
process.env.BACKOFFICE_PASSWORD = 'test-bo-password';
