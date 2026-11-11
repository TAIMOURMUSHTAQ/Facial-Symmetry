/* Converts the frames recorded for each step into numbers: per-side excursions, closure, gaze, fatigue,
   involuntary events. Pure functions of the recorded data (no DOM), so they can be unit-tested. */
import { median, quantile, mean, symmetry, r3 } from "../util.js";
import { STEP } from "../exam/protocol.js";

const KEYS = ["browR", "browL", "apR", "apL", "mrd1R", "mrd1L", "mrd2R", "mrd2L", "gxR", "gxL", "gyR", "gyL", "fwR", "fwL",
  "mcxR", "mcxL", "mcyR", "mcyL", "llR", "llL", "ulR", "ulL", "alaR", "alaL", "chzR", "chzL", "faceR", "faceL", "chinX", "jaw", "lipOpen", "mouthW"];

function quality(rec) {
  const total = rec.total || rec.frames.length || 0;
  const ok = rec.frames.filter(f => f.ok).length;
  return { total, ok, ratio: total ? ok / total : 0, noFace: rec.noFace || 0, badPose: rec.badPose || 0, single: !!rec.single };
}

const medianM = frames => Object.fromEntries(KEYS.map(k => [k, median(frames.map(f => f.m[k]))]));
const medianPose = frames => ({ roll: median(frames.map(f => f.pose.roll)), pitch: median(frames.map(f => f.pose.pitch)), yaw: median(frames.map(f => f.pose.yaw)) });

/** Rest: median of still frames (falls back to all usable frames, flagged). */
export function analyzeRest(rec) {
  const q = quality(rec);
  const ok = rec.frames.filter(f => f.ok);
  if (!ok.length) return { valid: false, q, reason: "No usable frames (face not found or head turned)." };
  const still = ok.filter(f => f.still);
  const use = still.length >= 5 || q.single ? (still.length ? still : ok) : ok;
  return { valid: true, q, stillFrames: still.length, usedAllFrames: use === ok && !q.single, m: medianM(use), pose: medianPose(use) };
}

/** Frames at the peak of the movement: the top 20% by combined excursion. */
function peak(ok, step, rest) {
  const d = ok.map(f => step.delta(f.m, rest));
  const tot = d.map(x => x[0] + x[1]), thr = quantile(tot, 0.8);
  const idx = tot.map((v, i) => (v >= thr ? i : -1)).filter(i => i >= 0);
  return { frames: idx.map(i => ok[i]), d: idx.map(i => d[i]) };
}

function analyzeMove(step, rec, rest) {
  const q = quality(rec);
  const ok = rec.frames.filter(f => f.ok);
  if (ok.length < (q.single ? 1 : 5)) return { valid: false, q, reason: "Too few usable frames." };
  const P = peak(ok, step, rest.m);
  const R = median(P.d.map(x => x[0])), L = median(P.d.map(x => x[1]));
  const out = { valid: true, q, exc: [r3(R), r3(L)], sym: symmetry(R, L), weaker: R < L ? "R" : L < R ? "L" : null };
  const r = rest.m, pf = P.frames;

  if (step.id === "eye_gentle" || step.id === "eye_tight") {
    // residual gap (ICD) and synkinesis: mouth corners moving during eye closure
    out.gap = [r3(median(pf.map(f => f.m.apR))), r3(median(pf.map(f => f.m.apL)))];
    out.synkMouth = [r3(median(pf.map(f => Math.hypot(f.m.mcxR - r.mcxR, f.m.mcyR - r.mcyR)))), r3(median(pf.map(f => Math.hypot(f.m.mcxL - r.mcxL, f.m.mcyL - r.mcyL))))];
  }
  if (step.id === "smile" || step.id === "pucker" || step.id === "snarl") {
    // synkinesis: eye narrowing during a mouth movement
    out.synkEye = [r3(median(pf.map(f => 1 - f.m.apR / r.apR))), r3(median(pf.map(f => 1 - f.m.apL / r.apL)))];
  }
  if (step.id === "jaw") {
    out.open = r3(median(pf.map(f => f.m.jaw - r.jaw)));
    out.dev = r3(median(pf.map(f => f.m.chinX - r.chinX)));   // + = towards patient's left
    delete out.sym; delete out.weaker;
  }
  return out;
}

