/* The reasoning engine: findings + history + bedside checks -> ranked possibilities per region,
   red flags, safety alerts and the next most useful checks. Rule-based and fully explainable. */
import { CONDITIONS } from "../knowledge/conditions.js";
import { HISTORY_Q } from "../knowledge/history.js";
import { REGIONS } from "./findings.js";
import { sideName } from "../i18n/index.js";

export const STRENGTH = s => (s >= 3 ? "strong" : s >= 1.5 ? "moderate" : s > 0.5 ? "possible" : "unsupported");
export const STRENGTH_LABEL = { strong: "Strong match", moderate: "Moderate match", possible: "Possible", unsupported: "Not supported by current findings" };
const URG_ORDER = { emergency: 0, urgent: 1, soon: 2, routine: 3 };

function makeCtx(F, P, history, checklist, patient) {
  return {
    F, P, h: history || {}, c: checklist || {}, age: Number(patient && patient.age) || 0, followup: !!patient && patient.reason === "followup",
    yes: k => (history || {})[k] === "yes",
    f: (type, side, step) => F.find(x => x.type === type && (!side || x.side === side || x.side === "both") && (!step || x.step === step))
  };
}

export function reason({ F, P, history, checklist, patient }) {
  const x = makeCtx(F, P, history, checklist, patient);
  const results = CONDITIONS.map(c => {
    let r;
    try { r = c.match(x); } catch (e) { r = { score: 0, why: [], against: ["Rule error: " + e.message] }; }
    const score = Math.round(r.score * 10) / 10;
    const ask = (c.ask || []).filter(k => x.h[k] === undefined && HISTORY_Q[k]).map(k => HISTORY_Q[k].q);
    return { id: c.id, name: c.name, category: c.category, regions: c.regions, urgency: c.urgency, about: c.about, confirm: c.confirm,
      score, strength: STRENGTH(score), why: r.why, against: r.against, ask };
  }).sort((a, b) => b.score - a.score);

  const supported = results.filter(r => r.strength !== "unsupported");
  const byRegion = REGIONS.map(reg => ({
    ...reg,
    findings: F.filter(f => f.region === reg.id),
    possible: supported.filter(r => r.regions.includes(reg.id)),
    unsupported: results.filter(r => r.strength === "unsupported" && r.regions.includes(reg.id))
  }));

  const flags = redFlags(x, results);
  const next = [];
  for (const r of supported.slice(0, 5)) for (const c of r.confirm) if (!next.includes(c) && next.length < 8) next.push(c);
  return { results, supported, byRegion, flags, next };
}

function redFlags(x, results) {
  const out = [], get = id => results.find(r => r.id === id);
  const push = (level, title, text) => out.push({ level, title, text });
  const P = x.P;

  const stroke = get("stroke");
  if ((stroke.strength === "strong" && x.h.onset !== "gradual" && x.h.onset !== "congenital") ||
      (x.h.onset === "sudden" && (x.yes("limb_weakness") || x.yes("speech_change"))))
    push("emergency", "Possible stroke", "Follow your emergency stroke pathway now. Record the time the patient was last known to be well. Do not wait to finish this assessment.");

  const cn3 = get("cn3");
  if (cn3.score >= 2.5 && (x.c.pupils === P.ptosisSide + "_larger" || x.yes("headache")))
    push("emergency", "Third nerve palsy with pupil involvement or headache", "This can be caused by an expanding aneurysm. Arrange emergency imaging.");

  if (P.ptosisSide && x.yes("neck_pain") && get("horner").score >= 1.5)
    push("emergency", "Possible painful Horner syndrome", "Horner's with recent neck pain can mean carotid artery dissection. Emergency referral.");

  if (P.bilateral && (x.yes("limb_weakness") || x.c.limbs === "weakBoth"))
    push("emergency", "Bilateral facial weakness with limb weakness", "Consider Guillain-Barré syndrome. Check breathing and swallowing and refer urgently to hospital.");

  if (x.yes("breathing")) push("emergency", "Breathing difficulty", "Shortness of breath or a weak cough with facial or bulbar weakness needs emergency assessment.");

  if (x.yes("swallowing") || x.c.swallow === "fail" || get("bulbar").strength !== "unsupported" && get("bulbar").score >= 2)
    push("urgent", "Aspiration risk", "Swallowing may be unsafe. Keep the patient nil by mouth until a swallow assessment is done.");

  if (get("ramsay_hunt").score >= 2.5) push("urgent", "Possible Ramsay Hunt syndrome", "Antiviral and steroid treatment works best when started early. Same-day medical review.");

  const bells = get("bells");
  if (bells.score >= 2.5 && (x.h.duration === "lt72h" || ((x.h.duration === undefined || x.h.duration === "unknown") && !x.followup)))
    push("urgent", "Peripheral facial palsy: treatment window", "If onset was within 72 hours, steroids should be considered today. Refer for same-day medical review.");

  if (get("myasthenia").score >= 3 && (x.yes("swallowing") || x.yes("breathing")))
    push("emergency", "Myasthenia with bulbar symptoms", "Risk of myasthenic crisis. Emergency medical review.");

  const closure = x.F.filter(f => f.type === "incomplete_closure");
  if (closure.length) push("alert", "Protect the eye", `The ${[...new Set(closure.map(f => sideName(f.side)))].join(" and ")} eye does not close fully. Advise lubricating drops by day and ointment with taping at night. A red or painful eye needs same-day eye review.`);

  return out.sort((a, b) => (URG_ORDER[a.level] ?? 9) - (URG_ORDER[b.level] ?? 9));
}
