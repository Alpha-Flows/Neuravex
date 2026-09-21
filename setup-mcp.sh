#!/bin/bash
# ┌─────────────────────────────────────────────────────────────┐
# │     Neuravex MCP — Connect your AI agent to the CMS         │
# │                                                             │
# │  This script detects your AI clients and helps you connect. │
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
  echo "⚠️  node is not on the PATH. Install Node.js 20 or newer and run this again."
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

# Writes the config to a path, keeping whatever was there before.
write_config() {
  local target="$1"
  if [ -f "$target" ]; then
    local backup
    backup="$target.neuravex-backup-$(date +%Y%m%d%H%M%S)"
    cp "$target" "$backup"
    echo "   Your previous config was kept at:"
    echo "     $backup"
    echo "   If it had other MCP servers in it, copy them across by hand."
  fi
  mcp_config > "$target"
}

# ── opencode ───────────────────────────────────────────────────
echo "✅ opencode"
echo "   Config already written to:"
echo "     $REPO_DIR/opencode.json"
echo ""
echo "   Restart opencode to pick up the MCP server."
echo ""

# ── OpenAI ChatGPT Desktop ─────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Darwin) OPENAI_DIR="$HOME/Library/Application Support/com.openai.chat" ;;
  Linux) OPENAI_DIR="$HOME/.config/openai" ;;
  MINGW*|MSYS*|CYGWIN*) OPENAI_DIR="$APPDATA/openai" ;;
  *) OPENAI_DIR="" ;;
esac

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
if [ -n "$OPENAI_DIR" ] && [ -d "$OPENAI_DIR" ]; then
  write_config "$OPENAI_DIR/mcp.json"
  echo "✅ OpenAI ChatGPT Desktop"
  echo "   Config written to: $OPENAI_DIR/mcp.json"
  echo "   Restart ChatGPT to pick it up."
  echo ""
  wrote_any=1
fi

if [ -n "$CLAUDE_DIR" ] && [ -d "$CLAUDE_DIR" ]; then
  write_config "$CLAUDE_DIR/claude_desktop_config.json"
  echo "✅ Claude Desktop"
  echo "   Config written to: $CLAUDE_DIR/claude_desktop_config.json"
  echo "   Restart Claude to pick it up."
  echo ""
  wrote_any=1
fi

if [ "$wrote_any" -eq 0 ]; then
  echo "ℹ️  No desktop AI client was found on this machine."
  echo "   Add this to your client's MCP configuration by hand:"
  echo ""
  mcp_config | sed 's/^/   /'
  echo ""
fi

echo "── Before you point an agent at this ──"
echo "  The MCP server can create, rewrite, publish and delete sites, and can"
echo "  generate the Impressum and Datenschutzerklärung. There is no approval"
echo "  step. Anything it reads back — a site name, a page's text — is content"
echo "  somebody wrote, and an imported archive is one way somebody else's"
echo "  words get in. Do not give an agent this server and untrusted material"
echo "  in the same session."
echo ""
echo "── Next steps ──"
echo "  1. Restart your AI client"
echo "  2. Ask: 'Create a portfolio site for me using the personal portfolio template'"
echo "  3. The AI will use list_templates → create_site → save_page to build it"
echo "  4. Start the builder with \`npm run desktop\` and preview at"
echo "     http://localhost:3939/sites/<slug>"
echo ""
