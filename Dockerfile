# Two images come from this file:
# - `build` has the full toolchain. Compose uses it to run migrations and scripts.
# - `web` is the small runtime image that serves the app.

FROM node:24-slim AS build
# The Prisma migration engine needs OpenSSL, which the slim image leaves out.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# The desktop build is made on Windows, so the image needs no Electron binary.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
ENV NEXT_TELEMETRY_DISABLED=1

# `npm ci` runs `prisma generate`, so the schema must be in place first.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN NEXT_OUTPUT=standalone npm run build

FROM node:24-slim AS web
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/login').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
