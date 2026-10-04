# syntax=docker/dockerfile:1

# ---- étape 1 : dépendances de production uniquement ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- étape 2 : image d'exécution minimale ----
FROM node:22-alpine
RUN apk add --no-cache tzdata
# Fuseau métier conservé volontairement : le code ne dépend plus du fuseau (SF-111)
ENV NODE_ENV=production \
    TZ=Europe/Paris \
    PORT=3000
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY migrations ./migrations

# SF-205 : on ne tourne pas en root
USER node

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live > /dev/null || exit 1

CMD ["node", "src/index.js"]
