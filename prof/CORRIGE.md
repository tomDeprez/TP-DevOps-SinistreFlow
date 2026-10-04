# CORRIGÉ FORMATEUR — TP DevOps SinistreFlow

> ⛔ **Document réservé au formateur.** Ne pas distribuer, ne pas pousser dans le dépôt des étudiants.
>
> Solution complète et testée : `prof/solution/sinistreflow-corrige/`
> (104 tests unitaires + intégration verts, 9 tests E2E verts, connecteur ExpertAuto 25/25,
> recette officielle 97/100 en local — le seul KO local est `/metrics` public, normal sans nginx).

---

## 0. Vue d'ensemble des pièges

| Ticket | Couche | Cause en une ligne | Fichier (code étudiant) | Visible avec… | Casse le connecteur ? |
|--------|--------|--------------------|-------------------------|---------------|-----------------------|
| SF-101 | API | `req.headers['X-API-Key']` : Node met les en-têtes en minuscules | `src/api/middlewares/apiKey.js:10` | n'importe quel appel partenaire | ✅ étape 2 |
| SF-102 | domaine | `new Date(year, month, day)` sans `month - 1` | `src/domain/dates.js:10` | date < 1 mois | ✅ étape 4 (RDV J-2) |
| SF-103 | domaine | `/ (1000*60*60)` : des heures, pas des jours | `src/domain/dates.js:21` | après SF-102 | – (recette) |
| SF-104 | SQL | référence = `COUNT(*)+1` alors que des dossiers ont été supprimés | `src/repositories/claimRepository.js:11` | **dump uniquement** | – (recette, E2E) |
| SF-105 | domaine | `REFUSE: ['INDEMNISE', 'CLOS']` + test historique qui valide le bug | `src/domain/workflow.js:24`, `tests/unit/workflow.test.js` | back-office | – (recette) |
| SF-106 | domaine | franchise en € soustraite à des centimes, pas de plancher 0 | `src/domain/indemnity.js:8` | dépôt d'expertise | ✅ étape 5 |
| SF-107 | SQL | `offset = page * limit` avec page qui commence à 1 | `src/repositories/claimRepository.js:101` | ≤ 1 page de résultats | ✅ étape 2 (liste vide) |
| SF-108 | SQL / sécu | recherche par concaténation (`'%${q}%'`) | `src/repositories/claimRepository.js:122-124` | `D'Almeida` | – (recette) |
| SF-109 | API / données | v1/v2 lisent `claims.immatriculation` (obsolète depuis migration 8), v3 lit `vehicles` | `src/api/v1/claims.js:23`, `src/api/v2/claims.js:23` | **dump uniquement** (dossiers > 03/2025) | ✅ étapes 2, 3, 5 |
| SF-110 | API / driver | node-postgres renvoie les `BIGINT` en chaîne ; la v2 ne convertit pas | `src/db/pool.js` / `src/api/v2/claims.js:21-22` | v2 | ✅ étapes 3, 4 |
| SF-111 | driver / TZ | `DATE` → `Date` locale → `toISOString()` UTC = J-1 si `TZ=Europe/Paris` | `src/domain/dates.js:27` (+ `pool.js`) | **Docker / poste FR, pas la CI UTC** | ✅ étape 5 (RDV relu J-1) |
| SF-112 | SQL / données | `p.email = $2` alors que ~25 % des emails sont stockés avec majuscules | `src/repositories/contractRepository.js:9` | **dump uniquement** | – (recette, E2E) |
| SF-113 | domaine | `parseFloat` + `parseInt(x*100)` : virgule, espaces, flottants | `src/domain/money.js:9-13` | saisie FR | – (recette) |
| SF-114 | API | handler lit `err.statusCode`, les erreurs portent `err.status` ; stack renvoyée | `src/api/middlewares/errorHandler.js:4-7` | toute erreur | ✅ (masque SF-101 : 500 au lieu de 401) |
| SF-115 | exploitation | `/health` ne teste pas la base | `src/api/health.js:8` | `docker compose stop db` | – (recette, monitoring) |
| SF-301 | front | `state.complaint_number` alors que l'input s'appelle `complaintNumber` | `public/js/wizard.js:163` | E2E uniquement | – (recette API OK, E2E KO) |
| SF-201 | runtime | `app.listen(port, 'localhost')` | `src/index.js:4` | Docker uniquement | ✅ (sur VM) |
| SF-202 | compose | `DB_HOST=localhost` dans `.env`, `depends_on` sans healthcheck, 5432 publié | `docker-compose.yml`, `.env` | Docker uniquement | ✅ (sur VM) |
| SF-203 | migrations | `.sort()` lexicographique : `10_` avant `1_` | `src/db/migrate.js:22` | **base vide** (CI) | – (CI rouge) |
| SF-204 | sécu | `.env` versionné, secrets par défaut dans `config.js` | `.env`, `.gitignore`, `src/config.js:11,16` | lecture du dépôt | – |
| SF-205 | image | `node:22` complet, pas de `.dockerignore`, devDeps, root | `Dockerfile` | `docker images` | – |
| SF-206 | déploiement | migrations jamais jouées au déploiement (`partners` absente) | `Dockerfile` / compose | VM neuve | ✅ (500 relation partners) |

