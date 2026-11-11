/* Short result shown under the step card right after a recording. */
import { t } from "../i18n/index.js";
import { html, pct } from "../util.js";
import { STEP } from "../exam/protocol.js";
import { T, SEV } from "../engine/thresholds.js";
import { mm } from "../engine/findings.js";

export function stepSummary(app, id) {
  const s = app.session, step = STEP[id], c = app.c;
  if (s.skipped[id]) return html`<div class="stepres mute">${t("Skipped.")}</div>`.s;
  const rec = s.records[id];
  if (!rec && step.kind !== "rate") return "";
  const a = id === "rest" ? c.A.rest : c.A.steps[id];
  const lines = [];
  if (a && !a.valid && step.kind !== "rate") lines.push(html`<div class="flag urgent">${t(a.reason || "Not enough usable frames.")} ${t("Record again.")}</div>`);
  else if (a && a.q && a.q.total && a.q.ratio < T.validFrameRatio) lines.push(html`<div class="flag urgent">${t("Low quality: only {p}% of frames were usable (face lost {nf}, head turned {bp}). Consider recording again.", { p: pct(a.q.ratio), nf: a.q.noFace, bp: a.q.badPose })}</div>`);

  if (a && a.valid) {
    if (id === "rest") lines.push(html`<div class="mute">${t("Frames used: {n}", { n: a.q.ok })}${a.usedAllFrames ? " · " + t("patient was not fully still; all usable frames were used") : ""}</div>`);
    else if (step.kind === "move" && a.exc && id !== "jaw") {
      const unit = id.startsWith("eye") ? v => pct(v) + "% " + t("closed") : v => mm(v);
      lines.push(html`<div>${t("Right")} <b>${unit(a.exc[0])}</b> · ${t("Left")} <b>${unit(a.exc[1])}</b> · ${t("Symmetry")} <b>${pct(a.sym)}%</b></div>`);
    } else if (id === "jaw") lines.push(html`<div>${t("Opening")} <b>${mm(a.open)}</b> · ${t("Chin shift")} <b>${mm(a.dev)}</b> ${a.dev > 0 ? t("to patient's left") : t("to patient's right")}</div>`);
    else if (step.kind === "gaze") lines.push(html`<div>${t("Right eye")} <b>${a.exc[0]}</b> · ${t("Left eye")} <b>${a.exc[1]}</b> · ${t("Symmetry")} <b>${pct(a.sym)}%</b> · ${t("head moved {d}°", { d: a.headMoved })}</div>`);
    else if (step.kind === "sustain") lines.push(html`<div>${t("Lid drop over {s} s", { s: a.seconds })}: ${t("Right")} <b>${mm(a.drop[0])}</b> · ${t("Left")} <b>${mm(a.drop[1])}</b></div>`);
    else if (step.kind === "repeat") lines.push(html`<div>${t("{n} repetitions detected", { n: a.reps })}${a.decline ? html` · ${t("decline")} ${t("Right")} <b>${pct(a.decline[0])}%</b> · ${t("Left")} <b>${pct(a.decline[1])}%</b>` : ""}</div>`);
    else if (step.kind === "observe") lines.push(html`<div>${t("{b} blinks per minute", { b: a.blinkRate })} · ${t("one-sided eye events")} R ${a.eyeTwitch.R} / L ${a.eyeTwitch.L} · ${t("mouth events")} R ${a.mouthTwitch.R} / L ${a.mouthTwitch.L}</div>`);
    else if (step.kind === "rate" && a.tongueSeen === false) lines.push(html`<div class="mute">${t("The camera did not detect the tongue in the captured photo.")}</div>`);
  }

  const fs = c.F0.filter(f => f.step === id);
  if (fs.length) lines.push(html`<ul style="margin:6px 0 0;padding-inline-start:18px">${fs.map(f => html`<li>${t(f.text)} <span class="pill s${f.sev}">${t(SEV[f.sev])}</span></li>`)}</ul>`);
  else if (a && a.valid && step.kind !== "rate") lines.push(html`<div style="color:var(--em)">${t("No asymmetry above threshold in this step.")}</div>`);
  if (rec && rec.evidence) lines.push(html`<img src="${rec.evidence}" alt="${t("Evidence frame for {s}", { s: t(step.title) })}">`);
  return html`<div class="stepres">${lines}</div>`.s;
}
