#!/usr/bin/env bash
# Serves the app at http://localhost:8080 (camera access needs localhost or https).
cd "$(dirname "$0")/.."
python3 -m http.server "${1:-8080}" --bind 127.0.0.1
