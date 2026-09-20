# Installation Guide

Step-by-step instructions for setting up Neuravex on your machine. Covers local development, production deployment, the desktop launcher, and the MCP integration.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [1. Clone the Repository](#1-clone-the-repository)
- [2. Install Dependencies](#2-install-dependencies)
- [3. Configure Environment Variables](#3-configure-environment-variables)
- [4. Set Up the Database](#4-set-up-the-database)
- [5. Start the Dev Server](#5-start-the-dev-server)
- [Production Deployment](#production-deployment)
- [Desktop Mode](#desktop-mode)
- [MCP Server (AI Integration)](#mcp-server-ai-integration)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement | Minimum Version | Check |
|-------------|-----------------|-------|
| **Node.js** | 18.0+ | `node -v` |
| **npm** | 9.0+ (ships with Node) | `npm -v` |
| **Git** | Any recent version | `git --version` |

No other system dependencies are needed. Neuravex uses SQLite (bundled via Prisma), so there is no external database to install.

### Platform Support

| Platform | Status |
|----------|--------|
| macOS (Intel & Apple Silicon) | ✅ Fully supported |
| Linux (x64, arm64) | ✅ Fully supported |
| Windows 10/11 | ✅ Fully supported |
| WSL2 | ✅ Fully supported |

---

## 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/neuravex.git
cd neuravex
```

> Replace `YOUR_USERNAME/neuravex` with your actual repository URL.

---

## 2. Install Dependencies

```bash
npm install
```

This installs all packages and automatically runs `prisma generate` (via the `postinstall` script) to create the Prisma Client.

---

## The short version

```bash
npm install
npm run desktop
```

`npm run desktop` does steps 3 and 4 below for you — it writes `.env`, creates the
database, applies the schema, seeds a demo site the first time, builds and opens the app.
The sections that follow are for doing it by hand, or for working on Neuravex itself.

---

## 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Then open `.env` in your editor and configure:

```env
# Path to the SQLite database file (relative to the prisma/ directory).
# The default works for most setups — no need to change it.
DATABASE_URL="file:./dev.db"
```

Neuravex has no sign-in — it's meant to run locally on your own machine, so there's nothing else to configure here.

### Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `file:./dev.db` | SQLite database path (relative to `prisma/`) |

> **⚠️ Never commit your `.env` file.** It is already listed in `.gitignore`.

---

## 4. Set Up the Database

Create the SQLite database and apply the schema:

```bash
npm run db:push
```

This creates `prisma/dev.db` with all tables (Site, Page, Revision, Submission).

### Optional: Seed Demo Data

To start with a pre-built demo site so the app isn't empty:

```bash
npm run db:seed
```

This creates a "Neuravex Demo" site with sample pages using the SaaS landing template. The seed is idempotent — running it again will skip if the demo site already exists.

---

## 5. Start the Dev Server

```bash
npm run dev
```

The app starts at **http://localhost:3000** with hot-reloading enabled.

### What You'll See

| URL | Description |
|-----|-------------|
| `http://localhost:3000` | Admin panel — manage your sites |
| `http://localhost:3000/sites/demo` | Public demo site (if seeded) |

There's no login step — opening `http://localhost:3000` takes you straight into the builder.

---

## Production Deployment

### Build

```bash
npm run build
```

This creates an optimized production bundle in `.next/`.

### Start

```bash
npm run start
```

The production server starts on port 3000 by default. Set the `PORT` environment variable to use a different port:

```bash
PORT=8080 npm run start
```

### Production Checklist

Before deploying to a server, make sure you:

- [ ] Neuravex has no built-in sign-in — if this instance is reachable by anyone other than you, put it behind a **reverse proxy** (nginx, Caddy, etc.) with HTTPS and your own access control (e.g. basic auth or a VPN)
- [ ] Set `NODE_ENV=production` in your environment
- [ ] Back up `prisma/dev.db` regularly (it's a single SQLite file)

### Example: Running with a Reverse Proxy

A minimal nginx config to proxy Neuravex behind HTTPS:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    client_max_body_size 12M;  # Slightly above the 10MB upload limit
}
```

### Example: Running with Docker

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./

# Create the uploads directory
RUN mkdir -p public/uploads

EXPOSE 3000
CMD ["npm", "run", "start"]
```

```bash
docker build -t neuravex .
docker run -d \
  -p 3000:3000 \
  -v neuravex-data:/app/prisma \
  -v neuravex-uploads:/app/public/uploads \
  neuravex
```

> The `-v` flags persist the database and uploads across container restarts.

---

## Desktop Mode

Neuravex includes a lightweight desktop launcher that starts the production server and opens your default browser. No Electron binary is required.

```bash
# First, build the production bundle (one-time)
npm run build

# Then launch
npm run desktop
```

Or specify a custom port:

```bash
node electron/server.js 4000
```

The launcher will:
1. Check for a production build (runs `next build` if missing)
2. Start `next start` on the specified port
3. Wait for the server to be ready
4. Open your default browser

### Platform-Specific Scripts

| Platform | Script |
|----------|--------|
| macOS / Linux | `./start-desktop.sh` |
| Windows | `start-desktop.bat` |

---

## MCP Server (AI Integration)

Neuravex includes a [Model Context Protocol](https://modelcontextprotocol.io/) server that lets AI assistants (Claude, Cursor, etc.) manage your sites programmatically.

### Quick Setup

Run the interactive setup script:

```bash
bash setup-mcp.sh
```

This configures your MCP client (Claude Desktop, Cursor, etc.) to connect to Neuravex's MCP server.

### Manual Setup

Add this to your MCP client's config:

```json
{
  "mcpServers": {
    "neuravex-website-builder": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-server.ts"],
      "env": {
        "DATABASE_URL": "file:/absolute/path/to/prisma/dev.db"
      }
    }
  }
}
```

> Replace the paths with absolute paths to your Neuravex installation.

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_sites` | List all sites |
| `get_site` | Get site details and pages |
| `create_site` | Create a new site (optionally from a template) |
| `update_site` | Update site settings (name, theme, SEO, etc.) |
| `delete_site` | Delete a site |
| `create_page` | Add a page to a site |
| `update_page` | Update a page's content, title, or settings |
| `delete_page` | Delete a page |
| `list_templates` | List available starter templates |

---

## Updating

To update to the latest version:

```bash
git pull
npm install
npm run desktop    # applies any schema changes and rebuilds on the way up
```

The launcher notices when the schema has moved and applies it before starting, so an
update does not need anything else. Doing it by hand is `npm run db:push` followed by
`npm run build`; `db:push` is safe on an existing database, applying new columns and
tables without deleting data. If it ever cannot apply a change without losing data it
refuses and says so, rather than doing it.

---

## Troubleshooting

### "Cannot find module '@prisma/client'"

The Prisma client wasn't generated.

**Fix:**

```bash
npx prisma generate
```

This should happen automatically during `npm install` (via the `postinstall` script), but you may need to run it manually if the install was interrupted.

---

### Database Errors After Pulling Updates

`npm run desktop` applies schema changes on the way up, so this should not come up. If you
start the app another way, or the launcher told you it could not update the database:

```bash
npm run db:push
```

If you're okay with losing data and want a clean start:

```bash
npm run db:reset
```

---

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Fix:** Either stop the other process using port 3000, or start on a different port:

```bash
PORT=3001 npm run dev
```

---

### Uploads Not Working

Make sure the `public/uploads/` directory exists and is writable:

```bash
mkdir -p public/uploads
```

The upload API creates this directory automatically, but it may fail if the parent directory has restrictive permissions.

---

### Reset Everything

To completely reset the database and start fresh:

```bash
npm run db:reset
```

This builds a fresh database beside the current one, seeds it with the demo
site, and puts it in place. If any step fails — most often because Neuravex is
still running and holding the file — nothing is replaced and your sites survive
untouched. Quit Neuravex before running it, and start it again afterwards: a
running copy keeps serving the database it opened at launch.

To also clear uploaded files:

```bash
rm -rf public/uploads/*
npm run db:reset
```
