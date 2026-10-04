# ADR 0001 — Stratégie de versioning de l'API partenaires

- **Statut** : accepté
- **Date** : 2026-10-07
- **Décideurs** : équipe SinistreFlow, CTO MutuAlp, référent partenaires
- **Ticket** : SF-109

## Contexte

SinistreFlow expose trois versions de son API partenaires :

| Version | Date | Format | Consommateurs connus |
|---------|------|--------|----------------------|
| v1 | 2021 | snake_case, statuts FR, montants en euros | ExpertAuto (liste), AssurCompare (lecture) |
| v2 | 2023 | camelCase, montants en centimes | ExpertAuto (détail + dépôt d'expertise), appli mobile MutuAlp |
| v3 | 2025 | ressource imbriquée, statuts EN, véhicule + expertise | ExpertAuto (contrôle), back-office |

Le ticket SF-109 signale que l'immatriculation (`immatriculation` en v1, `vehiclePlate` en v2) est
`null` pour tous les dossiers déclarés depuis mars 2025. **Cause** : la migration 8 a déplacé les
véhicules dans la table `vehicles` ; la v3 a été adaptée, mais v1 et v2 lisent toujours l'ancienne
colonne `claims.immatriculation`, qui n'est plus alimentée.

Le CTO a proposé de « supprimer v1 et v2 et de ne garder que la v3 ».

## Options étudiées

### Option A — Ne garder que la v3

- ✅ Une seule version à maintenir.
- ❌ Le connecteur ExpertAuto appelle `/api/v1` et `/api/v2` : il reçoit des **404**. Son code
  n'est pas modifiable par MutuAlp (contrat EA-MA-2023-07, délai de changement : 6 mois).
- ❌ Rediriger `/api/v1` vers le contrôleur v3 ne marche pas non plus : les **formats sont
  incompatibles** (`statut: "EXPERTISE_EN_COURS"` vs `status: "ASSESSMENT_PENDING"`, euros vs
  centimes, objets imbriqués...). Le connecteur casse sur `KeyError`.
- ❌ L'appli mobile (v2) et AssurCompare (v1) cassent aussi.
- **Résultat : rupture de contrat avec un partenaire, arrêt des expertises → arrêt des indemnisations.**

### Option B — Garder toutes les versions, une source de vérité commune (**retenue**)

- Une seule requête de lecture (`BASE_SELECT`) qui joint `vehicles` avec repli sur l'ancienne
  colonne : `COALESCE(v.plate_number, c.immatriculation)`.
- Chaque version n'est plus qu'un **adaptateur de format** (sérialiseur) au-dessus du même modèle.
- Les **contrats** de chaque version sont figés par des tests d'intégration (liste exacte des champs,
  types JSON) : une évolution interne ne peut plus casser silencieusement une ancienne version.

## Décision

Option B. Toutes les versions restent servies.
La v1 est **dépréciée** (en-têtes `Deprecation: true`, `Sunset: Wed, 30 Jun 2027 23:59:59 GMT`,
`Link: </api/v3>; rel="successor-version"`) et l'usage de chaque version est mesuré par la métrique
`sinistreflow_api_version_requests_total{version, partner}`.

## Plan de décommissionnement de la v1

1. Prévenir les consommateurs (courrier + en-têtes de dépréciation) — **T0**.
2. Accompagner ExpertAuto vers la v3 (demande de changement contractuelle, ~6 mois).
3. Suivre le tableau de bord Grafana « Usage des versions d'API ».
4. Couper la v1 **uniquement** quand le trafic v1 est nul depuis 30 jours, après la date de Sunset.
5. Pendant toute la période : la v1 renvoie toujours les mêmes données que v2/v3 (tests de cohérence).

## Conséquences

- 3 sérialiseurs à maintenir tant que les versions vivent (coût faible : pure transformation).
- Toute modification du schéma de base doit être répercutée dans la requête commune et validée
  par les tests de contrat des 3 versions **avant** déploiement.
- Règle d'équipe : on n'ajoute jamais un champ obligatoire / on ne renomme jamais un champ dans une
  version publiée ; on crée une nouvelle version.
