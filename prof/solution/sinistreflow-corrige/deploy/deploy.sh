#!/usr/bin/env bash
# Déploiement d'une version de SinistreFlow sur la VM, avec retour arrière automatique.
#   bash deploy/deploy.sh ghcr.io/<org>/sinistreflow:<sha>
# Sans argument : reconstruit l'image localement depuis le code du dépôt.
set -euo pipefail

cd "$(dirname "$0")/.."
NEW_IMAGE="${1:-sinistreflow:local}"
PREVIOUS_IMAGE="$(grep -E '^APP_IMAGE=' .env | cut -d= -f2- || true)"
COMPOSE="docker compose -f docker-compose.yml -f monitoring/docker-compose.monitoring.yml"

set_image() { sed -i "s|^APP_IMAGE=.*|APP_IMAGE=$1|" .env; }

wait_healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:3000/health > /dev/null; then return 0; fi
    sleep 2
  done
  return 1
}

echo "== Déploiement de $NEW_IMAGE (précédente : ${PREVIOUS_IMAGE:-aucune})"
set_image "$NEW_IMAGE"
if [ "$NEW_IMAGE" = "sinistreflow:local" ]; then
  $COMPOSE build app
else
  $COMPOSE pull app migrate
fi

# migrations puis application (cf. depends_on dans docker-compose.yml)
if $COMPOSE up -d --remove-orphans && wait_healthy; then
  echo "== Application saine, contrôle du partenaire ExpertAuto"
  set -a; [ -f partner.env ] && . ./partner.env; set +a
  if SINISTREFLOW_URL=http://127.0.0.1:3000 python3 partner-client/expertauto_sync.py; then
    echo "== Déploiement réussi : $NEW_IMAGE"
    exit 0
  fi
  echo "!! Le connecteur partenaire échoue"
else
  echo "!! L'application ne répond pas sur /health"
fi

$COMPOSE logs --tail 50 app migrate || true
if [ -n "$PREVIOUS_IMAGE" ] && [ "$PREVIOUS_IMAGE" != "$NEW_IMAGE" ]; then
  echo "== Retour arrière vers $PREVIOUS_IMAGE"
  set_image "$PREVIOUS_IMAGE"
  $COMPOSE up -d app
  wait_healthy && echo "== Version précédente restaurée"
fi
exit 1
