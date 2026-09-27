#!/bin/bash
# ┌─────────────────────────────────────────────────────────────┐
# │     Neuravex MCP — Connect your AI agent to the CMS         │
# │                                                             │
# │  Adds Neuravex to Claude Desktop, or prints what to paste.  │
# └─────────────────────────────────────────────────────────────┘
#
# Two things this used to do that it no longer does.
#
# It created the config directory whether or not the client was installed, and
# then wrote `mcp.json` over whatever was already there with no backup — so
# somebody with three MCP servers configured had one afterwards. It now skips a
# client that is not installed, and backs up a file before replacing it.
#
# And the command it wrote was `npx tsx mcp-server.ts`. When the local `tsx` is
# not on the path — which is every launch from a client that starts the server
# in its own working directory — `npx` downloads it from the registry and runs
# it, with only an `npm warn` line to say so. The command below names the file
# in this repository, run by the Node that is already installed.
#
# A backup was not enough on its own either: the file it replaced still lost
# every other server in it until somebody copied them back by hand. The entry
# is now merged into the client's config, and nothing else in it is touched.
# It also used to write a ChatGPT Desktop `mcp.json` that no ChatGPT release
# was ever shown to read, and to announce opencode as configured whether or
# not it was installed; both are gone.

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$DIR"
TSX="$REPO_DIR/node_modules/tsx/dist/cli.mjs"
NODE_BIN="$(command -v node || true)"

echo ""
echo "  Neuravex MCP Setup"
echo "  ───────────────"
echo "  Project: $REPO_DIR"
echo ""

if [ ! -f "$TSX" ]; then
  echo "⚠️  $TSX is missing."
  echo "   Run \`npm install\` in $REPO_DIR first, then run this again."
  echo ""
  exit 1
fi

if [ -z "$NODE_BIN" ]; then
  echo "⚠️  node is not on the PATH. Install Node.js 22.12 or newer and run this again."
  echo ""
  exit 1
fi

# The config every client gets, written once here so the copies cannot drift.
mcp_config() {
  cat << CONFEOF
{
  "mcpServers": {
    "neuravex": {
      "command": "$NODE_BIN",
      "args": ["$TSX", "$REPO_DIR/mcp-server.ts"],
      "cwd": "$REPO_DIR"
    }
  }
}
CONFEOF
}

# Adds the neuravex entry to a client's config and leaves every other key in
# it as it was. The old file is kept beside it first, and a file that is not
# JSON is left alone rather than overwritten.
write_config() {
  local target="$1"
  if [ -f "$target" ]; then
    local backup
    backup="$target.neuravex-backup-$(date +%Y%m%d%H%M%S)"
    cp "$target" "$backup"
    echo "   Your previous config was kept at:"
    echo "     $backup"
  fi
  NVX_TARGET="$target" NVX_ENTRY="$(mcp_config)" "$NODE_BIN" -e '
    const fs = require("fs");
    const target = process.env.NVX_TARGET;
    const entry = JSON.parse(process.env.NVX_ENTRY).mcpServers.neuravex;
    let config = {};
    if (fs.existsSync(target)) {
      const text = fs.readFileSync(target, "utf8");
      try {
        config = text.trim() ? JSON.parse(text) : {};
      } catch {
        console.error("   " + target + " is not valid JSON, so it was left as it is.");
        process.exit(1);
      }
    }
    config.mcpServers = { ...(config.mcpServers || {}), neuravex: entry };
    fs.writeFileSync(target, JSON.stringify(config, null, 2) + "\n");
  '
}

OS="$(uname -s)"

# ── Claude Desktop ─────────────────────────────────────────────
case "$OS" in
  Darwin) CLAUDE_DIR="$HOME/Library/Application Support/Claude" ;;
  Linux) CLAUDE_DIR="$HOME/.config/Claude" ;;
  MINGW*|MSYS*|CYGWIN*) CLAUDE_DIR="$APPDATA/Claude" ;;
  *) CLAUDE_DIR="" ;;
esac

wrote_any=0

# Only where the client is actually installed. Creating the directory for a
# client somebody does not have is how this used to leave config files in
# places nothing reads.
if [ -n "$CLAUDE_DIR" ] && [ -d "$CLAUDE_DIR" ]; then
  write_config "$CLAUDE_DIR/claude_desktop_config.json"
  echo "✅ Claude Desktop"
  echo "   Config written to: $CLAUDE_DIR/claude_desktop_config.json"
  echo "   Restart Claude to pick it up."
  echo ""
  wrote_any=1
fi

if [ "$wrote_any" -eq 0 ]; then
  echo "ℹ️  Claude Desktop was not found on this machine."
fi
echo "ℹ️  For any other MCP client (Cursor, Windsurf, Claude Code, …), add this"
echo "   to its MCP configuration:"
echo ""
mcp_config | sed 's/^/   /'
echo ""
echo "   opencode needs nothing: started in this folder, it reads opencode.json."
echo ""

echo "── Before you point an agent at this ──"
echo "  The MCP server can create, rewrite, publish and delete sites, and can"
echo "  generate the Impressum and Datenschutzerklärung. There is no approval"
echo "  step. Anything it reads back — a site name, a page's text — is content"
echo "  somebody wrote, and an imported archive is one way somebody else's"
echo "  words get in. Do not give an agent this server and untrusted material"
echo "  in the same session."
echo ""
echo "── Next steps ──"
echo "  1. If Neuravex has never been started here, run \`npm run setup\` first:"
echo "     the MCP server will not run against a database that does not exist."
echo "  2. Restart your AI client"
echo "  3. Ask: 'Create a portfolio site for me using the personal portfolio template'"
echo "  4. The AI will use list_templates → create_site → save_page to build it"
echo "  5. Start the builder with \`npm run desktop\` and preview at"
echo "     http://localhost:3939/sites/<slug>"
echo ""
