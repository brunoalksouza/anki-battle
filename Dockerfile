FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends fontconfig fonts-liberation && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3100 DATA_DIR=/data APP_ORIGIN=https://anki.aneblober.com
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY scripts ./scripts
COPY dist ./dist
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--import","tsx","server/index.ts"]
