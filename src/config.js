/* Default configuration. Override any key through FacialSymmetry.mount(el, { ... }). */
export const DEFAULTS = {
  lang: "en",                 // "en" now; "ur" (right-to-left) is added in phase 3
  poseLimitDeg: 15,           // frames with roll, pitch or yaw beyond this are not measured
  mirrorPreview: false,       // mirror the preview only; measurements always use the patient's own sides
  storage: "local",           // "local" = this browser (IndexedDB) | "rest" = Laravel API at apiBase | "memory" = nothing kept
  apiBase: "/api/facial-symmetry",
  apiHeaders: {},             // e.g. { "X-CSRF-TOKEN": "..." } for Laravel
  includePatientRef: false,   // the optional patient reference is left out of exported reports unless true
  aiEndpoint: new URL("../api/ai", import.meta.url).href.replace(/\/$/, ""), // AI proxy (server.py, or a Laravel route); null disables AI
  autoStartCamera: true,      // open straight into scanning when the model is ready
  onExport: null              // optional callback(report) so a host page (Laravel) can receive the report
};

/* MediaPipe sources: bundled copies first (offline), CDN as fallback. */
const V = "0.10.14";
export const MEDIAPIPE = {
  local: {
    bundle: new URL("../vendor/mediapipe/vision_bundle.mjs", import.meta.url).href,
    wasm: new URL("../vendor/mediapipe/wasm", import.meta.url).href,
    model: new URL("../vendor/mediapipe/face_landmarker.task", import.meta.url).href
  },
  cdn: {
    bundle: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${V}/vision_bundle.mjs`,
    wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${V}/wasm`,
    model: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
  }
};
