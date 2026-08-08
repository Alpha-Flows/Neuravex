#!/bin/bash
# ┌─────────────────────────────────────────────────────────────┐
# │     Neuravex MCP — Connect your AI agent to the CMS            │
# │                                                            │
# │  This script detects your AI clients and helps you connect.│
# └─────────────────────────────────────────────────────────────┘

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$DIR"

echo ""
echo "  Neuravex MCP Setup"
echo "  ───────────────"
echo "  Project: $REPO_DIR"
echo ""

# ── opencode ───────────────────────────────────────────────────
echo "✅ opencode"
echo "   Config already written to:"
echo "     $REPO_DIR/opencode.json"
echo ""
echo "   Restart opencode to pick up the MCP server."
echo ""

# ── OpenAI ChatGPT Desktop ─────────────────────────────────────
OPENAI_DIR=""
OPENAI_CONFIG=""
OS="$(uname -s)"
case "$OS" in
  Darwin)
    OPENAI_DIR="$HOME/Library/Application Support/com.openai.chat"
    ;;
  Linux)
    OPENAI_DIR="$HOME/.config/openai"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    OPENAI_DIR="$APPDATA/openai"
    ;;
esac

if [ -n "$OPENAI_DIR" ]; then
  mkdir -p "$OPENAI_DIR"
  OPENAI_CONFIG="$OPENAI_DIR/mcp.json"

  # Write the OpenAI MCP config
  cat > "$OPENAI_CONFIG" << OAIEOF
{
  "mcpServers": {
    "neuravex": {
      "command": "npx",
      "args": ["tsx", "mcp-server.ts"],
      "cwd": "$REPO_DIR"
    }
  }
}
OAIEOF

  echo "✅ OpenAI ChatGPT Desktop"
  echo "   Config written to:"
  echo "     $OPENAI_CONFIG"
  echo ""
  echo "   Restart ChatGPT to pick up the MCP server."
else
  echo "⚠️  OpenAI — unknown OS ($OS)"
  echo "   Create a file at the OpenAI config path with:"
  echo ""
  echo '  {'
  echo '    "mcpServers": {'
  echo '      "neuravex": {'
  echo '        "command": "npx",'
  echo '        "args": ["tsx", "mcp-server.ts"],'
  echo '        "cwd": "'"$REPO_DIR"'"'
  echo '      }'
  echo '    }'
  echo '  }'
fi

echo ""
echo "── Next steps ──"
echo "  1. Restart your AI client (opencode / ChatGPT)"
echo "  2. Ask: 'Create a portfolio site for me using the personal portfolio template'"
echo "  3. The AI will use list_templates → create_site → save_page to build it"
echo "  4. Preview at http://localhost:3000/sites/<slug>"
echo ""
echo "  To start the web interface: npm run dev"
echo ""
