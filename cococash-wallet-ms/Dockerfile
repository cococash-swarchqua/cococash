FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
# Copiamos el schema SQL para la auto-migración
COPY src/db/schema.sql ./dist/db/schema.sql
EXPOSE 3000
CMD ["node", "dist/app.js"]
