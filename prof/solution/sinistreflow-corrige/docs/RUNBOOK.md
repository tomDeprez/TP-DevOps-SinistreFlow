# Runbook d'exploitation SinistreFlow

## Accès

| Quoi | Où | Comment |
|------|----|---------|
| Application | `http://<ip-vm>/` | public (nginx → 127.0.0.1:3000) |
| Grafana | `http://<ip-vm>/grafana/` | compte admin, mot de passe `GRAFANA_ADMIN_PASSWORD` |
| Prometheus | `http://localhost:9090` | `ssh -L 9090:127.0.0.1:9090 deploy@<ip-vm>` |
| Alertmanager | `http://localhost:9093` | `ssh -L 9093:127.0.0.1:9093 deploy@<ip-vm>` |
| Base | – | `docker compose exec db psql -U sinistreflow` (jamais exposée) |

`COMPOSE="docker compose -f docker-compose.yml -f monitoring/docker-compose.monitoring.yml"`

## Déployer une version

```bash
cd /opt/sinistreflow && git pull
bash deploy/deploy.sh ghcr.io/<org>/sinistreflow:<sha>    # ou sans argument : build local
```
Le script : pull de l'image → migrations → démarrage → attente `/health` → connecteur ExpertAuto.
En cas d'échec il remet automatiquement l'image précédente.
⚠️ Les migrations SQL ne sont **pas** annulées par le retour arrière : une migration doit toujours
rester compatible avec la version N-1 du code (ajouter une colonne oui, renommer / supprimer non).

## Alertes → réaction

| Alerte | Premier diagnostic | Action |
|--------|--------------------|--------|
| `SinistreFlowInjoignable` | `$COMPOSE ps`, `$COMPOSE logs --tail 100 app` | `$COMPOSE up -d app` ; si crash au démarrage : variable manquante dans `.env` ? |
| `SinistreFlowHealthKO` | `curl -s 127.0.0.1:3000/health` → `checks.database` | voir PostgreSQLDown |
| `PostgreSQLDown` | `$COMPOSE logs db`, `df -h` (disque plein ?) | libérer de l'espace, `$COMPOSE up -d db` |
| `TauxErreurs5xxEleve` | Grafana « Errors par code », logs `level=error` | dernière mise en prod ? → `deploy.sh <image précédente>` |
| `LatenceP95Elevee` | panneau « Pool PostgreSQL » (waiting > 0 ?), CPU VM | requête lente : `pg_stat_activity` |
| `PartenaireRejete` | logs `request_rejected` + `status:401` | clé partenaire expirée / désactivée (`partners.active`) |
| `DisquePresquePlein` | `docker system df`, `du -sh /var/lib/docker` | `docker image prune -a` (garder l'image N-1) |

## Sauvegarde / restauration

```bash
# sauvegarde quotidienne (cron 02:00)
docker compose exec -T db pg_dump -U sinistreflow sinistreflow | gzip > /var/backups/sinistreflow_$(date +%F).sql.gz
# restauration
gunzip -c /var/backups/sinistreflow_AAAA-MM-JJ.sql.gz > /tmp/restore.sql && bash db/restore.sh /tmp/restore.sql
$COMPOSE run --rm migrate
```

## Rotation de la clé ExpertAuto

1. Générer une clé : `openssl rand -hex 16` → `ea_live_<valeur>`.
2. `INSERT INTO partners (name, api_key_hash) VALUES ('ExpertAuto-2027', encode(sha256('<clé>'), 'hex'));`
3. Transmettre la clé au partenaire par un canal sûr, attendre sa bascule (métrique par partenaire).
4. `UPDATE partners SET active = false WHERE name = 'ExpertAuto';`
