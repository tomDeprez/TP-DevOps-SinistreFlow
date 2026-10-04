# TP DevOps « SinistreFlow » — kit formateur IT-Akademy

TP de **4 jours** : reprise du code d'une entreprise (fictive), correction de 22 bugs avec un commit imposé par
ticket, 3 couches de tests, CI GitHub Actions, déploiement sur VM avec une base de production existante,
partenaire externe qui consomme une API versionnée, et ajout de la supervision.

## Contenu

```
.
├── sujet/                          ← À DISTRIBUER aux étudiants
│   ├── TP-DevOps-SinistreFlow.html    sujet complet (charte IT-Akademy, 13 schémas, indices repliables)
│   ├── TP-DevOps-SinistreFlow.pdf     version imprimable (sans les indices)
│   └── assets/logo-it-akademy.png
│
├── sinistreflow/                   ← À DISTRIBUER : le dépôt "entreprise" buggé (à pousser sur GitHub)
│   ├── src/ public/                   application Node.js/Express + front (22 bugs plantés)
│   ├── migrations/                    10 migrations SQL (la 10 jamais jouée en prod)
│   ├── db/dump/                       dump PostgreSQL de "production" (425 dossiers, pièges de données)
│   ├── partner-client/                connecteur Python du partenaire ExpertAuto (NE PAS MODIFIER) → en échec au départ
│   ├── docs/                          TICKETS.md (symptômes + commits imposés), API.md, ARCHITECTURE.md
│   └── tests/                         2 tests "legacy" (dont un qui valide un bug)
│
└── prof/                           ← ⛔ NE PAS DISTRIBUER
    ├── CORRIGE.md                     cause / correctif / test / questions de compréhension par ticket
    ├── solution/sinistreflow-corrige/ solution complète : correctifs, 113 tests, CI, monitoring, déploiement, ADR, runbook
    ├── recette-partenaire/            recette officielle "cachée" (score /100) à lancer sur la VM de chaque groupe
    └── tools/                         vérification des commits, génération du dump
```

## Préparation (J-7)

1. **Dépôt modèle** : poussez `sinistreflow/` dans votre organisation GitHub et cochez *Template repository*
   (ou utilisez GitHub Classroom). **Committez le `.env` tel quel** : un secret présent dans l'historique fait partie de SF-204.
   ```bash
   cd sinistreflow
   git init -b main && git add . && git commit -m "chore: état du dépôt au départ de Thomas (29/08/2026)"
   git remote add origin git@github.com:<org>/sinistreflow-template.git
   git push -u origin main
   ```
