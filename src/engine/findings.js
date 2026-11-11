/* Turns analysed numbers into findings: observations with a region, side, severity and reliability.
   Findings are what the clinician reviews (accept / reject / override) and what the reasoning engine uses. */
import { T, grade3 } from "./thresholds.js";
import { STEP, MOTOR_STEPS } from "../exam/protocol.js";
import { pct } from "../util.js";
import { sideName } from "../i18n/index.js";

const ICD_MM = 32; // approximate adult inter-canthal distance, used only to show readable mm estimates
export const mm = v => (Number.isFinite(v) ? `≈${(Math.abs(v) * ICD_MM).toFixed(1)} mm` : "");

export const REGIONS = [
  { id: "forehead", name: "Forehead and brows" },
  { id: "eyes", name: "Eyelids and eye closure" },
  { id: "gaze", name: "Eye movements" },
  { id: "midface", name: "Nose and midface" },
  { id: "mouth", name: "Mouth and lips" },
  { id: "cheeks", name: "Cheeks" },
  { id: "jaw", name: "Jaw" },
  { id: "tongue", name: "Tongue, palate and voice" },
  { id: "global", name: "Whole face" }
];

const STEP_REGION = { brow: "forehead", eye_gentle: "eyes", eye_tight: "eyes", snarl: "midface", smile: "mouth", pucker: "mouth", cheek: "cheeks", lower_teeth: "mouth" };
const MOVE_NAME = { brow: "Eyebrow raise", eye_gentle: "Gentle eye closure", eye_tight: "Forceful eye closure", snarl: "Nose wrinkle / upper lip lift", smile: "Smile", pucker: "Lip pucker", cheek: "Cheek puff", lower_teeth: "Lower lip depression" };
const other = s => (s === "R" ? "L" : "R");