const GAZE = {
  left: { key: "gx", sign: +1, move: ["adduction", "abduction"] },     // patient's left: right eye adducts, left eye abducts
  right: { key: "gx", sign: -1, move: ["abduction", "adduction"] },
  up: { key: "gy", sign: -1, move: ["elevation", "elevation"] },
  down: { key: "gy", sign: +1, move: ["depression", "depression"] }
};

function analyzeGaze(step, rec, rest) {
  const q = quality(rec);
  const ok = rec.frames.filter(f => f.ok);
  if (ok.length < (q.single ? 1 : 4)) return { valid: false, q, reason: "Too few usable frames." };
  const g = GAZE[step.dir], r = rest.m;
  const d = ok.map(f => [g.sign * (f.m[g.key + "R"] - r[g.key + "R"]), g.sign * (f.m[g.key + "L"] - r[g.key + "L"])]);
  const tot = d.map(x => x[0] + x[1]), thr = quantile(tot, 0.7);
  const top = d.filter((x, i) => tot[i] >= thr), topF = ok.filter((f, i) => tot[i] >= thr);
  const R = median(top.map(x => x[0])), L = median(top.map(x => x[1]));
  const yaw = median(topF.map(f => f.pose.yaw)), pitch = median(topF.map(f => f.pose.pitch));
  const headMoved = Math.max(Math.abs(yaw - rest.pose.yaw), Math.abs(pitch - rest.pose.pitch));
  return { valid: true, q, exc: [r3(R), r3(L)], sym: symmetry(R, L), weaker: R < L ? "R" : L < R ? "L" : null, move: g.move, headMoved: Math.round(headMoved) };
}

function analyzeSustain(step, rec, rest) {
  const q = quality(rec);
  const ok = rec.frames.filter(f => f.ok);
  if (ok.length < 20) return { valid: false, q, reason: "Too few usable frames for a fatigue test." };
  const t0 = ok[0].t, t1 = ok[ok.length - 1].t, span = t1 - t0;
  const first = ok.filter(f => f.t - t0 <= span * 0.25), last = ok.filter(f => f.t - t0 >= span * 0.75);
  const m1 = k => median(first.map(f => f.m[k])), m2 = k => median(last.map(f => f.m[k]));
  return {
    valid: true, q, seconds: Math.round(span / 1000),
    mrd1Start: [r3(m1("mrd1R")), r3(m1("mrd1L"))], mrd1End: [r3(m2("mrd1R")), r3(m2("mrd1L"))],
    drop: [r3(m1("mrd1R") - m2("mrd1R")), r3(m1("mrd1L") - m2("mrd1L"))]
  };
}

function analyzeRepeat(step, rec, rest) {
  const q = quality(rec);
  const ok = rec.frames.filter(f => f.ok);
  if (ok.length < 20) return { valid: false, q, reason: "Too few usable frames for a fatigue test." };
  const d = ok.map(f => step.delta(f.m, rest.m)), tot = d.map(x => x[0] + x[1]);
  const thr = Math.max(...tot) * 0.5;
  const reps = []; let cur = null;
  tot.forEach((v, i) => {
    if (v >= thr) { if (!cur) cur = { R: 0, L: 0, t: ok[i].t }; cur.R = Math.max(cur.R, d[i][0]); cur.L = Math.max(cur.L, d[i][1]); }
    else if (cur && ok[i].t - cur.t > 250) { reps.push(cur); cur = null; }
  });
  if (cur) reps.push(cur);
  const out = { valid: true, q, reps: reps.length, amplitudes: reps.map(x => [r3(x.R), r3(x.L)]) };
  if (reps.length >= 3) {
    const n = Math.min(2, Math.floor(reps.length / 2));
    const a = reps.slice(0, n), b = reps.slice(-n);
    out.decline = ["R", "L"].map(s => { const f = mean(a.map(x => x[s])), l = mean(b.map(x => x[s])); return f > 0 ? r3(Math.max(0, 1 - l / f)) : 0; });
  }
  return out;
}

