# Solution de référence — SinistreFlow corrigé

⛔ Réservé au formateur.

`sinistreflow-corrige/` = le dépôt étudiant avec **toutes** les missions faites :

| Mission | Où |
|---------|----|
| 22 correctifs (commentaires `// SF-xxx` dans le code) | `src/`, `public/js/wizard.js`, `Dockerfile`, `docker-compose.yml`, `.gitignore`, `.env.example` |
| Tests unitaires | `tests/unit/` |
| Tests d'intégration (vraie base) | `tests/integration/` |
| Tests E2E | `playwright.config.js`, `tests/e2e/` |
| CI/CD | `.github/workflows/ci.yml` |
| Supervision | `src/observability/`, `monitoring/` |
| Déploiement VM | `deploy/` |
| ADR / runbook | `docs/adr/0001-versioning-api.md`, `docs/RUNBOOK.md` |

Lancement : voir la section « Vérifications » du `README.md` à la racine du kit.

Le dossier n'est pas un dépôt Git : pour montrer l'historique attendu, référez-vous à
`prof/tools/expected-commits.txt` (un commit par ticket / mission).
