/* Combines findings into clinical patterns (which side, upper vs lower face, branch, bilateral, fatigue ...)
   and estimates House-Brackmann and Sunnybrook scores. Estimates only: they need clinical confirmation. */
import { UPPER_STEPS, LOWER_STEPS, MOTOR_STEPS, STEP } from "../exam/protocol.js";
import { T, grade3 } from "./thresholds.js";
import { sideName } from "../i18n/index.js";

const BRANCH_OF = { brow: "temporal", eye_gentle: "zygomatic", eye_tight: "zygomatic", snarl: "buccal", smile: "buccal", pucker: "buccal", cheek: "buccal", lower_teeth: "marginal" };

export function findPatterns(F, A) {
  const by = t => F.filter(f => f.type === t);
  const weak = F.filter(f => (f.type === "weak" || f.type === "incomplete_closure") && (f.side === "R" || f.side === "L"));
  const score = { R: 0, L: 0 };
  weak.forEach(f => { score[f.side] += f.sev; });
  by("rest_droop").forEach(f => { score[f.side] += f.sev * 0.5; });
  const side = score.R === score.L ? null : score.R > score.L ? "R" : "L";

  const onSide = (steps, s) => weak.some(f => f.side === s && steps.includes(f.step));
  const tested = steps => steps.some(id => A.steps[id] && A.steps[id].valid);
  // Upper face counts as involved when the forehead is weak, or eye closure is clearly weak (moderate or worse,
  // or incomplete). Mild eye-closure weakness alone can occur in central lesions, so it does not count.
  const upper = side ? (onSide(["brow"], side) || weak.some(f => f.side === side && (f.type === "incomplete_closure" || (UPPER_STEPS.includes(f.step) && f.sev >= 2)))) : false;
  const lower = side ? onSide(LOWER_STEPS, side) : false;
  const browTested = !!(A.steps.brow && A.steps.brow.valid);
  const bilateral = by("weak_bilateral").length + by("no_movement").length >= 3 || by("global_reduced").length > 0;
  const branches = side ? [...new Set(weak.filter(f => f.side === side).map(f => BRANCH_OF[f.step]).filter(Boolean))] : [];
  const facialSev = Math.max(0, ...weak.filter(f => f.side === side).map(f => f.sev), ...by("rest_droop").filter(f => f.side === side).map(f => f.sev));

  let facial = "none";
  if (bilateral) facial = "bilateral";
  else if (side && upper && lower) facial = "peripheral";
  else if (side && lower && !upper) facial = browTested ? "central" : "lower_only_untested";
  else if (side && upper && !lower) facial = "upper_only";
  else if (by("rest_droop").length && !tested(MOTOR_STEPS)) facial = "rest_only";

  const synk = F.filter(f => f.type === "synkinesis");
  const fatigue = F.filter(f => f.type === "fatigable_ptosis" || f.type === "fatigable_weakness");
  const ptosis = by("ptosis")[0] || null;
  const gaze = by("gaze_limit");
  const twitch = F.filter(f => f.type === "eye_twitch" || f.type === "mouth_twitch");
  const twitchSide = twitch.length ? (twitch.every(f => f.side === twitch[0].side) ? twitch[0].side : "both") : null;

  return {
    facial, side, upper, lower, branches, facialSev, bilateral, browTested,
    synkinesis: synk.length ? (synk[0].side) : null,
    fatigable: fatigue.length > 0, fatigueSide: fatigue.length ? fatigue[0].side : null,
    ptosisSide: ptosis ? ptosis.side : null, ptosisSev: ptosis ? ptosis.sev : 0,
    gazeLimits: gaze.map(g => ({ eye: g.side, move: g.detail, sev: g.sev })),
    twitchSide,
    structural: (by("face_width")[0] || null),
    summary: summarize(facial, side, branches, synk.length > 0)
  };
}

function summarize(facial, side, branches, synk) {
  const s = sideName(side);
  switch (facial) {
    case "peripheral": return `Upper and lower face both weaker on the ${s}: a peripheral (lower motor neuron) facial weakness pattern${synk ? ", with signs of synkinesis" : ""}.`;
    case "central": return `Lower face weaker on the ${s} while forehead movement is preserved: a central (upper motor neuron) pattern. The lesion would be on the opposite side of the brain.`;
    case "lower_only_untested": return `Lower face weaker on the ${s}. Forehead movement was not tested, so central vs peripheral cannot be separated yet.`;
    case "upper_only": return `Only the upper face is weaker on the ${s} (${branches.join(", ")} branch). Consider an isolated branch lesion, or an eyelid or brow problem not caused by the nerve.`;
    case "bilateral": return "Movement is reduced on both sides. Asymmetry scores can look normal in bilateral weakness, so check absolute movement carefully.";
    case "rest_only": return "Resting asymmetry only; no movements were tested yet.";
    default: return "No consistent facial weakness pattern detected.";
  }
}

