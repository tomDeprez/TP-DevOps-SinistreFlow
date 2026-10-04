#!/usr/bin/env bash
# Préparation d'une VM Ubuntu 24.04 LTS pour SinistreFlow. À lancer UNE fois, en root :
#   sudo bash provision-vm.sh <utilisateur-de-deploiement>
set -euo pipefail

DEPLOY_USER="${1:-deploy}"
APP_DIR=/opt/sinistreflow

echo "== Mises à jour système et paquets de base"
apt-get update -q
DEBIAN_FRONTEND=noninteractive apt-get upgrade -yq
DEBIAN_FRONTEND=noninteractive apt-get install -yq ca-certificates curl git ufw fail2ban nginx python3 unattended-upgrades

echo "== Docker Engine + plugin compose (dépôt officiel)"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  DEBIAN_FRONTEND=noninteractive apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "== Utilisateur de déploiement"
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
mkdir -p "$APP_DIR"
chown "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"

echo "== SSH : clés uniquement, pas de root"
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd

echo "== Pare-feu : SSH + HTTP(S) uniquement (PostgreSQL, Prometheus... jamais exposés)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "== Reverse proxy nginx"
cp "$(dirname "$0")/nginx/sinistreflow.conf" /etc/nginx/sites-available/sinistreflow.conf
ln -sf /etc/nginx/sites-available/sinistreflow.conf /etc/nginx/sites-enabled/sinistreflow.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "== Mises à jour de sécurité automatiques"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "VM prête. Étape suivante : cloner le dépôt dans $APP_DIR (utilisateur $DEPLOY_USER) et créer .env"