### Chaînes de masquage (à connaître pour aider les groupes)

- **SF-114 masque SF-101** : le partenaire voit `500 Clé API manquante` au lieu de `401`.
- **SF-102 masque SF-103** : avec le mauvais mois, un sinistre récent est « dans le futur » (refusé) ; une fois SF-102 corrigé, tous les sinistres > 5 h deviennent « tardifs ».
- **SF-107 masque SF-109** pour le connecteur : liste vide → il s'arrête avant de contrôler les plaques.
- **SF-109, SF-110, SF-102** apparaissent ensemble dès que la liste n'est plus vide ; **SF-106 et SF-111** n'apparaissent
  qu'une fois le dépôt d'expertise accepté (après SF-102) : le connecteur « avance » d'étape en étape, c'est voulu.
- **SF-203** n'apparaît **jamais** avec le dump (migrations 1-9 déjà appliquées, seule la 10 est en attente) : uniquement sur une base vide → la CI le révèle.
- **SF-111** n'apparaît **pas** sur un runner GitHub (UTC) si le groupe ne fixe pas `TZ` : excellent point à vérifier dans leurs tests (« ça marche sur la CI »).

### Ordre de progression du connecteur (code étudiant → solution)

Sortie réelle (vérifiée : correctifs appliqués un par un sur le code étudiant, dump restauré à chaque étape, `TZ=Europe/Paris`) :

```
état initial | 1 KO / 3   GET /api/v1/claims → HTTP 500 {"error":"Clé API manquante","stack":...}   (SF-101 + SF-114)
+ SF-101     | 1 KO / 4   0 dossier(s) reçu(s), total annoncé : 14                                (SF-107)
+ SF-107     | 4 KO / 13  10 dossiers sans immatriculation · vehiclePlate=None                    (SF-109)
             |            estimatedAmountCents type str ('254900')                               (SF-110)
             |            POST expertise → HTTP 500 « date de rendez-vous ... futur »            (SF-102 + SF-114)
+ SF-109     | 2 KO / 13  (SF-110, SF-102)
+ SF-110     | 1 KO / 13  (SF-102)
+ SF-102     | 2 KO / 25  indemnité attendu 214410 reçu 229260 (franchise 15000)                 (SF-106)
             |            RDV envoyé 2026-10-02, relu 2026-10-01                                 (SF-111)
+ SF-106     | 1 KO / 25  (SF-111)
+ SF-111     | SYNCHRONISATION CONFORME : 25/25
sur la VM    | + SF-201, SF-202, SF-206 (+ SF-204 pour la config) nécessaires pour que l'appli tourne en conteneur
```

> Windows : le code initial écoute sur `localhost`, que Node résout parfois en IPv6 (`::1`). Les étudiants doivent
> appeler `http://localhost:3000` (valeur par défaut du connecteur) et non `127.0.0.1` tant que SF-201 n'est pas corrigé.

---

## 1. Corrections détaillées

Chaque section : **cause → correctif (extrait de la solution) → test qui prouve → questions de compréhension**.

