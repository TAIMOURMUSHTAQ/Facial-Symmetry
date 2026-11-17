/* Synthetic, therapist-style examinations shared by the browser tests and the AI evaluation (Node).
   Each case is what a therapist would produce: captures they named themselves, free-text notes and safety ticks. */
import { summarizeAll } from "../src/engine/measure.js";
import { SAFETY_QUESTIONS } from "../src/knowledge/safety.js";

const BASE = { browR: .55, browL: .55, apR: .3, apL: .3, mrd1R: .14, mrd1L: .14, mrd2R: .16, mrd2L: .16, gxR: 0, gxL: 0, gyR: 0, gyL: 0, fwR: .9, fwL: .9,
  mcxR: .75, mcxL: .75, mcyR: 1.6, mcyL: 1.6, llR: 1.75, llL: 1.75, ulR: 1.45, ulL: 1.45, alaR: 1, alaL: 1, chzR: -.3, chzL: -.3, faceR: 1.6, faceL: 1.6,
  chinX: 0, jaw: 2.3, lipOpen: .02, mouthW: 1.5, tongue: 0, jawBS: 0 };
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.006;

export function rec(n, fn) {
  const frames = [];
  for (let i = 0; i < n; i++) {
    const m = { ...BASE }; Object.keys(m).forEach(k => { m[k] += rnd(); });
    Object.assign(m, fn ? fn(m, i, n) : {});
    frames.push({ t: i * 33, m, pose: { roll: 0, pitch: 0, yaw: 0 }, ok: true, still: true });
  }
  return { frames, total: n, noFace: 0, badPose: 0 };
}

let nid = 0;
export const cap = (label, n, fn, extra = {}) => ({ id: "c" + (++nid), label, seconds: Math.round(n / 30), reference: false, notes: "", rec: rec(n, fn), ...extra });

/** A typical facial routine; strength per side 1 = normal, 0 = no movement. */
export function routine({ R = 1, L = 1, browR = R, browL = L, eyeR = R, eyeL = L, droopL = 0 } = {}) {
  return [
    cap("Relaxed face", 150, m => ({ mcyL: m.mcyL + droopL }), { reference: true }),
    cap("Raise eyebrows", 120, m => ({ browR: m.browR + .15 * browR, browL: m.browL + .15 * browL })),
    cap("Close eyes tightly", 120, () => ({ apR: .3 * (1 - .97 * eyeR), apL: .3 * (1 - .97 * eyeL) })),
    cap("Big smile", 120, m => ({ mcxR: m.mcxR + .15 * R, mcyR: m.mcyR - .12 * R, mcxL: m.mcxL + .15 * L, mcyL: m.mcyL - .12 * L })),
    cap("Pucker lips", 120, m => ({ mcxR: m.mcxR - .12 * R, mcxL: m.mcxL - .12 * L }))
  ];
}

/** Everything the AI would see for a case (same shape as src/ai/assist.js caseData). */
export function caseDataFor(c) {
  const caps = c.captures();
  const notes = Object.fromEntries(caps.map(x => [x.id, x.notes || ""]));
  return {
    patient: c.patient || {}, notes: c.notes || "", fields: [],
    safety: SAFETY_QUESTIONS.filter(q => (c.safety || {})[q.key]).map(q => q.q),
    captures: summarizeAll(caps).map(x => ({ ...x, notes: notes[x.id] })), planned: [], question: c.question || ""
  };
}

/* AI evaluation cases. expect.top: regex the leading possibility should match; side: weaker side;
   emergency: must an emergency be raised. Notes are written the way a therapist might write them. */
export const CASES = [
  { id: "bells", title: "Acute left peripheral facial palsy", patient: { age: 34, sex: "female" },
    notes: "Woke up 2 days ago with the left side of the face drooping. Some pain behind the left ear. No limb weakness, speech normal, no rash, hearing normal.",
    safety: { eye_not_closing: true, onset_72h: true }, captures: () => routine({ L: .2, droopL: .1 }),
    expect: { top: /bell/i, side: "left", emergency: false } },
  { id: "stroke", title: "Left lower-face weakness, forehead moves, sudden, arm weak", patient: { age: 71, sex: "male" },
    notes: "Sudden onset 1 hour ago while having breakfast. Wife says speech slurred, left arm weak. Hypertensive.",
    safety: { acute_neuro: true }, captures: () => routine({ R: 1, L: .3, browL: 1, eyeL: .93 }),
    expect: { top: /stroke|central|upper motor|cerebrovascular/i, side: "left", emergency: true, flag: /stroke|emergen/i } },
  { id: "normal", title: "Symmetric face, routine check", patient: { age: 28, sex: "female" },
    notes: "Referred by dentist to check facial symmetry before orthodontic work. No symptoms.", captures: () => routine(),
    expect: { top: /normal|no (significant|clinically)|physiolog|none|within normal|symmetric/i, side: "none", emergency: false, allowEmpty: true } },
  { id: "myasthenia", title: "Left eyelid drooping that worsens during sustained upgaze", patient: { age: 45, sex: "female" },
    notes: "Left eyelid droops, worse in the evenings. Sometimes double vision when tired. Pupils equal.",
    captures: () => [cap("Relaxed face", 150, () => ({ mrd1L: .1 }), { reference: true }),
      cap("Look up and hold for 30 seconds", 900, (m, i, n) => ({ mrd1L: .14 - .08 * i / n, mrd1R: .14, gyR: -.2, gyL: -.2 }))],
    expect: { top: /myasthen/i, side: "left", emergency: false } },
  { id: "ramsay_hunt", title: "Left peripheral palsy with ear vesicles", patient: { age: 63, sex: "male" },
    notes: "Left face weak since yesterday. Severe left ear pain, blisters in the ear canal, reduced hearing on the left, dizzy.",
    safety: { ear_vesicles: true, onset_72h: true, eye_not_closing: true }, captures: () => routine({ L: .15, droopL: .1 }),
    expect: { top: /ramsay|zoster|herpe/i, side: "left", emergency: false } },
  { id: "hemifacial_spasm", title: "Right eye twitching", patient: { age: 57, sex: "female" },
    notes: "Months of involuntary twitching around the right eye, now spreading to the right mouth corner.",
    captures: () => [cap("Relaxed face", 150, null, { reference: true }), cap("Sit quietly, observe", 360, (m, i) => (i % 60 < 6 ? { apR: .05 } : {}))],
    expect: { top: /hemifacial spasm/i, side: "right", emergency: false } },
  { id: "gbs", title: "Both sides weak, limb weakness after infection", patient: { age: 39, sex: "male" },
    notes: "Diarrhoeal illness 2 weeks ago. Now both sides of the face weak and tingling legs, legs getting weaker since 3 days.",
    safety: { bilateral_limb: true, swallow_breath: true }, captures: () => routine({ R: .15, L: .15 }),
    expect: { top: /guillain|gbs|acute inflammatory/i, side: "both", emergency: true, flag: /guillain|gbs|breath|respirat|swallow|emergen/i } },
  { id: "parkinsonism", title: "Reduced expression both sides, tremor", patient: { age: 72, sex: "male" },
    notes: "Family says face looks 'mask-like' over the last year. Right hand tremor at rest, walking slower. Soft voice.",
    captures: () => [...routine({ R: .25, L: .25, eyeR: 1, eyeL: 1 }), cap("Sit quietly, observe", 400)],
    expect: { top: /parkinson|hypomimia/i, side: "both", emergency: false } }
];
