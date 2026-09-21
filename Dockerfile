# Neuravex, in a container.
#
# The example this replaces lived in INSTALL.md and could not build:
# `npm ci` ran before the schema was copied, so the `postinstall` hook failed
# with "Could not find Prisma Schema". There was no `.dockerignore`, so
# `COPY . .` inside somebody's working copy baked `.env`, the database with
# its write-ahead log, every upload and the host's `node_modules` into the
# image — and the named volume mounted at /app/prisma was then seeded from
# that. The runner never set `DATABASE_URL` and never applied the schema, so a
# clean build answered 500 on every page. It ran as root with the full
# development dependency tree, and the run line published the builder, which
# has no sign-in, on every interface.
#
# Build:  docker build -t neuravex .
# Run:    docker run -d --name neuravex \
#           -p 127.0.0.1:3000:3000 \
#           -v neuravex-data:/data \
#           neuravex
#
# The port is bound to loopback because there is no password behind it. Put a
# reverse proxy that authenticates in front before publishing it anywhere, and
# see the "Reaching Neuravex over a network" section of INSTALL.md.

# ── dependencies ──────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# The schema first: `postinstall` runs `prisma generate`, which needs it.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm ci

# ── build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV CHECKPOINT_DISABLE=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` reads DATABASE_URL through the generated client even though it
# queries nothing; a placeholder is enough and never becomes a real file.
ENV DATABASE_URL="file:/tmp/build.db"
RUN npm run build

# ── runner ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV CHECKPOINT_DISABLE=1

# One volume holds everything worth keeping: the database and the uploads.
ENV DATABASE_URL="file:/data/neuravex.db"
ENV NEURAVEX_UPLOAD_DIR="/data/uploads"
ENV PORT=3000
ENV HOST=0.0.0.0

# Production dependencies only. The four build tools the app loads at request
# time (tailwindcss, postcss, autoprefixer, prisma) are in `dependencies`, so
# omitting dev leaves the app whole.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY electron ./electron
COPY next.config.js tailwind.config.ts postcss.config.js tsconfig.json ./
COPY src ./src
COPY public ./public
COPY --from=builder /app/.next ./.next

RUN npm prune --omit=dev \
 && mkdir -p /data/uploads \
 && chown -R node:node /app /data

# Not root. The only thing this process needs to write is /data.
USER node

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/sites',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

# The schema is applied on the way up, so a fresh volume is a working install
# rather than "the table main.Site does not exist" on every page.
#
# HOST is 0.0.0.0 here on purpose and only here: inside a container that is
# the only way the published port reaches the process. What keeps it private
# is the `-p 127.0.0.1:3000:3000` on the run line.
ENTRYPOINT ["/bin/sh", "-c", "node scripts/first-run.js && exec node scripts/run-local.js next start -H 0.0.0.0 -p ${PORT:-3000}"]