function analyzeObserve(step, rec, rest) {
  const q = quality(rec);
  const ok = rec.frames.filter(f => f.ok);
  if (ok.length < 30) return { valid: false, q, reason: "Too few usable frames for observation." };
  const mR = median(ok.map(f => f.m.apR)), mL = median(ok.map(f => f.m.apL));
  let blinks = 0, inBlink = false, lastBlink = -1e9;
  const uni = { R: 0, L: 0 }, uniOn = { R: false, L: false }, uniLast = { R: -1e9, L: -1e9 };
  const mouth = { R: 0, L: 0 }, mouthLast = { R: -1e9, L: -1e9 };
  ok.forEach((f, i) => {
    const cR = f.m.apR < 0.5 * mR, cL = f.m.apL < 0.5 * mL;
    if (cR && cL && !inBlink && f.t - lastBlink > 150) { blinks++; lastBlink = f.t; }
    inBlink = cR && cL;
    for (const [s, me, other, mo] of [["R", f.m.apR, f.m.apL, mL], ["L", f.m.apL, f.m.apR, mR]]) {
      const ms = s === "R" ? mR : mL;
      const on = me < 0.6 * ms && other > 0.85 * mo;
      if (on && !uniOn[s] && f.t - uniLast[s] > 300) { uni[s]++; uniLast[s] = f.t; }
      uniOn[s] = on;
    }
    if (i > 0) {
      const p = ok[i - 1].m;
      const dR = Math.hypot(f.m.mcxR - p.mcxR, f.m.mcyR - p.mcyR), dL = Math.hypot(f.m.mcxL - p.mcxL, f.m.mcyL - p.mcyL);
      if (dR > 0.035 && dL < 0.012 && f.t - mouthLast.R > 300) { mouth.R++; mouthLast.R = f.t; }
      if (dL > 0.035 && dR < 0.012 && f.t - mouthLast.L > 300) { mouth.L++; mouthLast.L = f.t; }
    }
  });
  const minutes = Math.max((ok[ok.length - 1].t - ok[0].t) / 60000, 1 / 60);
  return { valid: true, q, seconds: Math.round(minutes * 60), blinks, blinkRate: Math.round(blinks / minutes), eyeTwitch: uni, mouthTwitch: mouth };
}

function analyzeRate(step, rec) {
  const q = quality(rec);
  const tongueMax = Math.max(0, ...rec.frames.filter(f => f.m && Number.isFinite(f.m.tongue)).map(f => f.m.tongue));
  return { valid: true, q, rating: rec.rating || {}, tongueSeen: step.id === "tongue" && rec.frames.length ? tongueMax >= 0.3 : null };
}

/** Analyse every recorded step. Returns { rest, steps: { id: summary } }. */
export function analyzeAll(records) {
  const out = { rest: null, steps: {} };
  const restRec = records.rest;
  out.rest = restRec ? analyzeRest(restRec) : null;
  const rest = out.rest && out.rest.valid ? out.rest : null;
  for (const [id, rec] of Object.entries(records)) {
    if (id === "rest" || !rec || rec.skipped) continue;
    const step = STEP[id];
    if (!step) continue;
    if (step.kind === "rate") { out.steps[id] = analyzeRate(step, rec); if (step.delta && rest && rec.frames.length) Object.assign(out.steps[id], analyzeMove(step, rec, rest), { rating: rec.rating || {} }); continue; }
    if (!rest) { out.steps[id] = { valid: false, q: quality(rec), reason: "Resting face was not recorded, so movement cannot be measured." }; continue; }
    const fn = { move: analyzeMove, gaze: analyzeGaze, sustain: analyzeSustain, repeat: analyzeRepeat, observe: analyzeObserve }[step.kind];
    const res = fn(step, rec, rest);
    if (step.rating) res.rating = rec.rating || {};
    out.steps[id] = res;
  }
  return out;
}
