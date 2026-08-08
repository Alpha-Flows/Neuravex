#!/bin/bash
# Neuravex Desktop Launcher (macOS / Linux)
# Double-click this file to start the website builder.
cd "$(dirname "$0")" || exit
export PATH="$HOME/.local/nodejs/bin:$PATH"
node electron/server.js "$@"
