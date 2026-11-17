/* Builds the LLM prompt from a therapist-led session. Sent: the therapist's own capture labels and notes,
   neutral left/right measurements, case notes, the therapist's history fields, ticked safety items and an
   optional question. Never sent: images, video, name or record number. */

export const RESPONSE_SHAPE = {
  answer: "direct reply to the therapist's question; empty string if no question was asked",
  summary: "2-4 sentences: what the captures show, citing the numbers you rely on",
  weaker_side: "right | left | both | none (the PATIENT'S side)",
  possibilities: [{ condition: "name", why: "one sentence citing captures or notes", urgency: "emergency | urgent | soon | routine" }],
  red_flags: ["only problems needing emergency or same-day action; [] if none"],
  next_captures: [{ label: "short instruction the therapist can give the patient on camera", why: "what it would clarify", seconds: "0 for a photo, else 3-30" }],
  bedside_checks: ["checks the camera cannot do (e.g. sensation, pupils, otoscopy), at most 5"]
};

export const SYSTEM_PROMPT = `You assist a therapist or doctor who is examining a patient's face with a camera-based measurement tool.
The therapist decides what to examine. Each capture is a task the therapist chose (named in their own words), measured by the camera.
The tool reports neutral numbers only: right and left values and how much less one side measured or moved. It has no normal ranges or cut-offs, so you must interpret the numbers yourself and say which ones you rely on.
Rules:
- You never make a diagnosis. You suggest possibilities to examine, most likely first (at most 5), and say what would confirm or exclude them.
- Use only the information given. Do not invent findings, history or test results. If the data is too thin, say so and suggest captures that would help.
- "Right" and "left" always mean the PATIENT'S own sides. Small differences (a few percent or under about 1 mm) are common in healthy faces.
- Camera numbers are estimates; cheek and eye-position values are the least reliable.
- Suggest next captures that fit what the therapist is already doing; keep labels short and patient-friendly. Never repeat a capture already done.
- Put anything needing emergency or same-day action in red_flags.
- Be concise, plain clinical English. Never repeat an item. Lists: possibilities max 5, next_captures max 4, bedside_checks max 5, red_flags max 3.
Reply with a single JSON object only, no markdown, with exactly these keys:
${JSON.stringify(RESPONSE_SHAPE, null, 2)}`;

const sgn = v => (v > 0 ? "+" + v : String(v));
const sideWord = s => (s === "R" ? "right" : s === "L" ? "left" : "");

function captureText(c) {
  const lines = [];
  const kind = c.reference ? "REFERENCE capture (absolute values)" : c.mode === "change" ? "change from the reference capture" : "absolute values (no reference recorded)";
  lines.push(`Capture "${c.label}" (${kind}; ${c.q ? c.q.ok : 0} usable frames${c.timeline ? `, ${c.timeline.seconds} s` : ""}).`);
  if (c.notes) lines.push(`  Therapist's notes: ${c.notes}`);
  if (!c.valid) { lines.push(`  Not measurable: ${c.reason}`); return lines.join("\n"); }
  // send only measurable rows; for movement captures the 6 largest changes (the rest are below camera precision or small)
  const rows = c.rows.filter(r => r.comparable && !r.invalid), sent = c.mode === "change" ? rows.slice(0, 6) : rows;
  if (!sent.length) lines.push("  No measurable change (all values below camera precision).");
  for (const r of sent) {
    const u = r.unit ? " " + r.unit : "";
    const val = v => (c.mode === "change" ? sgn(v) : v);
    lines.push(`  ${r.name}: right ${val(r.R)}${u}, left ${val(r.L)}${u}${r.smaller && r.diff ? ` (${sideWord(r.smaller)} ${r.diff}% ${c.mode === "change" ? "less movement" : "smaller"})` : " (equal)"}`);
  }
  if (c.mode === "change" && rows.length > sent.length) lines.push(`  (${rows.length - sent.length} smaller measurable changes not listed)`);
  const mid = (c.midline || []).filter(m => Number.isFinite(m.value)).map(m => `${m.name} ${c.mode === "change" ? sgn(m.value) : m.value} mm`);
  if (mid.length) lines.push(`  Midline: ${mid.join("; ")}`);
  if (c.timeline) {
    const t = c.timeline;
    lines.push(`  Over time: ${t.blinksPerMin} blinks/min; one-sided eye closures right ${t.oneSidedEyeClosures.R}, left ${t.oneSidedEyeClosures.L}; start-to-end change: upper lid right ${sgn(t.startToEnd.upperLidR)} mm, left ${sgn(t.startToEnd.upperLidL)} mm; mouth corner height right ${sgn(t.startToEnd.mouthCornerHeightR)} mm, left ${sgn(t.startToEnd.mouthCornerHeightL)} mm`);
  }
  return lines.join("\n");
}

/** caseData: { patient, notes, fields: [{label, value}], safety: [text], captures: [summaries], done: [labels], question } */
export function caseText(d) {
  const p = d.patient || {}, lines = [];
  lines.push(`Patient: ${p.age ? p.age + "-year-old " : ""}${p.sex || "sex not recorded"}.`);
  lines.push("", "Therapist's case notes:", d.notes && d.notes.trim() ? d.notes.trim() : "(none)");
  const fields = (d.fields || []).filter(f => f.value !== undefined && f.value !== "" && f.value !== null);
  if (fields.length) { lines.push("", "Therapist's history fields:"); for (const f of fields) lines.push(`- ${f.label}: ${f.value}`); }
  lines.push("", "Safety items ticked by the therapist:", (d.safety || []).length ? d.safety.map(s => "- " + s).join("\n") : "(none)");
  const caps = d.captures || [];
  lines.push("", `Captures (${caps.length}):`);
  if (caps.length) for (const c of caps) lines.push(captureText(c)); else lines.push("(none recorded yet)");
  if ((d.planned || []).length) lines.push("", `Planned but not yet recorded: ${d.planned.join("; ")}`);
  if (d.question && d.question.trim()) lines.push("", `THE THERAPIST ASKS: ${d.question.trim()}`);
  return lines.join("\n");
}

export function buildMessages(caseData) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `CASE\n${caseText(caseData)}\n\nReturn the JSON object now.` }
  ];
}