2. **VM** : une VM Ubuntu 24.04 par groupe (2 vCPU, 4 Go RAM, 20 Go disque, IP publique ou réseau de l'école),
   accès SSH par clé. Le groupe doit pouvoir la réinstaller s'il la casse.
3. **Sujet** : distribuez `sujet/` (HTML recommandé : les indices s'y déplient ; le PDF n'en contient pas).
4. **Optionnel** : un salon Discord avec un webhook par groupe pour les alertes.
5. **Vérifier chez vous** (10 min) — voir « Vérifications » ci-dessous.

## Jalons et rendu

| Quand | Jalon (à voir dans le dépôt) |
|-------|------------------------------|
| J1 | stack locale + dump, 1ʳᵉ PR fusionnée, `docs/JOURNAL.md` |
| J2 | ADR `docs/adr/0001-versioning-api.md` fusionnée (grille dans `prof/CORRIGE.md`) |
| J3 | pipeline vert sur `main` (onglet *Actions*) |
| J4 | **rendu = lien du dépôt GitHub** (privé, formateur invité) |

### Corriger un rendu

1. `git clone` du dépôt du groupe, puis `bash prof/tools/check-commits.sh <clone> main` (commits exacts + répartition par auteur).
2. Onglet *Actions* : pipeline vert sur `main`, job de recette ExpertAuto présent. Relancez-le (*Re-run jobs*) pour vérifier qu'il passe encore.
3. Lecture de l'ADR, des tests (`tests/unit`, `tests/integration`, `tests/e2e`), de `monitoring/`, `deploy/`, `docs/RUNBOOK.md`.
4. `docs/preuves/` : connecteur vert sur la VM, Grafana, alerte reçue, game day, `ufw status`.
5. Optionnel, pour aller plus loin : lancez les tests de `prof/solution` contre leur code, ou la recette
   `prof/recette-partenaire/recette_officielle.py` sur une stack démarrée depuis leur dépôt (elle détecte les « faux » correctifs).

## Le piège central (SF-109)

v1 et v2 de l'API ne renvoient plus l'immatriculation pour les dossiers récents (migration 8 non répercutée).
Le CTO propose de **ne garder que la v3**. Le connecteur ExpertAuto appelle **v1 + v2 + v3** et n'est pas modifiable :
un groupe qui supprime ou « redirige » les anciennes versions voit le connecteur casser (dans sa CI et sur sa VM).
La bonne réponse : garder toutes les versions, une lecture commune, des tests de contrat par version, une dépréciation mesurée.

## Pourquoi ce TP résiste (mieux) à « l'IA fait tout en 1 h »

Ce qui ne peut pas être délégué à un assistant qui ne lit que le code :

- **Bugs dépendants des données** (SF-104, SF-109, SF-112) : invisibles sur base vide, il faut restaurer et interroger le dump.
- **Bugs dépendants de l'environnement** (SF-111 fuseau horaire, SF-201/202 réseau Docker, SF-203 base vide, SF-206) :
  ils n'apparaissent qu'en exécutant le système dans le bon contexte (conteneur, CI, VM).
- **Bugs qui se masquent** (SF-114 → SF-101, SF-102 → SF-103, SF-107 → SF-109) : la progression est itérative.
- **Une décision d'architecture** (ADR) fondée sur des contraintes métier lues dans la doc.
- **Une vraie VM** à sécuriser et à exploiter, avec des preuves (captures, sorties) à déposer dans le dépôt.
- **Un pipeline qui rejoue le connecteur partenaire** : impossible de « faire semblant » sur `main`.
- **L'historique Git** : commits exacts, un test par correctif, répartition du travail visible par auteur.

Soyons honnêtes : un assistant de code reste très utile sur ce TP. Le sujet n'en parle pas aux étudiants ;
ce sont les bugs dépendants des données et de l'environnement qui imposent de faire tourner le système pour de vrai.

## Outils formateur

```bash
# vérifier les 35 messages de commit attendus + la répartition par auteur
bash prof/tools/check-commits.sh /chemin/vers/clone-du-groupe main

# recette officielle sur la VM du groupe (copier le script, l'exécuter, le supprimer)
SINISTREFLOW_URL=http://127.0.0.1:3000 EXPERTAUTO_API_KEY=ea_live_7f3c9a1e5b2d4f60 \
BO_USER=gestionnaire BO_PASSWORD='<mdp>' PUBLIC_URL=http://<ip-publique> \
python3 recette_officielle.py partner-client/expertauto_sync.py

# régénérer le dump (Docker requis) — déterministe, mêmes données à chaque fois
bash prof/tools/build-dump.sh
```

## Vérifications

```bash
# 1. Le code étudiant est bien cassé
cd sinistreflow && npm install && docker compose up -d db && bash db/restore.sh && npm run migrate && npm start
EXPERTAUTO_API_KEY=ea_live_7f3c9a1e5b2d4f60 python3 partner-client/expertauto_sync.py   # → NON CONFORME

# 2. La solution passe tout
cd prof/solution/sinistreflow-corrige && cp .env.example .env   # renseigner DB_PASSWORD, BACKOFFICE_PASSWORD, GRAFANA_ADMIN_PASSWORD
npm install && docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
bash db/restore.sh && DB_HOST=localhost npm run migrate
npm test                      # unitaires + intégration
npx playwright install chromium && npm run test:e2e
docker compose up -d --build && EXPERTAUTO_API_KEY=ea_live_7f3c9a1e5b2d4f60 python3 partner-client/expertauto_sync.py  # → 25/25
```

Ce qui a été vérifié lors de la construction du kit (Docker Desktop 29, Node 24, Python 3.14, PostgreSQL 16) :
connecteur KO sur le code étudiant et 25/25 sur la solution ; progression du connecteur ticket par ticket
(documentée dans `prof/CORRIGE.md`) ; 104 tests unitaires + intégration et 9 E2E verts sur la solution,
68 d'entre eux rouges sur le code étudiant ; stack de supervision complète démarrée (6 cibles Prometheus UP,
tableau de bord Grafana provisionné) ; configs Prometheus/Alertmanager validées par `promtool`/`amtool` ;
recette officielle 97/100 en local. **Non exécutés ici** : le workflow GitHub Actions sur de vrais runners et les scripts
de provisionnement/déploiement sur une VM Ubuntu réelle — à tester une fois avant la session.
"# TP-DevOps-SinistreFlow" 
