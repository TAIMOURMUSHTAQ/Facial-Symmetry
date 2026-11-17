/* Neutral measurement of therapist-defined captures.

   No thresholds, no severity labels, no diagnosis. For every capture the app reports, per face region,
   the patient's right and left values and their difference. Interpretation is the therapist's (and the AI's).

   Two modes:
     reference capture  (the therapist marks it, usually a relaxed face): absolute right/left values
     any other capture  : change from the reference at the moment of largest facial change

   Units: landmark distances are divided by the inner-eye-corner distance (ICD) so they do not depend on camera
   distance, then shown as an estimate in mm assuming an adult ICD of 32 mm. Measurement definitions are listed
   in HOW_MEASURED and shown in the app. */
import { median, quantile, r1 } from "../util.js";

export const ICD_MM = 32;

/* value(m, s) returns the raw ICD-unit value for side s ("R" | "L"), oriented so that bigger = more of the thing named. */
export const METRICS = [
  { id: "brow", region: "Forehead and brows", name: "Eyebrow height", value: (m, s) => m["brow" + s] },
  { id: "eyeOpen", region: "Eyes", name: "Eye opening (lid to lid)", value: (m, s) => m["ap" + s] },
  { id: "upperLid", region: "Eyes", name: "Upper lid to iris centre", value: (m, s) => m["mrd1" + s] },
  { id: "lowerLid", region: "Eyes", name: "Lower lid to iris centre", value: (m, s) => m["mrd2" + s] },
  { id: "gazeH", region: "Eye position", name: "Iris position, towards patient's left", value: (m, s) => m["gx" + s], unit: "ratio" },
  { id: "gazeV", region: "Eye position", name: "Iris position, upwards", value: (m, s) => -m["gy" + s], unit: "ratio" },
  { id: "nose", region: "Nose and upper lip", name: "Nostril height", absName: "Nostril, distance below eye line", value: (m, s) => -m["ala" + s] },
  { id: "upperLip", region: "Nose and upper lip", name: "Upper lip height (side)", absName: "Upper lip (side), distance below eye line", value: (m, s) => -m["ul" + s] },
  { id: "mouthOut", region: "Mouth", name: "Mouth corner distance from midline", value: (m, s) => m["mcx" + s] },
  { id: "mouthUp", region: "Mouth", name: "Mouth corner height", absName: "Mouth corner, distance below eye line", value: (m, s) => -m["mcy" + s] },
  { id: "lowerLip", region: "Mouth", name: "Lower lip lowering (side)", absName: "Lower lip (side), distance below eye line", value: (m, s) => m["ll" + s] },
  { id: "cheek", region: "Cheeks", name: "Cheek forward position", value: (m, s) => -m["chz" + s] },
  { id: "faceWidth", region: "Face contour", name: "Half-face width at cheekbone", value: (m, s) => m["face" + s] }
];
export const MIDLINE = [
  { id: "chin", name: "Chin offset towards patient's left", value: m => m.chinX },
  { id: "opening", name: "Nose-tip to chin distance", value: m => m.jaw },
  { id: "lips", name: "Gap between lips", value: m => m.lipOpen }
];

export const HOW_MEASURED = [
  "468 face landmarks are tracked by MediaPipe Face Landmarker on this device.",
  "Measurements are rotated into a head-fixed frame built from the inner eye corners and nose bridge, so moderate head tilt does not change them.",
  "Distances are divided by the distance between the inner eye corners, then shown in mm assuming that distance is 32 mm (an adult average). Treat mm values as estimates.",
  "Frames where the head is turned or tilted more than the configured limit (default 15°) are skipped, because left/right comparisons are unreliable there.",
  "Reference capture: the median of all usable frames (still frames only when the face was still).",
  "Other captures: the change from the reference, taken at the moments of largest overall facial change (the top 20% of frames), as a median.",
  "Difference = how much less the side with the smaller value moved (or measured), as a % of the larger side.",
  "No difference is given when both sides are below the camera's precision (under 1 mm, or under 0.05 for iris position): a percentage of near-zero values would only reflect noise.",
  "Iris-position values are marked not valid in captures where both eyes were mostly closed, because the iris cannot be seen.",
  "Blinks: both eyes below half their usual opening at the same time. One-sided eye closures: one eye below 60% of its usual opening while the other stays above 85%.",
  "Start-to-end change: the last quarter of a capture compared with its first quarter."
];

const mm = v => (Number.isFinite(v) ? r1(v * ICD_MM) : null);
const PRECISION = { mm: 1.0, ratio: 0.05 };   // camera precision; below this no % difference is reported

/** One table row with neutral right/left values and, if measurable, the % difference. */
function makeRow(mt, R, L, absolute) {
  const unit = mt.unit === "ratio" ? "ratio" : "mm";
  let vR = fmt(mt, R), vL = fmt(mt, L);
  if (absolute && mt.absName) { vR = vR === null ? null : Math.abs(vR); vL = vL === null ? null : Math.abs(vL); }
  const comparable = Math.max(Math.abs(vR || 0), Math.abs(vL || 0)) >= PRECISION[unit];
  return { id: mt.id, region: mt.region, name: absolute && mt.absName ? mt.absName : mt.name, R: vR, L: vL, unit: unit === "ratio" ? "" : "mm",
    comparable, diff: comparable ? diffPct(R, L) : null, smaller: comparable ? smaller(R, L) : null, size: Math.abs(R) + Math.abs(L) };
}
const fmt = (metric, v) => (metric.unit === "ratio" ? (Number.isFinite(v) ? Math.round(v * 100) / 100 : null) : mm(v));

