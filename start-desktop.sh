#!/bin/bash
# Neuravex Desktop Launcher (macOS / Linux)
# Double-click this file to start the website builder.
cd "$(dirname "$0")" || exit

# Opened from a file manager, the window closes the moment this ends, and any
# message closes with it. So a failure waits for Enter.
pause_if_interactive() {
  if [ -t 0 ]; then read -r -p "Press Enter to close this window. " _; fi
}

# A window opened by double-clicking does not always get the PATH a terminal
# has, so Node installed by Homebrew or nvm can be missing from it. This used
# to add one person's own Node folder instead, which helped nobody else.
if ! command -v node >/dev/null 2>&1; then
  for dir in /opt/homebrew/bin /usr/local/bin; do
    if [ -x "$dir/node" ]; then PATH="$dir:$PATH"; break; fi
  done
fi
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "[neuravex] Node.js is not installed, or this window cannot find it."
  echo "[neuravex] Install Node.js 22.12 or newer from https://nodejs.org, then open this again."
  pause_if_interactive
  exit 1
fi

node electron/server.js "$@"
status=$?
if [ "$status" -ne 0 ]; then pause_if_interactive; fi
exit "$status"
