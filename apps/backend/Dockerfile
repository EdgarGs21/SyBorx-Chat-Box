# ==========================================
# Etapa 1: Base
# ==========================================
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ==========================================
# Etapa 2: Desarrollo
# ==========================================
FROM base AS development
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ==========================================
# Etapa 3: Compilación (Builder)
# ==========================================
FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --production

# ==========================================
# Etapa 4: Producción
# ==========================================
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Crear usuario seguro sin privilegios de root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeuser

# Crear directorio de subidas con permisos adecuados
RUN mkdir -p /app/uploads && chown -R nodeuser:nodejs /app/uploads

COPY --from=builder --chown=nodeuser:nodejs /app/package*.json ./
COPY --from=builder --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodeuser:nodejs /app/dist ./dist

USER nodeuser
EXPOSE 3000
CMD ["node", "dist/app.js"]