### SF-101 · en-tête X-API-Key
- **Cause** : Node.js normalise les noms d'en-têtes en minuscules dans `req.headers` → `req.headers['X-API-Key']` vaut toujours `undefined`.
- **Correctif** : `const apiKey = req.get('X-API-Key');` (insensible à la casse).
- **Test** : intégration — `request.get('/api/v1/claims').set('x-api-key', KEY)` → 200 ; sans clé → **401** (exige SF-114).
- **Questions** : pourquoi la RFC 9110 rend-elle les noms d'en-têtes insensibles à la casse ? Pourquoi stocker un hash de clé et pas la clé ?

### SF-102 · mois JavaScript
- **Cause** : `new Date(2026, 3, 15)` = 15 **avril**. Toute date du mois en cours ou du mois précédent tombe dans le futur.
- **Correctif** : `new Date(year, month - 1, day)` + contrôle aller-retour (rejette `2026-02-31` que JS transformerait en 3 mars).
- **Test** : unitaire `parseIsoDate('2026-03-15').getMonth() === 2`, `isFutureDate('2026-10-02', now=04/10)` faux, `2026-02-31` → null.
- **Questions** : pourquoi ce bug n'a-t-il pas été vu en 5 ans ? (il l'a été : c'est un changement récent… ou les tests n'existaient pas) ; date invalide « silencieuse » en JS.

### SF-103 · délai en heures
- **Cause** : `/(1000*60*60)` → résultat en heures, comparé à 5 « jours ».
- **Correctif** : `DAY_MS = 1000*60*60*24`.
- **Test** : cas limites J+5 (non tardif), J+6 (tardif), vol J+2 / J+3.
- **Questions** : délai « 2 jours ouvrés » de la loi : notre implémentation compte des jours calendaires → amélioration possible (à noter dans une issue, pas à corriger).

### SF-104 · référence COUNT(*)+1
- **Cause** : 460 dossiers créés, 35 supprimés → `COUNT(*)+1 = 426` → `SIN-2026-000426` existe déjà → violation d'unicité. L'index `uq_claims_reference_number` (migration 6) rend la collision indépendante de l'année. Sur base vide : aucun problème. Plus : non sûr en concurrence (deux transactions lisent le même COUNT).
- **Correctif** : `SELECT nextval('claim_reference_seq')` (séquence créée et positionnée par la migration 6, « TODO SF-58 » jamais fait).
- **Test** : intégration sur dump — la référence obtenue est > `last_value` initial ; deux déclarations → deux références.
- **Questions** : pourquoi une séquence a-t-elle des « trous » et pourquoi ce n'est pas grave ? Pourquoi `MAX()+1` serait aussi faux ?

