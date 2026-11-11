#!/usr/bin/env bash
# Downloads MediaPipe Tasks Vision + the face landmarker model into vendor/ so the app works offline.
set -euo pipefail
cd "$(dirname "$0")/.."
V=0.10.14
BASE="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@$V"
mkdir -p vendor/mediapipe/wasm
curl -fsSL "$BASE/vision_bundle.mjs" -o vendor/mediapipe/vision_bundle.mjs
for f in vision_wasm_internal.js vision_wasm_internal.wasm vision_wasm_nosimd_internal.js vision_wasm_nosimd_internal.wasm; do
  curl -fsSL "$BASE/wasm/$f" -o "vendor/mediapipe/wasm/$f"
done
curl -fsSL "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" -o vendor/mediapipe/face_landmarker.task
echo "Vendor files ready:"; ls -la vendor/mediapipe vendor/mediapipe/wasm
