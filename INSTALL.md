# Installation Guide

Step-by-step instructions for setting up Neuravex on your machine. Covers local development, production deployment, the desktop launcher, and the MCP integration.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [1. Get Neuravex](#1-get-neuravex)
- [2. Install Dependencies](#2-install-dependencies)
- [3. Configure Environment Variables](#3-configure-environment-variables)
- [4. Set Up the Database](#4-set-up-the-database)
- [5. Start the Dev Server](#5-start-the-dev-server)
- [Production Deployment](#production-deployment)
  - [Environment variables](#environment-variables)
  - [Reaching Neuravex over a network](#reaching-neuravex-over-a-network)
  - [Backups](#backups)
  - [Keeping it running](#keeping-it-running)
  - [Running with Docker](#running-with-docker)
- [Desktop Mode](#desktop-mode)
- [MCP Server (AI Integration)](#mcp-server-ai-integration)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement | Minimum Version | Check |
|-------------|-----------------|-------|
| **Node.js** | 22.12 LTS or newer | `node -v` |
| **npm** | 10+ (ships with Node) | `npm -v` |
| **Git** | Any recent version | `git --version` |

> Node 20 reached end of life in April 2026, and `sanitize-html` — the library
> that stands between a visitor's HTML and your published page — requires
> 22.12 from 2.17.6 onward, which is the release carrying the two fixes this
> project depends on. So 22.12 is the floor. `package.json` states
> `"engines": { "node": ">=22.12.0" }` and `.npmrc` sets `engine-strict=true`,
> so `npm install` stops rather than half-working. There is a `.nvmrc` if you
> use nvm.

No other system dependencies are needed. Neuravex uses SQLite (bundled via Prisma), so there is no external database to install.

> **The network.** Neuravex binds `127.0.0.1` by default and has no sign-in:
> the only browser that can reach it is the one on this machine, and that is
> the whole of the access control. Anyone who can reach the port can read,
> change and delete every site on it. Leave the bind where it is unless
> something that authenticates sits in front — see "Reaching Neuravex over a
> network" below.
>
> The unauthenticated remote code execution that used to make this urgent on
> Windows hosts (NVX-004) was an advisory against the Next.js 14 line, which
> had no 14.x fix. Neuravex is on Next.js 16 now and `npm audit` reports
> nothing against what ships, so the loopback default is a defence in depth
> rather than the only thing holding.

### Platform Support

| Platform | Status |
|----------|--------|
| macOS (Intel & Apple Silicon) | ✅ Fully supported |
| Linux (x64, arm64) | ✅ Fully supported |
| Windows 10/11 | ✅ Fully supported — loopback only, see below |
| WSL2 | ✅ Fully supported |

---

## 1. Get Neuravex

**To use it,** download a release from
[github.com/Alpha-Flows/Neuravex/releases](https://github.com/Alpha-Flows/Neuravex/releases)
— the `.zip` or the `.tar.gz`, whichever your system opens — and unpack it
where you want Neuravex to live. That folder is also where your sites are
kept unless you say otherwise (see [Backups](#backups)), so put it somewhere
your own backups reach.

`SHA256SUMS` beside the archives says what each download should hash to:

```bash
sha256sum -c SHA256SUMS --ignore-missing     # Linux
shasum -a 256 -c SHA256SUMS --ignore-missing # macOS
```

**To work on Neuravex itself,** clone the repository instead:

```bash
git clone https://github.com/Alpha-Flows/Neuravex.git
cd Neuravex
```

A clone follows `main`, which moves every day; a release is a fixed version
that has been installed and started from an empty folder before it was
published.

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

Neuravex has no sign-in — it is meant to run on your own machine, and it binds
`127.0.0.1` so that stays true. There is nothing else to set for a local
install; the variables that matter for a server are listed under
[Production Deployment](#production-deployment).

### Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `file:./dev.db` | SQLite database path (relative to `prisma/`) |
| `NEURAVEX_UPLOAD_DIR` | No | `data/uploads` | Where uploaded pictures are kept |
| `HOST` | No | `127.0.0.1` | Which interfaces to answer on. See the warning under Production Deployment before changing it. |

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

The production server starts on port 3000, bound to `127.0.0.1`. Set `PORT` to
use a different port:

```bash
PORT=8080 npm run start
```

### Production Checklist

- [ ] **The port is the only access control there is.** Neuravex has no
      sign-in, by design. Anyone who can open its address can read, rewrite,
      export and delete every site on the machine, and read every form
      submission visitors have sent. It binds `127.0.0.1` for that reason.
- [ ] If anyone other than you has to reach it, put a **reverse proxy** in
      front that authenticates — see the recipe below — and leave Neuravex
      itself on loopback.
- [ ] Set `NODE_ENV=production`.
- [ ] Back up with `npm run backup` (see **Backups** below). Not by copying
      `prisma/dev.db`.
- [ ] Run it as its own user. The database holds visitor submissions; it is
      created readable only by the account that owns it, and a shared account
      undoes that.

### Environment variables

| Variable | What it does |
|----------|--------------|
| `DATABASE_URL` | Where the sites live. `file:./dev.db` is relative to `prisma/`. |
| `PORT` | The port to listen on. Default 3000; the desktop launcher uses 3939. |
| `HOST` | Which interfaces to answer on. Default `127.0.0.1`. **Anything else removes the only access control there is**, and the launcher says so in capitals when you set it. |
| `NEURAVEX_ALLOWED_HOSTS` | Comma-separated hostnames this server may be addressed by, on top of `localhost` and IP literals. A reverse proxy deployment needs its public name here. |
| `NEURAVEX_TRUST_PROXY` | Set to `1` when something in front sets `X-Forwarded-Host`, `X-Forwarded-Proto` and `X-Forwarded-For`. Without it those headers are ignored, because without a proxy they are whatever the client typed. |
| `PUBLIC_URL` | The address visitors reach the site at. Used for `sitemap.xml`, `robots.txt` and social images. |
| `NEURAVEX_UPLOAD_DIR` | Where uploaded files are kept. Default `data/uploads`. |

### Reaching Neuravex over a network

Two things have to happen together, and doing one without the other is the
mistake this section exists to prevent.

1. Tell Neuravex which name it answers to. It refuses any other `Host` with
   `421 Misdirected Request`, which is what stops a page on the web pointing a
   hostname at your loopback address and then talking to your builder:

   ```bash
   NEURAVEX_ALLOWED_HOSTS=neuravex.example.com
   NEURAVEX_TRUST_PROXY=1
   PUBLIC_URL=https://neuravex.example.com
   ```

2. Put authentication in front of it. The block below is safe as pasted.

```nginx
# Port 80 exists to send people to port 443 and for nothing else.
server {
    listen 80;
    server_name neuravex.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name neuravex.example.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Slightly above the largest upload, a 250 MB video, so an oversized
    # upload is refused by Neuravex with a readable message rather than by
    # nginx. Neuravex writes an upload to disk as it arrives, so this is not
    # memory it holds; every other route refuses far smaller bodies itself.
    client_max_body_size 251m;

    # Everything, by default, is the builder — and the builder is you.
    auth_basic           "Neuravex";
    auth_basic_user_file /etc/nginx/neuravex.htpasswd;

    # A submitted form is the one thing a visitor is allowed to POST.
    # It is rate-limited here as well as in the app.
    limit_req_zone $binary_remote_addr zone=neuravex_forms:10m rate=10r/m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Set by us, never passed through from the client.
        proxy_set_header X-Forwarded-Host  $host;
        # A download re-renders every page and compiles a stylesheet.
        proxy_read_timeout 120s;
    }

    # The published sites are for everybody. This is the whole reason the
    # password sits at server level and is lifted here rather than the other
    # way round: an `auth_basic` on `location /` with no exceptions locks
    # visitors out of every site you have published, which is what pushes
    # people into exempting `/api/` wholesale — and `/api/` is the admin API.
    location /sites/ {
        auth_basic off;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
    }

    # Pictures on those pages.
    location /uploads/ {
        auth_basic off;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
    }

    # Exactly one API route, exactly one method: the contact form.
    location = /api/submissions {
        limit_except POST { deny all; }
        limit_req zone=neuravex_forms burst=5 nodelay;
        auth_basic off;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
    }
}
```

> **Never do this:** `location /api/ { auth_basic off; }`. `/api/` is how the
> builder deletes sites, and it asks nobody who they are.

### Backups

```bash
npm run backup                 # into backups/<timestamp>/
npm run backup /mnt/nas/nvx    # or somewhere you choose
```

Copying `prisma/dev.db` by hand is not enough, twice over. The database runs
in WAL mode, so committed rows sit in `dev.db-wal` until a checkpoint and a
plain copy taken while Neuravex is running is missing the most recent writes.
And every picture on every page lives in the uploads directory, which the
database only holds the names of — restore the file alone and you get the
sites back with all the images broken.

`npm run backup` uses SQLite's own `VACUUM INTO`, which is consistent against
a live database, and copies the uploads alongside it. To restore: quit
Neuravex, put the database file back at `prisma/` and the `uploads` folder
back at `data/uploads`.

### Keeping it running

**Is it up?** `GET /api/health` answers in a few milliseconds from one query:

```bash
curl -s http://127.0.0.1:3939/api/health
# {"app":"neuravex","version":"0.1.0","ok":true,"database":"ok","uploads":"writable","journal":"wal"}
```

It answers 503, with the same fields, when the database cannot be reached or
the uploads folder cannot be written to. The launcher waits on it, the
Docker image's health check calls it, and it is the address to give a
reverse proxy's or a monitor's health check.

**As a service on Linux.** Run the launcher under systemd, which restarts it
when it fails. The launcher exits with a failure whenever the server stops
on its own, so `Restart=on-failure` catches a crash; on `systemctl stop` it
stops the server, waits for it and exits cleanly.

```ini
# /etc/systemd/system/neuravex.service
[Unit]
Description=Neuravex website builder
After=network.target

[Service]
Type=simple
User=neuravex
WorkingDirectory=/opt/neuravex
Environment=NEURAVEX_NO_BROWSER=1
ExecStart=/usr/bin/node electron/server.js 3939
Restart=on-failure
RestartSec=5
# SIGTERM to the launcher alone: it stops the server and waits for it.
KillMode=mixed
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now neuravex
journalctl -u neuravex -f     # what it says, kept after the window is gone
```

The first start after an update rebuilds, which takes a minute or two; the
unit does not need to know. With Docker, `--restart unless-stopped` on the
run line does the same job (see below).

### Multiple people

Neuravex is single-tenant. Behind one shared proxy credential everybody is an
administrator of every site, nothing is attributable, and the proxy's access
log is the only audit trail there is. The trash holds the 50 most recent
deleted items and silently drops the 51st. If more than one person is going to
use an instance, that is what they are sharing.

### Running with Docker

The `Dockerfile` and `.dockerignore` in the repository are the tested ones.
The example that used to live in this file could not build — `npm ci` ran
before the schema was copied, so `prisma generate` failed — and would have
baked your `.env`, your database and every upload into the image if it had.

```bash
docker build -t neuravex .
docker run -d --name neuravex \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v neuravex-data:/data \
  neuravex
```

One volume holds both the database and the uploads. The schema is applied on
the way up, so a fresh volume is a working install rather than 500s on every
page. The image's health check calls `/api/health`, so `docker ps` shows
`unhealthy` when the volume cannot be written to, and `--restart
unless-stopped` brings the container back after a crash or a reboot.

`-p 127.0.0.1:3000:3000` and not `-p 3000:3000`: the second publishes the
builder, which has no sign-in, on every interface of the host. Put the reverse
proxy from the section above in front and point it at `127.0.0.1:3000`; pass
`-e NEURAVEX_ALLOWED_HOSTS=…`, `-e NEURAVEX_TRUST_PROXY=1` and
`-e PUBLIC_URL=…` to the container as that section describes.

To back up the volume, run the backup inside the container and copy the result
out:

```bash
docker exec neuravex npm run backup /data/backup
docker cp neuravex:/data/backup ./neuravex-backup
```

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

With `--no-browser`, or `NEURAVEX_NO_BROWSER=1`, it starts the server and
opens nothing — for a machine with nobody at the screen, or a service
manager (see [Keeping it running](#keeping-it-running)).

The launcher will:
1. Set up `.env` and the database if this is a fresh copy
2. Rebuild if the source has changed since the last build, or build if there is none
3. Start the server on `127.0.0.1` at the given port
4. Wait for the server to be ready
5. Open your default browser

Before it builds anything it checks the port. If Neuravex is already running
there — the launcher double-clicked twice — it opens that one and leaves. If
another program has the port, it says so and names the command that avoids
it (`npm run desktop 4000`), rather than starting a server that cannot bind.
If the server stops on its own later, the launcher says so and exits with a
failure, instead of leaving quietly as if it had been closed.

It listens on loopback only. Setting `HOST` to anything else opens the builder
to the network, where there is no password in front of it — the launcher
prints a warning saying so, and there is a reverse-proxy recipe under
[Production Deployment](#production-deployment) for when you actually need it.

Quitting the launcher stops the server and waits for it to exit, so the port
is free for the next start.

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

Add this to your MCP client's config, with every path replaced by an absolute
path into your own Neuravex directory:

```json
{
  "mcpServers": {
    "neuravex": {
      "command": "node",
      "args": [
        "/absolute/path/to/Neuravex/node_modules/tsx/dist/cli.mjs",
        "/absolute/path/to/Neuravex/mcp-server.ts"
      ],
      "cwd": "/absolute/path/to/Neuravex"
    }
  }
}
```

> **Not `npx tsx`, and not without `cwd`.** When the local `tsx` is not on the
> path — which is every launch from a client that starts the server in its own
> working directory — `npx` downloads `tsx` from the registry and runs it, with
> only an `npm warn` line to say so. The command above names the copy this
> repository installed. `cwd` is what lets the server find `.env` and the
> database; without it, a `DATABASE_URL` pointing somewhere stale makes SQLite
> create an empty file, and every tool then reports that you have no sites.
> The server refuses to start in that state rather than answering from an
> empty database.

### What an agent can do here

**Everything you can, with no approval step.** The MCP server can create,
rewrite, publish and delete sites and pages, and it can generate and rewrite
the Impressum and the Datenschutzerklärung. Deletion goes to the trash, which
holds the 50 most recent items — a longer run of deletions than that is
permanent.

**Anything it reads is content somebody wrote.** Site names, descriptions and
block text come back to the agent verbatim, inside an envelope that names them
as stored website data. An imported archive is one way text written by someone
else gets into that. Whether a model treats instructions it reads as
instructions is the model's business, so: do not give an agent this server and
untrusted material in the same session.

### Available MCP Tools

All sixteen, as registered in `mcp-server.ts`. A test fails when this table and
the server disagree.

| Tool | Description |
|------|-------------|
| `list_templates` | List the starter templates, with categories |
| `list_sites` | List every site, with page counts |
| `get_site` | A site's details and its pages |
| `create_site` | Create a site, optionally from a template |
| `delete_site` | Move one site to the trash (needs `confirm: true`) |
| `list_pages` | The pages of one site |
| `get_page` | One page, with its full block tree |
| `create_page` | Add a page to a site |
| `save_page` | Rewrite a page's blocks, title, slug or flags |
| `publish_page` | Publish or unpublish a page |
| `delete_page` | Move one page to the trash (needs `confirm: true`) |
| `get_site_url` | The addresses a site and its pages are served at |
| `get_block_reference` | The block types and the props each one takes |
| `get_legal_details` | A site's German legal profile, what is missing, and what the site does with visitor data |
| `set_legal_details` | Store legal details (merged into what is there) |
| `generate_legal_pages` | Write the Impressum and Datenschutzerklärung onto the site |

---

### Telemetry and offline installs

Neuravex turns off the Next.js CLI's usage reporting and Prisma's version
check for every command it runs — `NEXT_TELEMETRY_DISABLED=1` and
`CHECKPOINT_DISABLE=1` are set in one place, `scripts/local-bin.js`, which
every npm script and the launcher go through.

Installing with no internet access needs Prisma's query engine from somewhere
local: set `PRISMA_ENGINES_MIRROR` to a mirror you host, or install once on a
connected machine and copy `node_modules` across.

---

## Updating

### From a release

1. Quit Neuravex, then take a backup in the old folder: `npm run backup`
   (see [Backups](#backups)).
2. Unpack the new release next to the old one — not over it.
3. Copy your data into the new folder: `.env`, `prisma/dev.db` with
   `dev.db-wal` and `dev.db-shm` if they are there, and `data/uploads/`. If
   `DATABASE_URL` or `NEURAVEX_UPLOAD_DIR` point outside the folder, there is
   nothing to copy but `.env`.
4. In the new folder: `npm install`, then `npm run desktop`. It applies any
   database changes and builds on the way up.

Keep the old folder until you have looked at your sites in the new one.

### From a clone

To update to the latest version:

```bash
git pull
npm install
npm run desktop    # applies any schema changes and rebuilds on the way up
```

The launcher notices when the schema has moved and applies it before starting, and it
notices when the source has moved and rebuilds, so an update does not need anything
else. It compares the source against a fingerprint recorded at the last build — a walk
of sizes and timestamps, so it costs milliseconds rather than reading the 53 MB of
bundled photographs on every launch. Doing it by hand is `npm run db:push` followed by
`npm run build`; `db:push` is safe on an existing database, applying new columns and
tables without deleting data. If it ever cannot apply a change without losing data it
refuses and says so, rather than doing it.

---

## Troubleshooting

### "Environment variable not found: DATABASE_URL"

Neuravex has not been set up in this copy yet. `.env` is not part of the repository — it is
written the first time you run the app — so a checkout that has only had `npm install` run on it
does not have one.

**Fix:**

```bash
npm run setup
```

That writes `.env`, creates the database, applies the schema and adds the demo site. It is safe
to run again; it does nothing it has already done. `npm run desktop` does the same on its way up.

### Errors that make no sense after `git pull`

`git pull` brings new source. It does not bring new dependencies, so a pull that crosses a major
version leaves the code and the framework it runs on disagreeing — and what you see then is
whatever breaks first, which is rarely anything to do with installing. A React 18 install under
React 19 source, for instance, surfaced as "Maximum update depth exceeded" from inside the
drag-and-drop library, with a stack pointing at somebody else's code entirely.

Neuravex warns about this now: `WARNING: node_modules is older than this checkout.`

**Fix:**

```bash
npm install
```

If that refuses with `EBADENGINE`, your Node is older than Neuravex needs — see
[Requirements](#requirements). The version is enforced rather than suggested, because an install
on the wrong Node fails later and less clearly.

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

The launcher checks before it starts:

```
[neuravex] Port 3939 is in use by another program, so Neuravex cannot start on it.
[neuravex] Start it on another port instead: npm run desktop 4000
```

Either stop whatever has the port, or do what it says. If it says
`Neuravex … is already running` instead, it has found your first copy and
opened it; there is nothing to fix.

The dev server and `npm start` do not check first, and say it Node's way:

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