export function buildFindings(A) {
  const F = [];
  const add = f => { if (f.sev > 0) F.push({ reliability: "moderate", ...f, key: f.key || f.type + (f.step ? ":" + f.step : "") + (f.detail ? ":" + f.detail : "") }); };
  const rest = A.rest && A.rest.valid ? A.rest : null;

  /* ---------- resting face ---------- */
  if (rest) {
    const m = rest.m, rel = Math.abs(rest.pose.yaw) > 8 ? "low" : "moderate";
    const droop = m.mcyR - m.mcyL;
    add({ type: "rest_droop", region: "mouth", step: "rest", side: droop > 0 ? "R" : "L", sev: grade3(Math.abs(droop), T.rest.droop), value: Math.abs(droop),
      text: `Mouth corner sits lower on the ${sideName(droop > 0 ? "R" : "L")} at rest (${mm(droop)}).` });

    const brow = m.browR - m.browL;
    add({ type: "rest_brow_low", region: "forehead", step: "rest", side: brow < 0 ? "R" : "L", sev: grade3(Math.abs(brow), T.rest.brow), value: Math.abs(brow),
      text: `Eyebrow sits lower on the ${sideName(brow < 0 ? "R" : "L")} at rest (${mm(brow)}).` });

    const lowR = m.mrd1R < T.rest.mrd1Low, lowL = m.mrd1L < T.rest.mrd1Low, d1 = m.mrd1R - m.mrd1L;
    let ptosisSide = null;
    if (lowR && lowL && Math.abs(d1) < T.rest.mrd1Diff[0]) {
      ptosisSide = "both";
      add({ type: "ptosis", region: "eyes", step: "rest", side: "both", sev: 2, value: Math.min(m.mrd1R, m.mrd1L), text: `Both upper eyelids sit low over the iris (lid to iris centre ${mm(m.mrd1R)} right, ${mm(m.mrd1L)} left).` });
    } else {
      const s = d1 < 0 ? "R" : "L";
      const sev = Math.max(grade3(Math.abs(d1), T.rest.mrd1Diff), (s === "R" ? lowR : lowL) ? 1 : 0);
      if (sev) ptosisSide = s;
      add({ type: "ptosis", region: "eyes", step: "rest", side: s, sev, value: Math.abs(d1), text: `Upper eyelid droops on the ${sideName(s)} (${mm(d1)} lower than the other side).` });
    }
    const d2 = m.mrd2R - m.mrd2L, s2 = d2 < 0 ? "R" : "L";
    if (Math.abs(d2) >= T.rest.mrd2Diff) add({ type: "lower_lid_raised", region: "eyes", step: "rest", side: s2, sev: 1, value: Math.abs(d2), reliability: "low",
      text: `Lower eyelid sits higher on the ${sideName(s2)} (${mm(d2)}), so that eye looks smaller.` });
    for (const s of ["R", "L"]) {
      if (m["mrd1" + s] > T.rest.mrd1High || m["mrd2" + s] > T.rest.mrd2High)
        add({ type: "lid_retraction", region: "eyes", step: "rest", side: s, sev: 1, value: m["mrd1" + s], reliability: "low", text: `White of the eye visible above or below the iris on the ${sideName(s)} (possible lid retraction or scleral show).` });
    }
    const apRel = (m.apR - m.apL) / Math.max(m.apR, m.apL), wide = apRel > 0 ? "R" : "L";
    if (!ptosisSide || ptosisSide === wide) add({ type: "aperture_wide", region: "eyes", step: "rest", side: wide, sev: grade3(Math.abs(apRel), T.rest.apWide), value: Math.abs(apRel),
      text: `Eye opening is wider on the ${sideName(wide)} at rest (${pct(Math.abs(apRel))}% wider).` });

    const fw = (m.faceR - m.faceL) / ((m.faceR + m.faceL) / 2), big = fw > 0 ? "R" : "L";
    add({ type: "face_width", region: "global", step: "rest", side: big, sev: grade3(Math.abs(fw), T.rest.face), value: Math.abs(fw), reliability: rel === "low" ? "low" : "moderate",
      text: `The ${sideName(big)} half of the face is fuller or wider at the cheek (${pct(Math.abs(fw))}% difference). Could be swelling on that side or loss of volume on the other.` });
    add({ type: "chin_offset", region: "jaw", step: "rest", side: m.chinX > 0 ? "L" : "R", sev: grade3(Math.abs(m.chinX), T.rest.chin), value: Math.abs(m.chinX), reliability: "low",
      text: `Chin sits off the midline towards the ${sideName(m.chinX > 0 ? "L" : "R")} at rest (${mm(m.chinX)}).` });
  }

  /* ---------- voluntary facial movements ---------- */
  let bilatLow = 0, measured = 0;
  for (const id of MOTOR_STEPS) {
    const s = A.steps[id];
    if (!s || !s.valid || !s.exc) continue;
    measured++;
    const [R, L] = s.exc, region = STEP_REGION[id], name = MOVE_NAME[id], lowRel = STEP[id].lowReliability ? "low" : "moderate";
    const hi = Math.max(R, L), min = T.minExc[id];
    if (hi < T.noise && !id.startsWith("eye")) {
      bilatLow++;
      add({ type: "no_movement", region, step: id, side: "both", sev: 3, value: hi, reliability: "low", text: `${name}: no measurable movement on either side. Check the patient understood, or consider bilateral weakness.` });
      continue;
    }
    if (R < min && L < min) {
      bilatLow++;
      add({ type: "weak_bilateral", region, step: id, side: "both", sev: 2, value: hi, reliability: lowRel, text: `${name}: reduced on both sides compared with typical movement.` });
    }
    const asym = 1 - s.sym, sev = grade3(asym, T.asym);
    add({ type: "weak", region, step: id, side: s.weaker, sev, value: asym, reliability: lowRel,
      text: `${name}: weaker on the ${sideName(s.weaker)} (${pct(asym)}% less movement than the other side).` });

    if (id === "eye_gentle" || id === "eye_tight") {
      for (const sd of ["R", "L"]) {
        const c = sd === "R" ? R : L;
        if (c < T.closureComplete) add({ type: "incomplete_closure", region: "eyes", step: id, side: sd, detail: sd, sev: c < 0.5 ? 3 : c < 0.7 ? 2 : 1, value: c,
          text: `${name}: the ${sideName(sd)} eye does not close fully (${pct(c)}% closed, gap ${mm(s.gap[sd === "R" ? 0 : 1])}).` });
      }
      if (s.synkMouth) {
        const [a, b] = s.synkMouth, sd = a > b ? "R" : "L";
        add({ type: "synkinesis", region: "mouth", step: id, side: sd, detail: "ocular-oral", sev: grade3(Math.abs(a - b), T.synk.mouthMove), value: Math.abs(a - b), reliability: "low",
          text: `During eye closure the ${sideName(sd)} mouth corner moves more (${mm(a - b)}): possible eye-to-mouth synkinesis.` });
      }
    }
    if (s.synkEye) {
      const [a, b] = s.synkEye, sd = a > b ? "R" : "L";
      if (Math.max(a, b) > 0.15) add({ type: "synkinesis", region: "eyes", step: id, side: sd, detail: "oral-ocular", sev: grade3(Math.abs(a - b), T.synk.eyeNarrow), value: Math.abs(a - b), reliability: "low",
        text: `During the ${name.toLowerCase()} the ${sideName(sd)} eye narrows more (${pct(Math.abs(a - b))}%): possible mouth-to-eye synkinesis.` });
    }
  }
  if (measured >= 3 && bilatLow >= 3) add({ type: "global_reduced", region: "global", side: "both", sev: 2, value: bilatLow,
    text: `Reduced movement on both sides in ${bilatLow} of ${measured} facial movements (mask-like face or bilateral weakness).` });

  /* ---------- cheek air leak (rated) ---------- */
  const ch = A.steps.cheek;
  if (ch && ch.rating && ch.rating.airLeak && ch.rating.airLeak !== "none")
    add({ type: "air_leak", region: "cheeks", step: "cheek", side: ch.rating.airLeak, sev: 2, value: null, reliability: "clinician", text: `Air leaks from the mouth (${ch.rating.airLeak === "both" ? "cannot hold air" : sideName(ch.rating.airLeak)}), rated by clinician.` });

  /* ---------- jaw ---------- */
  const j = A.steps.jaw;
  if (j && j.valid && Number.isFinite(j.dev)) {
    const sd = j.dev > 0 ? "L" : "R";
    add({ type: "jaw_deviation", region: "jaw", step: "jaw", side: sd, sev: grade3(Math.abs(j.dev), T.jaw.dev), value: Math.abs(j.dev), reliability: "low",
      text: `On opening, the jaw deviates towards the ${sideName(sd)} (${mm(j.dev)}).` });
    if (j.open < T.jaw.openLow) add({ type: "jaw_open_limited", region: "jaw", step: "jaw", side: "both", sev: 1, value: j.open, reliability: "low", text: `Mouth opening looks limited (${mm(j.open)} increase in nose-to-chin distance).` });
  }

  /* ---------- eye movements ---------- */
  for (const id of ["gaze_left", "gaze_right", "gaze_up", "gaze_down"]) {
    const g = A.steps[id];
    if (!g || !g.valid) continue;
    const dir = STEP[id].dir;
    if (g.headMoved > T.gaze.headMovedDeg) { add({ type: "gaze_unreliable", region: "gaze", step: id, side: null, sev: 1, reliability: "low", value: g.headMoved, text: `Looking ${dir}: the head moved ${g.headMoved}°, so this eye-movement reading is unreliable. Repeat with the head held still.` }); continue; }
    const [R, L] = g.exc;
    if (Math.max(R, L) < T.gaze.minExc) {
      add({ type: "gaze_reduced_both", region: "gaze", step: id, side: "both", detail: dir, sev: 1, value: Math.max(R, L), reliability: "low", text: `Looking ${dir}: very little eye movement in both eyes (check the patient followed the target).` });
      continue;
    }
    const sev = g.sym < T.gaze.limit[2] ? 3 : g.sym < T.gaze.limit[1] ? 2 : g.sym < T.gaze.limit[0] ? 1 : 0;
    const eye = g.weaker, move = g.move[eye === "R" ? 0 : 1];
    add({ type: "gaze_limit", region: "gaze", step: id, side: eye, detail: move, sev, value: 1 - g.sym, reliability: "low",
      text: `Looking ${dir}: the ${sideName(eye)} eye moves less (${move}, ${pct(1 - g.sym)}% less than the other eye).` });
  }

  /* ---------- fatigue ---------- */
  const up = A.steps.upgaze_hold;
  if (up && up.valid) {
    const sev = up.drop.map(d => grade3(d, T.fatigue.lidDrop));
    const side = sev[0] && sev[1] ? "both" : sev[0] ? "R" : sev[1] ? "L" : null;
    if (side) add({ type: "fatigable_ptosis", region: "eyes", step: "upgaze_hold", side, sev: Math.max(...sev), value: Math.max(...up.drop),
      text: `Eyelid drooped during ${up.seconds} s of sustained upward gaze (${side === "both" ? "both eyes" : sideName(side)}, up to ${mm(Math.max(...up.drop))}).` });
  }
  const rp = A.steps.smile_repeat;
  if (rp && rp.valid && rp.decline && rp.reps >= T.fatigue.minReps) {
    const sev = rp.decline.map(d => grade3(d, T.fatigue.smileDecline));
    const side = sev[0] && sev[1] ? "both" : sev[0] ? "R" : sev[1] ? "L" : null;
    if (side) add({ type: "fatigable_weakness", region: "mouth", step: "smile_repeat", side, sev: Math.max(...sev), value: Math.max(...rp.decline),
      text: `Smile weakened over ${rp.reps} repetitions (${pct(Math.max(...rp.decline))}% decline, ${side === "both" ? "both sides" : sideName(side)}).` });
  }

  /* ---------- involuntary movement and blink rate ---------- */
  const ob = A.steps.observe;
  if (ob && ob.valid) {
    if (ob.blinkRate < T.blink.low) add({ type: "blink_low", region: "global", step: "observe", side: "both", sev: 1, value: ob.blinkRate, text: `Low blink rate at rest (${ob.blinkRate} per minute; typical 12-20).` });
    if (ob.blinkRate > T.blink.high) add({ type: "blink_high", region: "eyes", step: "observe", side: "both", sev: 1, value: ob.blinkRate, text: `High blink rate at rest (${ob.blinkRate} per minute).` });
    for (const sd of ["R", "L"]) {
      add({ type: "eye_twitch", region: "eyes", step: "observe", side: sd, sev: grade3(ob.eyeTwitch[sd], T.twitch.events), value: ob.eyeTwitch[sd], reliability: "low", text: `${ob.eyeTwitch[sd]} one-sided eye closures or twitches on the ${sideName(sd)} during ${ob.seconds} s of rest.` });
      add({ type: "mouth_twitch", region: "mouth", step: "observe", side: sd, sev: grade3(ob.mouthTwitch[sd], T.twitch.events), value: ob.mouthTwitch[sd], reliability: "low", text: `${ob.mouthTwitch[sd]} one-sided mouth-corner twitches on the ${sideName(sd)} during ${ob.seconds} s of rest.` });
    }
  }

  /* ---------- tongue, palate, voice (clinician-rated) ---------- */
  const tg = A.steps.tongue && A.steps.tongue.rating;
  if (tg) {
    if (tg.deviation === "R" || tg.deviation === "L") add({ type: "tongue_deviation", region: "tongue", step: "tongue", side: tg.deviation, sev: 2, reliability: "clinician", text: `Tongue deviates to the ${sideName(tg.deviation)} on protrusion.` });
    if (tg.deviation === "cannot") add({ type: "tongue_weak", region: "tongue", step: "tongue", side: "both", sev: 3, reliability: "clinician", text: "Patient cannot protrude the tongue." });
    if (tg.wasting && tg.wasting !== "none") add({ type: "tongue_wasting", region: "tongue", step: "tongue", side: tg.wasting, sev: 2, reliability: "clinician", text: `Tongue wasting (${tg.wasting === "both" ? "both sides" : sideName(tg.wasting)}).` });
    if (tg.fasciculations === "yes") add({ type: "tongue_fasciculations", region: "tongue", step: "tongue", side: "both", sev: 2, reliability: "clinician", text: "Tongue fasciculations seen." });
    if (tg.lateral === "slow") add({ type: "tongue_slow", region: "tongue", step: "tongue", side: "both", sev: 1, reliability: "clinician", text: "Slow or reduced side-to-side tongue movement." });
    if (tg.lateral === "weakR" || tg.lateral === "weakL") add({ type: "tongue_lateral_weak", region: "tongue", step: "tongue", side: tg.lateral.slice(-1), sev: 1, reliability: "clinician", text: `Weak tongue movement towards the ${sideName(tg.lateral.slice(-1))}.` });
  }
  const pl = A.steps.palate && A.steps.palate.rating;
  if (pl) {
    if (pl.uvula === "R" || pl.uvula === "L") add({ type: "uvula_deviation", region: "tongue", step: "palate", side: pl.uvula, sev: 2, reliability: "clinician", text: `Uvula pulled to the ${sideName(pl.uvula)} (suggests weakness on the ${sideName(other(pl.uvula))}).` });
    if (pl.elevation && pl.elevation !== "symmetric") { const sd = pl.elevation === "weakBoth" ? "both" : pl.elevation.slice(-1); add({ type: "palate_weak", region: "tongue", step: "palate", side: sd, sev: 2, reliability: "clinician", text: `Palate elevation weak (${sd === "both" ? "both sides" : sideName(sd)}).` }); }
    if (pl.voice && pl.voice !== "normal") add({ type: "voice_" + pl.voice, region: "tongue", step: "palate", side: null, sev: 1, reliability: "clinician", text: { nasal: "Nasal voice (possible palatal weakness).", hoarse: "Hoarse or breathy voice (possible vocal cord weakness, CN X).", dysarthric: "Slurred speech (dysarthria)." }[pl.voice] });
  }
  return F;
}

/** Apply the clinician's review: rejected findings are dropped, overrides change severity. */
export function reviewed(findings, review) {
  return findings.map(f => {
    const r = review[f.key];
    if (!r || r.decision === "accept") return f;
    if (r.decision === "reject") return null;
    return { ...f, sev: r.sev, overridden: true };
  }).filter(f => f && f.sev > 0);
}
