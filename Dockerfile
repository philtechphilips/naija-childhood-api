# Build from the repo root so the shared game rules in frontend/ are available:
#   docker build -f backend/Dockerfile -t naija-childhood-api .
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --no-audit --no-fund
COPY backend backend
# Pure game rules + validation, shared with the app (only these files are compiled in).
COPY frontend/lib frontend/lib
COPY frontend/games frontend/games
RUN cd backend && npx prisma generate && npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app/backend
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:4000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/backend/src/main.js"]