function quality(rec) {
  const total = rec.total || rec.frames.length || 0, ok = rec.frames.filter(f => f.ok).length;
  return { total, ok, ratio: total ? ok / total : 0, noFace: rec.noFace || 0, headTurned: rec.badPose || 0, single: !!rec.single };
}

/** Raw median metrics of a capture (used as the reference). */
export function baseline(rec) {
  const ok = rec.frames.filter(f => f.ok);
  if (!ok.length) return null;
  const still = ok.filter(f => f.still), use = still.length >= 5 ? still : ok;
  const m = {};
  for (const k of Object.keys(use[0].m)) m[k] = median(use.map(f => f.m[k]).filter(Number.isFinite));
  return { m, stillFrames: still.length, usedFrames: use.length };
}

function diffPct(a, b) {
  const hi = Math.max(Math.abs(a), Math.abs(b));
  return hi > 0 ? Math.round((1 - Math.min(Math.abs(a), Math.abs(b)) / hi) * 100) : 0;
}
const smaller = (a, b) => (Math.abs(a) < Math.abs(b) ? "R" : Math.abs(b) < Math.abs(a) ? "L" : null);

function timeline(ok) {
  if (ok.length < 60) return null; // needs a few seconds of usable video
  const span = ok[ok.length - 1].t - ok[0].t;
  if (span < 4000) return null;
  const mR = median(ok.map(f => f.m.apR)), mL = median(ok.map(f => f.m.apL));
  let blinks = 0, inB = false;
  const one = { R: 0, L: 0 }, on = { R: false, L: false };
  for (const f of ok) {
    const cR = f.m.apR < 0.5 * mR, cL = f.m.apL < 0.5 * mL;
    if (cR && cL && !inB) blinks++;
    inB = cR && cL;
    for (const [s, me, o, ms, mo] of [["R", f.m.apR, f.m.apL, mR, mL], ["L", f.m.apL, f.m.apR, mL, mR]]) {
      const now = me < 0.6 * ms && o > 0.85 * mo;
      if (now && !on[s]) one[s]++;
      on[s] = now;
    }
  }
  const t0 = ok[0].t, q1 = ok.filter(f => f.t - t0 <= span * 0.25), q4 = ok.filter(f => f.t - t0 >= span * 0.75);
  const change = (k) => mm(median(q4.map(f => f.m[k])) - median(q1.map(f => f.m[k])));
  return {
    seconds: Math.round(span / 1000), blinksPerMin: Math.round(blinks / (span / 60000)), oneSidedEyeClosures: one,
    startToEnd: { upperLidR: change("mrd1R"), upperLidL: change("mrd1L"), mouthCornerHeightR: mm(-(median(q4.map(f => f.m.mcyR)) - median(q1.map(f => f.m.mcyR)))), mouthCornerHeightL: mm(-(median(q4.map(f => f.m.mcyL)) - median(q1.map(f => f.m.mcyL)))) }
  };
}

/** Summarise one capture. ref = baseline() of the reference capture, or null. */
export function summarize(rec, ref, isReference) {
  const q = quality(rec), ok = rec.frames.filter(f => f.ok);
  if (!ok.length) return { valid: false, q, reason: "No usable frames (face not found or head turned too far)." };

  if (isReference || !ref) {
    const b = baseline(rec);
    const rows = METRICS.map(mt => makeRow(mt, mt.value(b.m, "R"), mt.value(b.m, "L"), true));
    const mid = MIDLINE.map(x => ({ id: x.id, name: x.name, value: mm(x.value(b.m)) }));
    return { valid: true, q, mode: "absolute", rows, midline: mid, timeline: timeline(ok), stillFrames: b.stillFrames };
  }

  // change from reference, at the moments of largest overall change
  const deltas = ok.map(f => METRICS.map(mt => [mt.value(f.m, "R") - mt.value(ref.m, "R"), mt.value(f.m, "L") - mt.value(ref.m, "L")]));
  const total = deltas.map(d => d.reduce((a, [x, y]) => a + Math.abs(x) + Math.abs(y), 0));
  const thr = quantile(total, 0.8);
  const idx = total.map((v, i) => (v >= thr ? i : -1)).filter(i => i >= 0);
  const peakFrames = idx.map(i => ok[i]);
  // iris position is meaningless when both eyes are mostly closed
  const eyesClosed = median(peakFrames.map(f => f.m.apR / ref.m.apR)) < 0.5 && median(peakFrames.map(f => f.m.apL / ref.m.apL)) < 0.5;
  const rows = METRICS.map((mt, j) => {
    const r = makeRow(mt, median(idx.map(i => deltas[i][j][0])), median(idx.map(i => deltas[i][j][1])), false);
    if (eyesClosed && mt.id.startsWith("gaze")) Object.assign(r, { comparable: false, diff: null, smaller: null, invalid: "eyes mostly closed" });
    return r;
  }).sort((a, b) => (b.comparable - a.comparable) || (b.size - a.size));
  const mid = MIDLINE.map(x => ({ id: x.id, name: x.name, value: mm(median(peakFrames.map(f => x.value(f.m))) - x.value(ref.m)) }));
  return { valid: true, q, mode: "change", rows, midline: mid, timeline: timeline(ok) };
}

/** Summaries for every capture in a session, in recording order. */
export function summarizeAll(captures) {
  const refCap = captures.find(c => c.reference && c.rec);
  const ref = refCap ? baseline(refCap.rec) : null;
  return captures.filter(c => c.rec).map(c => ({ id: c.id, label: c.label, reference: !!c.reference, ...summarize(c.rec, ref, c.reference) }));
}