/* ---------------- grading (facial nerve weakness only) ---------------- */
const ratioOf = (A, id, side) => {
  const s = A.steps[id];
  if (!s || !s.valid || !s.exc) return null;
  const [R, L] = s.exc, w = side === "R" ? R : L, o = side === "R" ? L : R;
  return o > 0 ? Math.min(1, w / o) : w > 0 ? 1 : 0;
};
const closureOf = (A, side) => {
  const s = A.steps.eye_tight && A.steps.eye_tight.valid ? A.steps.eye_tight : A.steps.eye_gentle;
  return s && s.valid && s.exc ? s.exc[side === "R" ? 0 : 1] : null;
};

export function grade(P, A, F) {
  if (!["peripheral", "central", "upper_only", "lower_only_untested"].includes(P.facial) || !P.side) return { applicable: false };
  const side = P.side;
  const f = ratioOf(A, "brow", side), m = ratioOf(A, "smile", side), c = closureOf(A, side);
  const synk = F.some(f2 => f2.type === "synkinesis" && f2.side === side && f2.sev >= 1);
  const known = [f, m, c].filter(v => v !== null).length;

  // House-Brackmann (estimated from forehead, eye closure and mouth movement)
  let hb = "II", why = [];
  const closed = c === null ? true : c >= T.closureComplete;
  if (m !== null && m < 0.05 && (f === null || f < 0.05) && (c === null || c < 0.3)) { hb = "VI"; why.push("no measurable movement"); }
  else if (m !== null && m < 0.25 && !closed) { hb = "V"; why.push("only slight mouth movement", "incomplete eye closure"); }
  else if (!closed || (f !== null && f < 0.15) || (m !== null && m < 0.5)) { hb = "IV"; if (!closed) why.push("incomplete eye closure"); if (f !== null && f < 0.15) why.push("little or no forehead movement"); if (m !== null && m < 0.5) why.push("clearly asymmetric mouth"); }
  else if ((m !== null && m < 0.75) || (f !== null && f < 0.5) || synk) { hb = "III"; if (synk) why.push("synkinesis"); if (m !== null && m < 0.75) why.push("mouth weak with maximum effort"); if (f !== null && f < 0.5) why.push("reduced forehead movement"); }
  else why.push("slight weakness only", "complete eye closure");
  if (P.facial === "central") why.push("note: House-Brackmann is designed for peripheral palsy");

  // Sunnybrook (estimated)
  const restA = A.rest && A.rest.valid ? A.rest.m : null;
  let rest = 0;
  if (restA) {
    const apRel = Math.abs(restA.apR - restA.apL) / Math.max(restA.apR, restA.apL);
    rest += apRel > 0.15 ? 1 : 0;
    const droop = Math.abs(restA.mcyR - restA.mcyL), lat = Math.abs(restA.mcxR - restA.mcxL);
    rest += grade3(lat, [0.04, 0.08, 0.14]) >= 2 ? 2 : grade3(lat, [0.04, 0.08, 0.14]) >= 1 ? 1 : 0;
    rest += grade3(droop, T.rest.droop) >= 1 ? 1 : 0;
  }
  const to5 = r => (r === null ? null : r < 0.1 ? 1 : r < 0.35 ? 2 : r < 0.65 ? 3 : r < 0.9 ? 4 : 5);
  const volItems = [["Brow lift", ratioOf(A, "brow", side)], ["Gentle eye closure", ratioOf(A, "eye_gentle", side)], ["Open mouth smile", ratioOf(A, "smile", side)], ["Snarl", ratioOf(A, "snarl", side)], ["Lip pucker", ratioOf(A, "pucker", side)]]
    .map(([n, r]) => ({ name: n, score: to5(r) }));
  const synkItems = volItems.map(v => {
    const stepId = { "Brow lift": "brow", "Gentle eye closure": "eye_gentle", "Open mouth smile": "smile", "Snarl": "snarl", "Lip pucker": "pucker" }[v.name];
    const s = F.find(f2 => f2.type === "synkinesis" && f2.step === stepId);
    return { name: v.name, score: s ? s.sev : 0 };
  });
  const volMeasured = volItems.filter(v => v.score !== null);
  const sb = {
    rest: rest * 5,
    voluntary: volMeasured.reduce((a, v) => a + v.score, 0) * 4,
    voluntaryMax: volMeasured.length * 20,
    synkinesis: synkItems.reduce((a, v) => a + v.score, 0),
    items: volItems, synkItems, complete: volMeasured.length === 5 && !!restA
  };
  sb.composite = sb.voluntary - sb.rest - sb.synkinesis;
  return { applicable: true, side, hb, hbWhy: why, inputs: { forehead: f, mouth: m, closure: c }, confidence: known === 3 ? "moderate" : "low", sunnybrook: sb };
}
