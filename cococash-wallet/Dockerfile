# Stage 1 - Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build


# Stage 2 - Runtime
FROM node:20-alpine

WORKDIR /app

# instalar wget para healthcheck
RUN apk add --no-cache wget

COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/v1/health || exit 1

CMD ["node", "dist/server.js"]