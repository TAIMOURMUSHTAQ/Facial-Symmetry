/* Loads MediaPipe FaceLandmarker. Tries the bundled files in vendor/ first so the app works offline,
   then falls back to the CDN for any piece that is missing. */
import { MEDIAPIPE } from "../config.js";

async function exists(url) {
  try { const r = await fetch(url, { method: "HEAD" }); return r.ok; } catch { return false; }
}

export async function loadLandmarker() {
  const { local, cdn } = MEDIAPIPE;
  let mod, offline = true;
  try { mod = await import(local.bundle); } catch { mod = await import(cdn.bundle); offline = false; }

  const wasmOk = await exists(local.wasm + "/vision_wasm_internal.wasm");
  const modelOk = await exists(local.model);
  if (!wasmOk || !modelOk) offline = false;

  const fileset = await mod.FilesetResolver.forVisionTasks(wasmOk ? local.wasm : cdn.wasm);
  const make = delegate => mod.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelOk ? local.model : cdn.model, delegate },
    runningMode: "VIDEO", outputFaceBlendshapes: true, numFaces: 1
  });
  let landmarker;
  try { landmarker = await make("GPU"); } catch { landmarker = await make("CPU"); }
  return { mod, landmarker, offline };
}