### SF-105 · REFUSE → INDEMNISE
- **Cause** : transition autorisée dans la table, **et** validée par un test de 2022 (« geste commercial »).
- **Correctif** : `REFUSE: ['CLOS']` ; le test historique est réécrit (et la PR l'explique).
- **Test** : unitaire `canTransition('REFUSE','INDEMNISE') === false` ; « seul ACCEPTE peut mener à INDEMNISE » ; intégration back-office → 409.
- **Questions** : un test peut-il avoir tort ? Qui fait autorité : le test, le code, ou le métier ?

### SF-106 · franchise
- **Cause** : `contracts.franchise_eur` est en **euros**, les montants en centimes. 100000 − 150 = 99850 cts (998,50 €). Pas de plancher.
- **Correctif** : `Math.max(0, assessed - franchiseEur * 100)`.
- **Test** : 100000/150 → 85000 ; 12000/150 → 0.
- **Questions** : faut-il plutôt migrer la colonne en centimes ? (débat : migration de données en prod, outil de souscription qui écrit en €… → ADR possible).

### SF-107 · pagination
- **Cause** : page 1 → OFFSET 20 : la 1ʳᵉ page est toujours sautée ; avec 14 résultats et limit 50 → vide.
- **Correctif** : `offset = (page - 1) * limit`.
- **Test** : page 1 = les 5 plus récents (comparé à un SELECT direct) ; pages 1 et 2 disjointes.

### SF-108 · injection SQL
- **Cause** : interpolation de `q` dans le SQL. `D'Almeida` casse la syntaxe ; `%' OR 1=1 --` renvoie tout.
- **Correctif** : `ILIKE $1` avec `pattern = '%' + échappement(\\ % _) + '%'`, `LIMIT $2 OFFSET $3`.
- **Test** : apostrophe → résultats ; injection → `[]` ; `%` seul → `[]`.
- **Questions** : pourquoi l'échappement manuel des quotes n'est pas une solution ? Qu'est-ce qu'une requête préparée côté PostgreSQL ?

### SF-109 · versioning (le gros morceau)
- **Cause** : migration 8 (mars 2025) : plaques déplacées dans `vehicles.plate_number`, `claims.immatriculation` déclarée obsolète (commentaire SQL) et plus alimentée. `findDetailedByReference` (v3) joint `vehicles` ; `findByReference` / `list` (v1, v2) non.
  En base : 90 dossiers auto postérieurs à 03/2025, dont les 10 dossiers auto en attente d'expertise → tous `null`.
  ```sql
  SELECT count(*) FROM claims c JOIN vehicles v ON v.claim_id = c.id WHERE c.immatriculation IS NULL;
  ```
- **Le piège** : le CTO propose de ne garder que la v3.
  - Supprimer v1/v2 → le connecteur reçoit **404** sur `/api/v1/claims` → KO étape 2.
  - « Rediriger » v1/v2 vers le handler v3 → formats incompatibles (`data` vs `items`, `statut` FR vs `status` EN, euros vs centimes, `vehiclePlate` vs `vehicle.plate`) → KO immédiat.
  - Le connecteur n'est pas modifiable (contrat, 6 mois), AssurCompare (v1) non plus, l'appli mobile (v2) ≈ 3 mois.
  - ⇒ **Seule option viable : garder toutes les versions**, corriger la source de données commune.
- **Correctif** (solution) : `BASE_SELECT` joint `vehicles` et expose `COALESCE(v.plate_number, c.immatriculation) AS vehicle_plate` ; v1 `immatriculation` et v2 `vehiclePlate` lisent `vehicle_plate`. Bonus : en-têtes `Deprecation`/`Sunset`/`Link` sur v1, métrique `sinistreflow_api_version_requests_total{version,partner}`.
- **ADR modèle** : `prof/solution/sinistreflow-corrige/docs/adr/0001-versioning-api.md`.
- **Tests** : contrat par version (liste exacte des clés + types) ; cohérence v1 = v2 = v3 (plaque, date, montants).
- **Grille ADR (10 pts)** : contexte factuel avec consommateurs (2) · ≥ 2 options avec risques (2) · décision justifiée par les contraintes partenaires (2) · plan de dépréciation mesuré (2) · conséquences / règles d'équipe (2).
- **Questions** : « Le CTO insiste : que lui répondez-vous ? » ; « Quand pourra-t-on retirer la v1 ? » (trafic nul mesuré + Sunset passé) ; « Qu'est-ce qu'un test de contrat ? Consumer-driven contract ? »

### SF-110 · BIGINT en chaîne
- **Cause** : node-postgres (pg-types) renvoie l'OID 20 (`int8`) en string pour ne pas perdre de précision au-delà de 2^53. v3 fait `Number()`, v1 divise (coercition implicite), v2 renvoie brut.
- **Correctif** (solution) : `types.setTypeParser(20, v => parseInt(v, 10))` dans `pool.js` (corrige toutes les routes d'un coup). Accepté aussi : conversion dans le sérialiseur v2 (mais demander « et le prochain sérialiseur ? »).
- **Questions** : à partir de quel montant ce parser deviendrait faux ? (9 007 199 254 740 991 centimes ≈ 90 000 milliards d'€ → sans risque).

### SF-111 · fuseau horaire
- **Cause** : pg convertit `DATE '2026-10-02'` en `new Date(2026, 9, 2)` = minuit **heure locale** ; `toISOString()` → `2026-10-01T22:00:00Z` → `2026-10-01`. `Dockerfile` : `ENV TZ=Europe/Paris`. Runner GitHub en UTC → invisible en CI si le test ne fixe pas le fuseau.
- **Correctif** : `types.setTypeParser(1082, v => v)` (DATE reste une chaîne) **et/ou** `formatDate` avec `getFullYear/getMonth/getDate` (locaux).
- **Test** : unitaire avec `process.env.TZ = 'Europe/Paris'` ; intégration : date relue = date envoyée ; E2E : confirmation affiche la date saisie.
- **Questions** : « Pourquoi ne pas simplement mettre TZ=UTC dans le Dockerfile ? » (masque le bug ; les postes de dev en France le reproduisent ; la vraie cause est la conversion DATE → instant).

### SF-112 · casse de l'email
- **Cause** : import 2021 non normalisé (`Camille.Durand@Example.test`).
- **Correctif** : `lower(p.email) = lower($2)`. Bonus : `CREATE INDEX ... ON policyholders (lower(email))` (migration 11) ; normaliser à l'écriture.
- **Interdit** : modifier le dump / faire un UPDATE de masse sans le dire.

### SF-113 · montants FR
- **Cause** : `parseFloat("1 250,50") = 1` ; `parseInt(19.99*100) = 1998`.
- **Correctif** : normalisation (espaces, espaces insécables ` ` ` `, virgule), regex `^\d+(\.\d{1,2})?$`, calcul sur la chaîne (euros*100 + centimes).

### SF-114 · gestionnaire d'erreurs
- **Cause** : les erreurs métier ont `status`, le handler lit `statusCode` → toujours 500 ; `stack` renvoyée au client.
- **Correctif** : `err.status || err.statusCode || 500`, stack uniquement dans les logs, message générique pour les 500 en production.
- **Questions** : quelles informations une stack trace donne-t-elle à un attaquant ?

### SF-115 · /health
- **Correctif** : `SELECT 1` → 200 `{status:UP, checks:{database:UP}}` sinon **503**. Bonus : `/health/live` (liveness, utilisé par le HEALTHCHECK Docker) vs `/health` (readiness).
- **Questions** : pourquoi le HEALTHCHECK Docker ne doit-il pas pointer sur la readiness ? (sinon la panne de base fait redémarrer l'app en boucle).

### SF-301 · numéro de plainte
- **Cause** : `public/js/wizard.js:163` lit `state.complaint_number`, l'input se nomme `complaintNumber`.
- **Correctif** : `state.complaintNumber`. **Test** : E2E cambriolage. Bon exemple « invisible pour les tests unitaires/intégration ».

### SF-201 · listen localhost
- `app.listen(config.port)` (0.0.0.0). **Questions** : différence entre `EXPOSE`, `ports:` et l'adresse d'écoute.

### SF-202 · compose
- `environment: DB_HOST: db` (ou `.env` docker), `healthcheck: pg_isready`, `depends_on: condition: service_healthy`, plus de `ports: 5432:5432` (fichier `docker-compose.dev.yml` qui publie sur `127.0.0.1` pour les tests locaux).

### SF-203 · ordre des migrations
- `.sort((a, b) => parseInt(a) - parseInt(b))` (ou renommer en `001_…` — accepté **si** `schema_migrations` reste cohérent : la version est parsée en entier, donc OK).
- **Test** : intégration qui crée une base vide, lance `migrate.js`, vérifie 10 versions, relance (idempotence).

### SF-204 · secrets
- Attendus : `git rm --cached .env`, `.gitignore`, `.env.example`, `config.js` sans secrets (arrêt si variable manquante en prod), secrets CI dans GitHub Secrets, **rotation** des mots de passe DB / back-office (nouveaux sur la VM), procédure de rotation de la clé partenaire dans le runbook (coordonnée avec le partenaire : nouvelle ligne `partners`, bascule, désactivation).
- Réécriture d'historique (`git filter-repo`) : discussion, pas exigée — le point clé est « un secret publié est compromis → rotation ».

### SF-205 · image
- Multi-étapes `node:22-alpine`, `npm ci --omit=dev`, `.dockerignore`, `USER node`, `HEALTHCHECK`. Mesure attendue dans la PR : ~1,1 Go → ~200 Mo.

### SF-206 · migrations au déploiement
- Service compose `migrate` one-shot + `depends_on: condition: service_completed_successfully`. Alternative : entrypoint. **Questions** : concurrence si 2 instances (verrou `pg_advisory_lock` en bonus).

---

## 2. Missions transverses

| Mission | Référence dans la solution |
|---------|----------------------------|
| Tests unitaires (SF-401) | `tests/unit/*.test.js` — 6 fichiers, couverture `src/domain` > 90 % |
| Tests d'intégration (SF-402) | `tests/integration/*.test.js` — contrats v1/v2/v3, migrations base vide, health 503 |
| E2E (SF-403) | `playwright.config.js`, `tests/e2e/*.spec.js` — 9 scénarios |
| CI (SF-404/405) | `.github/workflows/ci.yml` — commits, unit, integration, e2e, partner, docker GHCR, deploy SSH |
| Métriques (SF-501) | `src/observability/metrics.js` + route `/metrics` dans `src/app.js` |
| Stack (SF-502) | `monitoring/docker-compose.monitoring.yml`, `monitoring/prometheus/`, `monitoring/grafana/` (dashboard 24 panneaux provisionné) |
| Alertes (SF-503) | `monitoring/prometheus/alerts.yml` (10 règles), `monitoring/alertmanager/alertmanager.yml` |
| Logs (SF-504) | `src/observability/logger.js` |
| VM (SF-601/602) | `deploy/provision-vm.sh`, `deploy/deploy.sh` (rollback), `deploy/nginx/sinistreflow.conf` |
| Runbook (SF-604) | `docs/RUNBOOK.md` |

Secrets GitHub nécessaires pour la CI de la solution : `EXPERTAUTO_API_KEY` (= `ea_live_7f3c9a1e5b2d4f60`) ;
pour le déploiement : `VM_HOST`, `VM_USER`, `VM_SSH_KEY`, variable `PRODUCTION_URL`.

---

## 3. Recette complémentaire (optionnelle — la note se fait sur le dépôt GitHub)

Sur une stack démarrée depuis le dépôt du groupe (ou sur sa VM si elle est encore accessible) :

```bash
# rejouer sur une base fraîche si le groupe a "consommé" les dossiers
bash db/restore.sh && docker compose run --rm migrate

SINISTREFLOW_URL=http://127.0.0.1:3000 EXPERTAUTO_API_KEY=ea_live_7f3c9a1e5b2d4f60 \
BO_USER=gestionnaire BO_PASSWORD='<mdp du groupe>' PUBLIC_URL=http://<ip-publique> \
python3 /chemin/vers/prof/recette-partenaire/recette_officielle.py partner-client/expertauto_sync.py
```

- Copiez le script sur la VM au moment de la recette (`scp`), **ne le laissez pas** sur la VM ensuite.
- Le script affiche un score /100 et les tickets à revoir. Il détecte notamment : versions supprimées,
  « faux » correctifs qui ne passent que le chemin du connecteur, base ou `/metrics` exposés sur Internet.

Vérification des commits :

```bash
git clone <depot-du-groupe> /tmp/g1
bash prof/tools/check-commits.sh /tmp/g1 main
```

---

## 4. Questions pour vérifier la compréhension (optionnel)

1. Montrez-moi le test qui prouve SF-xxx. Faites-le échouer en annulant votre correctif.
2. Pourquoi SF-104 / SF-109 / SF-112 ne se voyaient-ils pas en recette sur une base vide ?
3. « Ça marche sur la CI mais pas en prod » : racontez SF-111.
4. La base tombe à 3 h du matin : que se passe-t-il, minute par minute, avec votre installation ?
5. Votre déploiement a échoué après la migration : que fait `deploy.sh` ? Et la base ?
6. Pourquoi Prometheus n'est-il pas exposé publiquement ? Comment y accédez-vous ?
7. Que mesure `histogram_quantile(0.95, …)` ? Pourquoi pas la moyenne ?
8. Pourquoi l'étiquette `route` vaut-elle `/api/v2/claims/:reference` et pas l'URL ?
9. Le CTO veut supprimer la v1 le mois prochain : que lui répondez-vous, chiffres à l'appui ?
10. Différence entre un test d'intégration et un test E2E sur SF-301 ?
11. Pourquoi la clé partenaire est-elle stockée hachée ? Comment la faire tourner ?
12. Qu'est-ce qui, dans votre pipeline, aurait empêché chacun des bugs de 2025 d'arriver en production ?
