#!/usr/bin/env bash
# Runs the app at http://localhost:8080 with the AI proxy.
# Local default: MedGemma via Ollama. To use OpenAI locally: OPENAI_API_KEY=sk-... ./scripts/serve.sh
cd "$(dirname "$0")/.."
exec python3 server.py "${1:-8080}"
