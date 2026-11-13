# ----------------------------------------------------
# 1. ETAPA DE CONSTRUCCIÓN (BUILDER)
# ----------------------------------------------------
FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ----------------------------------------------------
# 2. ETAPA DE PRODUCCIÓN FINAL (RUNNER)
# ----------------------------------------------------
FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Utilidad ligera dumb-init para gestión de señales SIGTERM/SIGINT del kernel
RUN apk add --no-cache dumb-init

# Copiar solo dependencias limpias de producción y código fuente
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY deploy ./deploy

# Ejecutar como usuario sin privilegios por seguridad
RUN mkdir -p /app/uploads/photos && chown -R node:node /app/uploads
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
