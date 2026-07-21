# Multi-stage build: compile TypeScript in a full node image, run on a slim one.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

# Coolify/Traefik terminates TLS in front of this container; it only ever
# needs to listen on plain HTTP inside the private Docker network.
RUN addgroup -S receiptcash && adduser -S receiptcash -G receiptcash
USER receiptcash

EXPOSE 8080
CMD ["node", "dist/index.js"]
